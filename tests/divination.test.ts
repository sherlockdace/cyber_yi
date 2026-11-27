import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCorpus, readCast, tossCoins, withOriginals } from '../src/divination';
const text = readFileSync(new URL('../data/zhouyi.jsonl', import.meta.url), 'utf8');
const corpus = loadCorpus(text);
test('eight equal coin permutations give 1:3:3:1 distribution', () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8; i++) {
        let j = 0;
        const values = tossCoins(() => (i >> (j++ % 3)) & 1);
        assert.ok(values.every(v => v === values[0]));
        counts[values[0] - 6]++;
    }
    assert.deepEqual(counts, [1, 3, 3, 1]);
});
test('known figures, ordering, roles and special passages', () => {
    const cases: [
        number[],
        number,
        number | null,
        [
            number,
            string,
            string
        ][]
    ][] = [
        [[7, 7, 7, 7, 7, 7], 1, null, [[1, '卦辞', '主']]],
        [[9, 7, 7, 7, 7, 7], 1, 44, [[1, '初九', '主']]],
        [[7, 9, 7, 7, 7, 7], 1, 13, [[1, '九二', '主']]],
        [[9, 9, 7, 7, 7, 7], 1, 33, [[1, '九二', '主'], [1, '初九', '辅']]],
        [[9, 8, 8, 6, 9, 8], 3, 16, [[3, '卦辞', '贞'], [16, '卦辞', '悔']]],
        [[9, 9, 9, 9, 7, 7], 1, 20, [[20, '九五', '主'], [20, '上九', '辅']]],
        [[9, 9, 9, 9, 9, 7], 1, 23, [[23, '上九', '主']]],
        [[9, 9, 9, 9, 9, 9], 1, 2, [[1, '用九', '主']]],
        [[6, 6, 6, 6, 6, 6], 2, 1, [[2, '用六', '主']]],
        [[9, 6, 6, 6, 9, 6], 3, 50, [[50, '卦辞', '主']]],
    ];
    for (const [values, primary, changed, passages] of cases) {
        const result = readCast(values, corpus);
        assert.equal(result.primary.number, primary);
        assert.equal(result.changed?.number ?? null, changed);
        assert.deepEqual(result.passages.map(p => [p.hexagram_number, p.label, p.role]), passages);
    }
    const heng = readCast([8, 9, 7, 7, 8, 8], corpus).passages[0];
    assert.equal(heng.text, '悔亡。');
    assert.match(heng.commentary.小象, /能久中也/);
});
test('all 4096 casts preserve orientation, flipping, evidence and originals', () => {
    const counts = Array(7).fill(0);
    for (let code = 0; code < 4096; code++) {
        const values = Array.from({ length: 6 }, (_, i) => 6 + ((code >> (i * 2)) & 3));
        const r = readCast(values, corpus);
        const moved = r.moving_lines.length;
        counts[moved]++;
        assert.equal(r.primary.pattern, values.map(v => v % 2).join(''));
        assert.equal(r.changed !== null, moved > 0);
        if (r.changed)
            assert.equal(r.changed.pattern, values.map(v => v === 6 ? 1 : v === 9 ? 0 : v % 2).join(''));
        assert.equal(r.passages.length, [2, 3, 4].includes(moved) ? 2 : 1);
        for (const p of r.passages) {
            assert.ok(p.text);
            assert.ok(p.commentary[p.label === '卦辞' ? '彖传' : '小象']);
        }
        assert.equal(withOriginals(r, corpus).originals.primary.lines.length, 6);
    }
    assert.deepEqual(counts, [64, 384, 960, 1280, 960, 384, 64]);
});
test('reject invalid casts and malformed corpus', () => {
    for (const values of [null, [], [7, 7, 7, 7, 7], [7, 7, 7, 7, 7, 10], [7, 7, 7, 7, 7, true], [7, 7, 7, 7, 7, '7'], [7, 7, 7, 7, 7, 6.5]])
        assert.throws(() => readCast(values, corpus));
    const rows = text.trim().split('\n');
    assert.throws(() => loadCorpus(rows.slice(1).join('\n')));
    assert.throws(() => loadCorpus([...rows, rows[0]].join('\n')));
    const first = JSON.parse(rows[0]);
    first.commentary.lines.pop();
    assert.throws(() => loadCorpus([JSON.stringify(first), ...rows.slice(1)].join('\n')));
});
