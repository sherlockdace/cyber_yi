/** Bottom-to-top corpus and casting types shared by the UI and model adapter. */
export interface Figure {
    number: number;
    name: string;
    pattern: string;
    lower: string;
    upper: string;
}
export interface Hexagram {
    figure: Figure;
    statement: string;
    lines: string[];
    tuan: string;
    image: string;
    line_images: string[];
    extra: string | null;
    extra_image: string | null;
}
export interface Passage {
    hexagram_number: number;
    hexagram_name: string;
    label: string;
    position: number | null;
    role: '主' | '辅' | '贞' | '悔';
    text: string;
    commentary: Record<string, string>;
}
export interface Reading {
    values: number[];
    primary: Figure;
    changed: Figure | null;
    moving_lines: number[];
    passages: Passage[];
}
export interface Original {
    statement: string;
    lines: {
        label: string;
        text: string;
    }[];
    extra: string | null;
}
export interface DisplayReading extends Reading {
    originals: {
        primary: Original;
        changed: Original | null;
    };
}
export type Corpus = Map<string, Hexagram>;
const trigrams: Record<string, string> = { 111: '乾', 110: '兌', 101: '離', 100: '震', '011': '巽', '010': '坎', '001': '艮', '000': '坤' };
const positions = ['初', '二', '三', '四', '五', '上'];
/** Validate value as nonblank text; return trimmed text or throw on invalid input. */
export function requiredText(value: unknown): string {
    if (typeof value !== 'string' || !value.trim())
        throw new Error('应为非空文本');
    return value.trim();
}
/** Validate value as a six-element text array in bottom-to-top order; throw if invalid. */
function sixTexts(value: unknown): string[] {
    if (!Array.isArray(value) || value.length !== 6)
        throw new Error('爻辞或小象必须依爻位提供六条');
    return value.map(requiredText);
}
/** Parse UTF-8 JSONL text into all 64 hexagrams keyed by pattern; throw for malformed or duplicate records. */
export function loadCorpus(text: string): Corpus {
    const corpus: Corpus = new Map();
    const numbers = new Set<number>();
    for (const line of text.trim().split(/\r?\n/)) {
        const r = JSON.parse(line);
        if (!r || typeof r !== 'object' || !r.commentary || typeof r.commentary !== 'object')
            throw new Error('语料需要 commentary');
        if (!Number.isInteger(r.number) || r.number < 1 || r.number > 64)
            throw new Error('卦号必须为 1–64');
        if (typeof r.pattern !== 'string' || !/^[01]{6}$/.test(r.pattern))
            throw new Error('卦画须为六位 0/1');
        const special = r.number === 1 || r.number === 2;
        if (special && r.pattern !== (r.number === 1 ? '111111' : '000000'))
            throw new Error('乾坤卦画错误');
        if (!special && ('extra' in r || 'extra' in r.commentary))
            throw new Error('extra 只用于乾坤两卦');
        if (corpus.has(r.pattern) || numbers.has(r.number))
            throw new Error('卦号或卦画重复');
        const figure: Figure = { number: r.number, name: requiredText(r.name), pattern: r.pattern, lower: trigrams[r.pattern.slice(0, 3)], upper: trigrams[r.pattern.slice(3)] };
        corpus.set(r.pattern, { figure, statement: requiredText(r.statement), lines: sixTexts(r.lines), tuan: requiredText(r.commentary.tuan), image: requiredText(r.commentary.image), line_images: sixTexts(r.commentary.lines), extra: special ? requiredText(r.extra) : null, extra_image: special ? requiredText(r.commentary.extra) : null });
        numbers.add(r.number);
    }
    if (numbers.size !== 64)
        throw new Error('语料必须包含 1–64 号卦各一条');
    return corpus;
}
/** Generate six coin sums using coin() returning an independent 0 or 1; reject invalid random output. */
export function tossCoins(coin: () => number): number[] {
    return Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => {
        const bit = coin();
        if (bit !== 0 && bit !== 1)
            throw new Error('钱币随机值必须为 0 或 1');
        return bit + 2;
    }).reduce((sum, value) => sum + value, 0));
}
/** Return the yin/yang title of figure at the 1-based position (1–6). */
export function lineLabel(figure: Figure, position: number): string {
    const kind = figure.pattern[position - 1] === '1' ? '九' : '六';
    return position === 1 || position === 6 ? positions[position - 1] + kind : kind + positions[position - 1];
}
/** Return hexagram's statement with role (default 主), its Tuan and Great Image. */
function statement(hexagram: Hexagram, role: Passage['role'] = '主'): Passage {
    return { hexagram_number: hexagram.figure.number, hexagram_name: hexagram.figure.name, label: '卦辞', position: null, role, text: hexagram.statement, commentary: { 彖传: hexagram.tuan, 大象: hexagram.image } };
}
/** Return the quotation and images at 1-based position in hexagram, with the supplied reading role. */
function linePassage(hexagram: Hexagram, position: number, role: Passage['role']): Passage {
    return { hexagram_number: hexagram.figure.number, hexagram_name: hexagram.figure.name, label: lineLabel(hexagram.figure, position), position, role, text: hexagram.lines[position - 1], commentary: { 小象: hexagram.line_images[position - 1], 大象: hexagram.image } };
}
/** Select ordered evidence for primary, optional changed, and ascending 1-based moving positions. */
function selectPassages(primary: Hexagram, changed: Hexagram | null, moving: number[]): Passage[] {
    if (!changed)
        return [statement(primary)];
    if (moving.length === 3)
        return [statement(primary, '贞'), statement(changed, '悔')];
    if (moving.length === 6) {
        if (primary.extra && primary.extra_image)
            return [{ hexagram_number: primary.figure.number, hexagram_name: primary.figure.name, label: primary.figure.number === 1 ? '用九' : '用六', position: null, role: '主', text: primary.extra, commentary: { 小象: primary.extra_image } }];
        return [statement(changed)];
    }
    const target = moving.length <= 2 ? primary : changed;
    const selected = moving.length <= 2 ? [...moving].reverse() : [1, 2, 3, 4, 5, 6].filter(p => !moving.includes(p));
    return selected.map((position, index) => linePassage(target, position, index === 0 ? '主' : '辅'));
}
/** Resolve six bottom-to-top integer values (6–9) using validated corpus; return deterministic reading or throw. */
export function readCast(values: unknown, corpus: Corpus): Reading {
    if (!Array.isArray(values) || values.length !== 6 || values.some(v => !Number.isInteger(v) || v < 6 || v > 9))
        throw new Error('爻值须为六个 6、7、8、9 整数，按初爻到上爻排列');
    const pattern = values.map(v => v % 2).join('');
    const moving = values.flatMap((v, i) => v === 6 || v === 9 ? [i + 1] : []);
    const primary = corpus.get(pattern)!;
    const changed = moving.length ? corpus.get([...pattern].map((bit, i) => moving.includes(i + 1) ? String(1 - Number(bit)) : bit).join(''))! : null;
    return { values: [...values], primary: primary.figure, changed: changed?.figure ?? null, moving_lines: moving, passages: selectPassages(primary, changed, moving) };
}
/** Return the full canonical statement and labeled lines for hexagram, ready for display. */
function original(hexagram: Hexagram): Original {
    return { statement: hexagram.statement, lines: hexagram.lines.map((text, i) => ({ label: lineLabel(hexagram.figure, i + 1), text })), extra: hexagram.extra };
}
/** Attach canonical originals to reading using corpus; return a new display record without mutating the cast. */
export function withOriginals(reading: Reading, corpus: Corpus): DisplayReading {
    return { ...reading, originals: { primary: original(corpus.get(reading.primary.pattern)!), changed: reading.changed ? original(corpus.get(reading.changed.pattern)!) : null } };
}
