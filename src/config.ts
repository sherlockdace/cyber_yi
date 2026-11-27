import { parse } from 'yaml';
import { requiredText } from './divination';
export interface Settings {
    max_question_length: number;
    model: {
        base_url: string;
        name: string;
        timeout: number;
        generation: Record<string, unknown>;
    };
}
export interface Prompts {
    system: string;
    user: string;
}
/** Parse public settings YAML text; return validated defaults or throw for invalid fields. No credentials are loaded. */
export function loadSettings(text: string): Settings {
    const value = parse(text);
    if (!value || !Number.isInteger(value.max_question_length) || value.max_question_length < 1 || value.max_question_length > 8000)
        throw new Error('问题长度配置须为 1–8000 的整数');
    const m = value.model;
    if (!m || typeof m.base_url !== 'string' || typeof m.name !== 'string' || typeof m.timeout !== 'number' || !Number.isFinite(m.timeout) || m.timeout <= 0 || m.timeout > 86400)
        throw new Error('模型配置无效，超时须在 0–86400 秒之间');
    if (!m.generation || typeof m.generation !== 'object' || Array.isArray(m.generation))
        throw new Error('generation 必须为对象');
    const allowed = new Set(['max_tokens', 'max_completion_tokens', 'temperature', 'top_p', 'stop', 'reasoning_effort', 'thinking']);
    for (const key of Object.keys(m.generation))
        if (!allowed.has(key))
            throw new Error(`不支持的模型参数：${key}`);
    for (const key of ['max_tokens', 'max_completion_tokens']) {
        const v = m.generation[key];
        if (v !== undefined && (!Number.isInteger(v) || v < 1))
            throw new Error(`${key} 须为正整数`);
    }
    const { temperature, top_p, stop, thinking, reasoning_effort } = m.generation;
    if (temperature !== undefined && (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2))
        throw new Error('temperature 须在 0–2 之间');
    if (top_p !== undefined && (typeof top_p !== 'number' || !(top_p > 0 && top_p <= 1)))
        throw new Error('top_p 须在 (0,1] 之间');
    if (stop !== undefined && !(typeof stop === 'string' && stop.length > 0) && !(Array.isArray(stop) && stop.length > 0 && stop.length <= 16 && stop.every(v => typeof v === 'string' && v.length > 0)))
        throw new Error('stop 须为非空文本或文本数组');
    if (thinking !== undefined && (!thinking || !['enabled', 'disabled'].includes(thinking.type)))
        throw new Error('thinking.type 须为 enabled 或 disabled');
    if (reasoning_effort !== undefined)
        requiredText(reasoning_effort);
    return value;
}
/** Parse prompts YAML text and require the question, cast and passages placeholders; return validated templates or throw. */
export function loadPrompts(text: string): Prompts {
    const value = parse(text);
    const system = requiredText(value?.system);
    const user = requiredText(value?.user);
    const variables = [...user.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]);
    const rest = user.replace(/\{\{\s*(\w+)\s*\}\}/g, '');
    if (new Set(variables).size !== 3 || !['question', 'cast', 'passages'].every(v => variables.includes(v)) || rest.includes('{{') || rest.includes('}}'))
        throw new Error('提示模板需要 question、cast 和 passages 占位符');
    return { system, user };
}
