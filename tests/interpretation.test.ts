import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCorpus, readCast } from '../src/divination';
import { loadSettings, loadPrompts } from '../src/config';
import { completionUrl, interpret, messages, readSSE } from '../src/interpretation';
const settings = loadSettings(readFileSync(new URL('../config/settings.yaml', import.meta.url), 'utf8'));
const prompts = loadPrompts(readFileSync(new URL('../config/prompts.yaml', import.meta.url), 'utf8'));
const corpus = loadCorpus(readFileSync(new URL('../data/zhouyi.jsonl', import.meta.url), 'utf8'));
const reading = readCast([9, 7, 7, 7, 7, 7], corpus);
const model = { base_url: 'https://example.test/v1/', name: 'test-model', apiKey: 'test-placeholder' };
/** Encode parts as one-byte network chunks; return a response testing all UTF-8 and newline boundaries. */
function response(parts: string[]): Response {
    const bytes = new TextEncoder().encode(parts.join(''));
    return new Response(new ReadableStream({
        /** Enqueue bytes into controller and close the mocked network stream. */
        start(controller) { for (const byte of bytes)
            controller.enqueue(new Uint8Array([byte])); controller.close(); },
    }));
}
/** Format delta text and optional finish reason as one SSE event; return serialized wire data. */
function event(delta: Record<string, string>, finish: string | null = null): string {
    return `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\r\n\r\n`;
}
/** Collect all deltas produced by generator, rejecting when its model request fails. */
async function collect(generator: AsyncIterable<unknown>): Promise<unknown[]> {
    const results = [];
    for await (const item of generator)
        results.push(item);
    return results;
}
test('request includes canonical evidence; streaming preserves thinking and Chinese text', async () => {
    const before = JSON.stringify(reading);
    const output = await collect(interpret('如何准备？', reading, model, settings.model, prompts, async (url, init) => {
        assert.equal(url, 'https://example.test/v1/chat/completions');
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-placeholder');
        assert.equal(init?.redirect, 'error');
        const body = JSON.parse(init?.body as string);
        assert.equal(body.model, 'test-model');
        assert.equal(body.stream, true);
        assert.ok(body.messages[1].content.startsWith('如何准备？'));
        assert.match(body.messages[1].content, /乾·初九/);
        assert.match(body.messages[1].content, /潛龍勿用/);
        assert.match(body.messages[1].content, /变卦：姤/);
        return response([': keepalive\r\n\r\n', event({ reasoning_content: '思考中' }), event({ content: '解读正文' }), event({}, 'stop'), 'data: [DONE]\r\n\r\n']);
    }));
    assert.deepEqual(output, [{ type: 'reasoning_content', text: '思考中' }, { type: 'content', text: '解读正文' }]);
    assert.equal(JSON.stringify(reading), before);
});
test('SSE handles multiline data and ignores unfinished events', async () => {
    assert.deepEqual(await collect(readSSE(response(['data: first\rdata: second\r\rdata: unfinished']))), ['first\nsecond']);
});
test('failed requests retain original cast and allow retry', async () => {
    const before = JSON.stringify(reading);
    for (const [stream, pattern] of [
        [event({ content: '部分' }), /提前结束/],
        [event({}, 'stop'), /没有返回/],
        [event({ content: '部分' }, 'length'), /长度上限/],
        ['data: invalid\n\n', /格式无效/],
        [event({}, 'content_filter'), /未完整/],
    ] as const) {
        await assert.rejects(collect(interpret('问题', reading, model, settings.model, prompts, async () => response([stream]))), pattern);
        assert.equal(JSON.stringify(reading), before);
    }
    for (const [code, pattern] of [[401, /认证/], [429, /限流/], [500, /HTTP 500/]] as const) {
        await assert.rejects(collect(interpret('问题', reading, model, settings.model, prompts, async () => new Response('private-provider-error', { status: code }))), pattern);
    }
    await assert.rejects(collect(interpret('问题', reading, model, settings.model, prompts, async () => { throw new TypeError('secret'); })), /CORS/);
    await collect(interpret('问题', reading, model, settings.model, prompts, async () => response([event({ content: '重试成功' }, 'stop')])));
    assert.equal(JSON.stringify(reading), before);
});
test('deadline aborts the actual request', async () => {
    await assert.rejects(collect(interpret('问题', reading, model, { ...settings.model, timeout: 0.01 }, prompts, async (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }))), /超时/);
});
test('configuration and URL validation reject unsafe or invalid input', () => {
    assert.equal(completionUrl('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434/v1/chat/completions');
    for (const url of ['http://example.test', 'https://user:pass@example.test', 'https://example.test?key=x', 'javascript:alert(1)'])
        assert.throws(() => completionUrl(url));
    assert.throws(() => loadSettings('max_question_length: false'));
    assert.throws(() => loadSettings('max_question_length: 1000\nmodel: {base_url: "", name: "", timeout: 1, generation: {temperature: .nan}}'));
    assert.throws(() => loadSettings('max_question_length: 1000\nmodel: {base_url: "", name: "", timeout: 1, generation: {messages: []}}'));
    assert.throws(() => loadPrompts('system: hello\nuser: "{{ question }} {{ unknown }}"'));
    assert.ok(messages('{{ cast }}', reading, prompts)[1].content.startsWith('{{ cast }}'));
});
