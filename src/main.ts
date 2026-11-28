import MarkdownIt from 'markdown-it';
import corpusText from '../data/zhouyi.jsonl?raw';
import settingsText from '../config/settings.yaml?raw';
import promptsText from '../config/prompts.yaml?raw';
import { loadCorpus, readCast, tossCoins, withOriginals, type Corpus, type Figure, type Original, type Passage, type DisplayReading } from './divination';
import { loadSettings, loadPrompts, type Settings, type Prompts } from './config';
import { interpret } from './interpretation';
import './style.css';
/** Return the required element matching selector; throw if the application markup is incomplete. */
function select<T extends HTMLElement = HTMLElement>(selector: string): T {
    const node = document.querySelector<T>(selector);
    if (!node)
        throw new Error(`缺少界面元素：${selector}`);
    return node;
}
const form = select<HTMLFormElement>("#cast-form");
const question = select<HTMLTextAreaElement>("#question");
const castButton = select<HTMLButtonElement>("#cast-button");
const interpretButton = select<HTMLButtonElement>("#interpret-button");
const status = select("#status");
const modelNote = select("#model-note");
const answer = select("#answer");
const answerStatus = select("#answer-status");
const markdown = new MarkdownIt({ html: false, breaks: true });
const endpoint = select<HTMLInputElement>('#model-endpoint');
const modelName = select<HTMLInputElement>('#model-name');
const apiKey = select<HTMLInputElement>('#model-key');
const positions = ["初", "二", "三", "四", "五", "上"];
let settings: Settings | null = null;
let corpus: Corpus;
let prompts: Prompts;
let reading: DisplayReading | null = null;
let originalQuestion = "";
let busy = false;
/**
 * Show the view selected by the URL hash without recreating either view or its state.
 * @param focusHeading Whether to move keyboard focus to the visible view's heading after navigation.
 * @returns No value; updates visibility, navigation labels and document title. No data is persisted.
 */
function showView(focusHeading: boolean): void {
    const method = window.location.hash === '#method';
    select('#cast-view').hidden = method;
    select('#method-view').hidden = !method;
    const active = select(method ? '#method-nav' : '#cast-nav');
    const inactive = select(method ? '#cast-nav' : '#method-nav');
    active.setAttribute('aria-current', 'page');
    inactive.removeAttribute('aria-current');
    document.title = method ? '起卦原理 · 赛博周易' : '赛博周易';
    if (focusHeading)
        select(method ? '#overview-title' : '#intro-title').focus();
}
window.addEventListener('hashchange', () => showView(true));
showView(false);
/**
 * Create a DOM element and set plain text.
 * @param {string} tag HTML tag name.
 * @param {string} text Text to display.
 * @param {string} css Optional CSS class.
 * @returns {HTMLElement} A detached element.
 */
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, css = ""): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = css;
    return node;
}
/**
 * Build an accessible bottom-to-top hexagram drawn as lines.
 * @param {string} title Card name.
 * @param {object} figure Number, name, trigrams and a bottom-to-top bit pattern.
 * @param {number[]} moving Positions with moving lines, counted from 1.
 * @param {number[]} values Optional bottom-to-top cast values to show on the original figure.
 * @returns {HTMLElement} A figure card containing six visually top-to-bottom rows.
 */
function drawFigure(title: string, figure: Figure, moving: number[] = [], values: number[] = []) {
    const card = element("figure", "", "hexagram");
    card.append(element("figcaption", title + " · 第 " + figure.number + " 卦 " + figure.name));
    card.append(element("p", figure.upper + "上" + figure.lower + "下", "muted"));
    const diagram = element("div", "", "diagram");
    const description = [];
    for (let index = 5; index >= 0; index--) {
        const yang = figure.pattern[index] === "1";
        const changed = moving.includes(index + 1);
        const row = element("div", "", changed ? "line moving" : "line");
        const detail = (values[index] ?? "") + (changed ? " 动" : "");
        row.append(element("span", positions[index]), element("i", "", yang ? "line-bar" : "line-bar yin"), element("span", detail));
        description.push(positions[index] + "爻" + (yang ? "阳" : "阴") + detail);
        diagram.append(row);
    }
    diagram.setAttribute("role", "img");
    diagram.setAttribute("aria-label", description.join("，"));
    card.append(diagram);
    return card;
}
/**
 * Build a full classic-text panel for a single figure.
 * @param {string} title Primary or changed figure label.
 * @param {object} figure Hexagram summary.
 * @param {object} original Canonical statement and six bottom-to-top line texts.
 * @param {object[]} passages Selected passages, carrying their source number and position.
 * @param {boolean} open Whether to show the edition expanded initially.
 * @returns {HTMLElement} A disclosure panel with the source lines in order.
 */
function drawOriginal(title: string, figure: Figure, original: Original, passages: Passage[], open: boolean) {
    const panel = element("details", "", "edition");
    panel.open = open;
    panel.append(element("summary", title + "「" + figure.name + "」原典"));
    const rows = element("dl", "", "edition-lines");
    const entries = [{ label: "卦辞", text: original.statement }, ...original.lines];
    if (original.extra)
        entries.push({ label: figure.number === 1 ? "用九" : "用六", text: original.extra });
    const selected = new Set(passages.filter((item) => item.hexagram_number === figure.number).map((item) => item.label));
    for (const entry of entries) {
        const row = element("div", "", selected.has(entry.label) ? "edition-row selected" : "edition-row");
        const label = element("dt", entry.label);
        if (selected.has(entry.label))
            label.append(element("span", "取用", "edition-mark"));
        row.append(label, element("dd", entry.text));
        rows.append(row);
    }
    panel.append(rows);
    return panel;
}
/**
 * Display a cast with canonical quotations and commentary.
 * @param {object} cast Validated reading computed in the browser.
 * @param {string} submitted The question for which the cast was made.
 * @returns {void} Replaces the existing content and reveals the result pane.
 */
function showReading(cast: DisplayReading, submitted: string) {
    select("#empty").hidden = true;
    select("#result").hidden = false;
    select("#cast-question").textContent = "所问之事　" + submitted;
    select("#cast-values").textContent = "爻值（自下而上） " + cast.values.join(" · ");
    const cards = [drawFigure("本卦", cast.primary, cast.moving_lines, cast.values)];
    if (cast.changed)
        cards.push(drawFigure("之卦", cast.changed));
    select("#figures").replaceChildren(...cards);
    const articles = cast.passages.map((passage) => {
        const item = element("article", "", "passage");
        const header = element("header", "", "passage-heading");
        const citation = "《周易》 · 第 " + passage.hexagram_number + " 卦";
        const roles = { "主": "主读", "辅": "参读", "贞": "贞 · 本卦", "悔": "悔 · 之卦" };
        header.append(element("p", citation, "passage-source"));
        const name = element("h3", passage.hexagram_name);
        name.append(element("span", passage.label, "passage-line"));
        header.append(name);
        if (cast.passages.length > 1)
            header.append(element("span", roles[passage.role], "passage-role"));
        const notes = element("dl", "", "notes");
        for (const [title, text] of Object.entries(passage.commentary)) {
            const entry = element("div", "", "note");
            entry.append(element("dt", title), element("dd", text));
            notes.append(entry);
        }
        item.append(header, element("blockquote", passage.text, "quotation"), notes);
        return item;
    });
    select("#passages").replaceChildren(...articles);
    const originals = [drawOriginal("本卦", cast.primary, cast.originals.primary, cast.passages, true)];
    if (cast.changed)
        originals.push(drawOriginal("之卦", cast.changed, cast.originals.changed!, cast.passages, false));
    select("#originals").replaceChildren(...originals);
}
/** Update control availability and endpoint disclosure from current page state; no return value. */
function updateControls() {
    castButton.disabled = busy || settings === null;
    question.readOnly = busy;
    for (const input of [endpoint, modelName, apiKey])
        input.disabled = busy;
    select<HTMLButtonElement>('#clear-key').disabled = busy;
    modelNote.textContent = endpoint.value.trim()
        ? '请求解读会将问题与所选经传发送至 ' + endpoint.value.trim() + '。服务商须支持浏览器跨域请求（CORS）。'
        : '可选：填写模型配置后请求解读。起卦和查经不需要密钥。';
    interpretButton.disabled = busy || !reading || !settings || !endpoint.value.trim() || !modelName.value.trim() || !apiKey.value.trim() ||
        question.value.trim() !== originalQuestion;
}
/**
 * Validate the question, compute a new local cast and show it.
 * @param {SubmitEvent} event Form submission to intercept.
 * @returns {void} Updates the result or status synchronously.
 */
function castQuestion(event: SubmitEvent) {
    event.preventDefault();
    if (busy || settings === null)
        return;
    const submitted = question.value.trim();
    if (!submitted || Array.from(submitted).length > settings.max_question_length) {
        status.textContent = "请输入 1 至 " + settings.max_question_length + " 个字符的问题。";
        question.focus();
        return;
    }
    busy = true;
    updateControls();
    status.textContent = "正在起卦…";
    try {
        reading = withOriginals(readCast(tossCoins(() => crypto.getRandomValues(new Uint8Array(1))[0] & 1), corpus), corpus);
        originalQuestion = submitted;
        showReading(reading, submitted);
        answer.hidden = true;
        interpretButton.textContent = "请求模型解读";
        status.textContent = "已起卦。";
        select("#cast-title").focus();
    }
    catch (error) {
        status.textContent = error instanceof Error ? error.message : "操作失败，请重试。";
    }
    finally {
        busy = false;
        updateControls();
    }
}
/**
 * Request model interpretation for the current cast, using its original question.
 * @returns {Promise<void>} Completes after streaming two Markdown sections or reporting an error.
 */
async function interpretQuestion() {
    if (interpretButton.disabled || !reading || !settings)
        return;
    busy = true;
    updateControls();
    status.textContent = "正在解读…";
    answerStatus.textContent = "等待模型响应…";
    answer.hidden = false;
    select("#answer-title").focus();
    const sections = {
        reasoning_content: { panel: select<HTMLDetailsElement>("#reasoning"), node: select("#reasoning-text"), text: "", dirty: false },
        content: { panel: select("#answer-content"), node: select("#answer-text"), text: "", dirty: false },
    };
    for (const { panel, node } of Object.values(sections)) {
        panel.hidden = true;
        node.replaceChildren();
    }
    sections.reasoning_content.panel.open = true;
    let repaint: ReturnType<typeof setTimeout> | null = null;
    /** Render buffered Markdown into changed sections and reveal headings; no return value. */
    function renderProgress() {
        repaint = null;
        for (const section of Object.values(sections)) {
            if (!section.dirty)
                continue;
            const { node, panel, text } = section;
            const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 30;
            node.innerHTML = markdown.render(text);
            panel.hidden = false;
            if (nearBottom)
                node.scrollTop = node.scrollHeight;
            section.dirty = false;
        }
    }
    try {
        const model = { base_url: endpoint.value.trim(), name: modelName.value.trim(), apiKey: apiKey.value.trim() };
        for await (const event of interpret(originalQuestion, reading, model, settings.model, prompts)) {
            const section = sections[event.type];
            section.text += event.text;
            section.dirty = true;
            answerStatus.textContent = event.type === "content" ? "正在生成解读正文…" : "模型正在思考…";
            if (repaint === null)
                repaint = setTimeout(renderProgress, 100);
        }
        interpretButton.textContent = "请求模型解读";
        status.textContent = "已完成解读。";
        answerStatus.textContent = "";
    }
    catch (error) {
        status.textContent = "解读未完成。";
        answerStatus.textContent = error instanceof Error ? error.message : "解读失败，可用原卦重试。";
        interpretButton.textContent = "用原卦重试解读";
    }
    finally {
        if (repaint !== null)
            clearTimeout(repaint);
        renderProgress();
        busy = false;
        updateControls();
    }
}
form.addEventListener("submit", castQuestion);
interpretButton.addEventListener("click", interpretQuestion);
question.addEventListener("input", updateControls);
for (const input of [endpoint, modelName, apiKey])
    input.addEventListener('input', updateControls);
select('#clear-key').addEventListener('click', () => { apiKey.value = ''; updateControls(); });
try {
    settings = loadSettings(settingsText);
    prompts = loadPrompts(promptsText);
    corpus = loadCorpus(corpusText);
    endpoint.value = settings.model.base_url;
    modelName.value = settings.model.name;
    select('#model-controls').hidden = false;
    updateControls();
}
catch (error) {
    settings = null;
    status.textContent = error instanceof Error ? error.message : '初始化失败';
    updateControls();
}
