import { lineLabel, requiredText, type Reading } from './divination';
import type { Prompts, Settings } from './config';
export interface ModelConfig {
    base_url: string;
    name: string;
    apiKey: string;
}
export interface ModelEvent {
    type: 'reasoning_content' | 'content';
    text: string;
}
/** Validate baseUrl as HTTPS (or loopback HTTP) API root; return the completions URL or throw. */
export function completionUrl(baseUrl: string): string {
    const url = new URL(requiredText(baseUrl));
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash)
        throw new Error('端点须为 HTTPS API 根地址（本机可用 HTTP），不能含凭据、查询或片段');
    url.pathname = url.pathname.replace(/\/+$/, '') + '/chat/completions';
    return url.href;
}
/** Render messages from question, deterministic reading and validated prompts, preserving canonical evidence. */
export function messages(question: string, reading: Reading, prompts: Prompts): {
    role: string;
    content: string;
}[] {
    const p = reading.primary;
    const cast = [`本卦：${p.name}（第${p.number}卦，${p.upper}上${p.lower}下）`];
    const c = reading.changed;
    if (c)
        cast.push(`变卦：${c.name}（第${c.number}卦，${c.upper}上${c.lower}下）`);
    cast.push('六爻（从初爻到上爻）：' + reading.values.join('、'));
    cast.push(reading.moving_lines.length ? `动爻：${reading.moving_lines.length} 爻（${reading.moving_lines.map(i => lineLabel(p, i)).join('、')}）` : '动爻：无');
    const roles = { 主: '主读', 辅: '参读', 贞: '贞，本卦', 悔: '悔，变卦' };
    const passages = reading.passages.map(item => [`${item.hexagram_name}·${item.label}（${roles[item.role]}）：${item.text}`, ...Object.entries(item.commentary).map(([name, text]) => `${name}：${text}`)].join('\n')).join('\n\n');
    const values: Record<string, string> = { question, cast: cast.join('\n'), passages };
    return [{ role: 'system', content: prompts.system }, { role: 'user', content: prompts.user.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => values[key]) }];
}
/** Decode SSE data fields from response, preserving split UTF-8 and CR/LF boundaries; cancel the reader on exit. */
export async function* readSSE(response: Response): AsyncGenerator<string> {
    if (!response.body)
        throw new Error('模型返回空响应');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let data: string[] = [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            let match: RegExpExecArray | null;
            while ((match = /\r\n|\r|\n/.exec(buffer))) {
                if (!done && match[0] === '\r' && match.index === buffer.length - 1)
                    break;
                const line = buffer.slice(0, match.index);
                buffer = buffer.slice(match.index + match[0].length);
                if (line === '') {
                    if (data.length)
                        yield data.join('\n');
                    data = [];
                }
                else if (line.startsWith('data:'))
                    data.push(line.slice(5).replace(/^ /, ''));
            }
            // SSE requires a blank line to dispatch an event; an unfinished event is discarded.
            if (done)
                break;
        }
    }
    finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
/** Stream question/reading to model using defaults, prompts and injected fetcher; yield text deltas or throw safe errors. Keys are only sent to the explicit endpoint. */
export async function* interpret(question: string, reading: Reading, model: ModelConfig, defaults: Settings['model'], prompts: Prompts, fetcher: typeof fetch = fetch): AsyncGenerator<ModelEvent> {
    const endpoint = completionUrl(model.base_url);
    const name = requiredText(model.name);
    const key = requiredText(model.apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), defaults.timeout * 1000);
    let finished = false;
    let hasAnswer = false;
    try {
        let response: Response;
        try {
            response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ ...defaults.generation, model: name, messages: messages(question, reading, prompts), stream: true }) });
        }
        catch {
            throw new Error(controller.signal.aborted ? '模型服务超时，可用原卦重试' : '无法连接模型，请检查端点、网络及服务商 CORS 支持');
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(response.status === 401 || response.status === 403 ? '模型认证失败，请检查密钥及权限' : response.status === 429 ? '模型服务限流，请稍后用原卦重试' : `模型服务返回 HTTP ${response.status}，可用原卦重试`);
        }
        for await (const data of readSSE(response)) {
            if (data === '[DONE]')
                break;
            let chunk;
            try {
                chunk = JSON.parse(data);
            }
            catch {
                throw new Error('模型流式响应格式无效');
            }
            if (chunk?.error)
                throw new Error('模型服务报告错误，可用原卦重试');
            const choice = chunk?.choices?.[0];
            if (!choice)
                continue;
            for (const type of ['reasoning_content', 'content'] as const) {
                const text = choice.delta?.[type];
                if (typeof text === 'string' && text) {
                    if (type === 'content' && text.trim())
                        hasAnswer = true;
                    yield { type, text };
                }
            }
            if (choice.finish_reason === 'length')
                throw new Error('模型达到输出长度上限，请调整参数后用原卦重试');
            if (choice.finish_reason != null && choice.finish_reason !== 'stop')
                throw new Error('模型解读未完整生成，可用原卦重试');
            if (choice.finish_reason === 'stop')
                finished = true;
        }
        if (!finished)
            throw new Error('模型连接提前结束，可用原卦重试');
        if (!hasAnswer)
            throw new Error('模型没有返回解读正文，可用原卦重试');
    }
    catch (error) {
        if (controller.signal.aborted)
            throw new Error('模型服务超时，可用原卦重试');
        if (error instanceof TypeError)
            throw new Error('模型连接中断，可用原卦重试');
        throw error;
    }
    finally {
        clearTimeout(timeout);
        controller.abort();
    }
}
