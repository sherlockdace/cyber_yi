import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { build } from 'vite';

/** Wait until predicate reports the simulated page settled; throw after one second. */
async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Page did not settle');
}

test('bundled page preserves private state across navigation, streams safely and clears credentials', async () => {
    const result = await build({ logLevel: 'silent', build: { write: false } });
    assert.ok(!Array.isArray(result) && 'output' in result);
    const entry = result.output.find(item => item.type === 'chunk' && item.isEntry);
    assert.ok(entry && entry.type === 'chunk');
    const dom = new JSDOM(readFileSync('index.html', 'utf8'), { url: 'https://example.test/cyber-yi/', runScripts: 'outside-only' });
    const { window } = dom;
    let requests = 0;
    let fail = false;
    let lastBody = '';
    Object.assign(window, { TextDecoder, TextEncoder, AbortController });
    window.fetch = async (_url, options) => {
        requests++;
        lastBody = options?.body as string;
        if (fail) return new Response('', { status: 401 });
        const chunk = { choices: [{ delta: { reasoning_content: '思考', content: '**正文** <script>bad()</script>' }, finish_reason: 'stop' }] };
        return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`);
    };
    /** Return a typed simulated DOM element selected by id, or fail this test. */
    function element<T extends HTMLElement>(id: string): T {
        const node = window.document.getElementById(id);
        assert.ok(node);
        return node as unknown as T;
    }
    /** Set the input identified by id to value and dispatch its normal input event. */
    function input(id: string, value: string): void {
        element<HTMLInputElement>(id).value = value;
        element(id).dispatchEvent(new window.Event('input', { bubbles: true }));
    }
    try {
        window.eval(entry.code);
        assert.equal(element('cast-view').hidden, false);
        assert.equal(element('method-view').hidden, true);
        assert.equal(element<HTMLButtonElement>('cast-button').disabled, false);
        input('question', '如何准备面谈？');
        element('cast-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        assert.equal(element('status').textContent, '已起卦。');
        assert.equal(element('result').hidden, false);
        assert.ok(element('passages').textContent);
        const values = element('cast-values').textContent;
        assert.equal(requests, 0);
        input('model-endpoint', 'https://model.example.test/v1');
        input('model-name', 'mock-model');
        input('model-key', 'test-placeholder');
        assert.equal(element<HTMLButtonElement>('interpret-button').disabled, false);
        element('interpret-button').click();
        await waitFor(() => element('status').textContent === '已完成解读。');
        assert.equal(requests, 1);
        assert.match(lastBody, /如何准备面谈/);
        assert.equal(element('answer-text').querySelector('strong')?.textContent, '正文');
        assert.equal(element('answer-text').querySelector('script'), null);
        assert.match(element('answer-text').textContent!, /<script>/);
        const answer = element('answer-text').innerHTML;
        element('method-nav').click();
        await waitFor(() => !element('method-view').hidden);
        assert.equal(window.location.hash, '#method');
        assert.equal(element('cast-view').hidden, true);
        assert.equal(element('method-nav').getAttribute('aria-current'), 'page');
        assert.equal(window.document.activeElement?.id, 'overview-title');
        assert.equal(window.document.title, '起卦原理 · 赛博周易');
        window.history.back();
        await waitFor(() => !element('cast-view').hidden);
        window.history.forward();
        await waitFor(() => !element('method-view').hidden);
        element('cast-nav').click();
        await waitFor(() => !element('cast-view').hidden);
        assert.equal(window.document.activeElement?.id, 'intro-title');
        assert.equal(element('cast-nav').getAttribute('aria-current'), 'page');
        assert.equal(element('method-nav').hasAttribute('aria-current'), false);
        assert.equal(window.document.title, '赛博周易');
        assert.equal(element<HTMLTextAreaElement>('question').value, '如何准备面谈？');
        assert.equal(element<HTMLInputElement>('model-endpoint').value, 'https://model.example.test/v1');
        assert.equal(element<HTMLInputElement>('model-name').value, 'mock-model');
        assert.equal(element<HTMLInputElement>('model-key').value, 'test-placeholder');
        assert.equal(element('cast-values').textContent, values);
        assert.equal(element('answer-text').innerHTML, answer);
        assert.equal(requests, 1);
        assert.equal(window.localStorage.length, 0);
        assert.equal(window.sessionStorage.length, 0);
        assert.equal(window.document.cookie, '');
        fail = true;
        element('interpret-button').click();
        await waitFor(() => element('status').textContent === '解读未完成。');
        assert.match(element('answer-status').textContent!, /认证/);
        assert.equal(element('cast-values').textContent, values);
        fail = false;
        element('interpret-button').click();
        await waitFor(() => element('status').textContent === '已完成解读。');
        assert.equal(element('cast-values').textContent, values);
        input('question', '新问题');
        assert.equal(element<HTMLButtonElement>('interpret-button').disabled, true);
        // A fresh document at the guide URL has no state from the previous page.
        const fresh = new JSDOM(readFileSync('index.html', 'utf8'), { url: 'https://example.test/cyber-yi/#method', runScripts: 'outside-only' });
        try {
            fresh.window.eval(entry.code);
            assert.equal(fresh.window.document.getElementById('method-view')?.hidden, false);
            assert.equal(fresh.window.document.getElementById('cast-view')?.hidden, true);
            assert.equal((fresh.window.document.getElementById('model-key') as HTMLInputElement).value, '');
            assert.equal((fresh.window.document.getElementById('question') as HTMLTextAreaElement).value, '');
            assert.equal(fresh.window.document.getElementById('result')?.hidden, true);
        } finally {
            fresh.window.close();
        }
        element('clear-key').click();
        assert.equal(element<HTMLInputElement>('model-key').value, '');
        assert.equal(element<HTMLButtonElement>('interpret-button').disabled, true);
    } finally {
        window.close();
    }
});
