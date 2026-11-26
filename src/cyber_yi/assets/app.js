"use strict";

const form = document.querySelector("#cast-form");
const question = document.querySelector("#question");
const castButton = document.querySelector("#cast-button");
const interpretButton = document.querySelector("#interpret-button");
const status = document.querySelector("#status");
const modelNote = document.querySelector("#model-note");
const answer = document.querySelector("#answer");
const answerStatus = document.querySelector("#answer-status");
const markdown = globalThis.markdownit({html: false, breaks: true});
const positions = ["初", "二", "三", "四", "五", "上"];
let settings = null;
let reading = null;
let originalQuestion = "";
let busy = false;

/**
 * Fetch a same-origin JSON response.
 * @param {string} path Relative endpoint.
 * @param {RequestInit} options Optional fetch settings.
 * @returns {Promise<object>} Parsed response, or rejects with an actionable error.
 */
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error("无法连接本机服务，请重试。");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求失败，请重试。");
  return result;
}

/**
 * Create a DOM element and set plain text.
 * @param {string} tag HTML tag name.
 * @param {string} text Text to display.
 * @param {string} css Optional CSS class.
 * @returns {HTMLElement} A detached element.
 */
function element(tag, text, css = "") {
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
function drawFigure(title, figure, moving = [], values = []) {
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
    row.append(element("span", positions[index]), element("i", "", yang ? "line-bar" : "line-bar yin"),
      element("span", detail));
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
function drawOriginal(title, figure, original, passages, open) {
  const panel = element("details", "", "edition");
  panel.open = open;
  panel.append(element("summary", title + "「" + figure.name + "」原典"));
  const rows = element("dl", "", "edition-lines");
  const entries = [{label: "卦辞", text: original.statement}, ...original.lines];
  if (original.extra) entries.push({label: figure.number === 1 ? "用九" : "用六", text: original.extra});
  const selected = new Set(passages.filter((item) => item.hexagram_number === figure.number).map((item) => item.label));
  for (const entry of entries) {
    const row = element("div", "", selected.has(entry.label) ? "edition-row selected" : "edition-row");
    const label = element("dt", entry.label);
    if (selected.has(entry.label)) label.append(element("span", "取用", "edition-mark"));
    row.append(label, element("dd", entry.text));
    rows.append(row);
  }
  panel.append(rows);
  return panel;
}

/**
 * Display a cast with canonical quotations and commentary.
 * @param {object} cast Validated reading returned by the local API.
 * @param {string} submitted The question for which the cast was made.
 * @returns {void} Replaces the existing content and reveals the result pane.
 */
function showReading(cast, submitted) {
  document.querySelector("#empty").hidden = true;
  document.querySelector("#result").hidden = false;
  document.querySelector("#cast-question").textContent = "所问之事　" + submitted;
  document.querySelector("#cast-values").textContent = "爻值（自下而上） " + cast.values.join(" · ");
  const cards = [drawFigure("本卦", cast.primary, cast.moving_lines, cast.values)];
  if (cast.changed) cards.push(drawFigure("之卦", cast.changed));
  document.querySelector("#figures").replaceChildren(...cards);

  const articles = cast.passages.map((passage) => {
    const item = element("article", "", "passage");
    const header = element("header", "", "passage-heading");
    const citation = "《周易》 · 第 " + passage.hexagram_number + " 卦";
    const roles = {"主": "主读", "辅": "参读", "贞": "贞 · 本卦", "悔": "悔 · 之卦"};
    header.append(element("p", citation, "passage-source"));
    const name = element("h3", passage.hexagram_name);
    name.append(element("span", passage.label, "passage-line"));
    header.append(name);
    if (cast.passages.length > 1) header.append(element("span", roles[passage.role], "passage-role"));
    const notes = element("dl", "", "notes");
    for (const [title, text] of Object.entries(passage.commentary)) {
      const entry = element("div", "", "note");
      entry.append(element("dt", title), element("dd", text));
      notes.append(entry);
    }
    item.append(header, element("blockquote", passage.text, "quotation"), notes);
    return item;
  });
  document.querySelector("#passages").replaceChildren(...articles);
  const originals = [drawOriginal("本卦", cast.primary, cast.originals.primary, cast.passages, true)];
  if (cast.changed) originals.push(drawOriginal("之卦", cast.changed, cast.originals.changed, cast.passages, false));
  document.querySelector("#originals").replaceChildren(...originals);
}

/** Synchronize control availability with the current request and original question. */
function updateControls() {
  castButton.disabled = busy || settings === null;
  question.readOnly = busy;
  interpretButton.disabled = busy || !reading || !settings?.can_interpret ||
    question.value.trim() !== originalQuestion;
}

/**
 * Validate the question, request a new offline cast and show it.
 * @param {SubmitEvent} event Form submission to intercept.
 * @returns {Promise<void>} Completes after updating the result or status.
 */
async function castQuestion(event) {
  event.preventDefault();
  if (busy || settings === null) return;
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
    reading = await request("/api/cast", {method: "POST"});
    originalQuestion = submitted;
    showReading(reading, submitted);
    answer.hidden = true;
    interpretButton.textContent = "请求模型解读";
    status.textContent = "已起卦。";
    document.querySelector("#cast-title").focus();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    busy = false;
    updateControls();
  }
}

/**
 * Read newline-delimited events without splitting multibyte Unicode characters.
 * @param {Response} response A successful response with a readable body.
 * @yields {object} One event with type and optional text.
 */
async function* readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const {done, value} = await reader.read();
      buffer += decoder.decode(value, {stream: !done});
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) if (line.trim()) yield JSON.parse(line);
      if (done) break;
    }
    if (buffer.trim()) yield JSON.parse(buffer);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/**
 * Request model interpretation for the current cast, using its original question.
 * @returns {Promise<void>} Completes after streaming two Markdown sections or reporting an error.
 */
async function interpretQuestion() {
  if (interpretButton.disabled) return;
  busy = true;
  updateControls();
  status.textContent = "正在解读…";
  answerStatus.textContent = "等待模型响应…";
  answer.hidden = false;
  document.querySelector("#answer-title").focus();
  const sections = {
    reasoning_content: {panel: document.querySelector("#reasoning"), node: document.querySelector("#reasoning-text"), text: "", dirty: false},
    content: {panel: document.querySelector("#answer-content"), node: document.querySelector("#answer-text"), text: "", dirty: false},
  };
  for (const {panel, node} of Object.values(sections)) {
    panel.hidden = true;
    node.replaceChildren();
  }
  sections.reasoning_content.panel.open = true;
  let repaint = null;

  /** Render only sections that received new tokens and reveal their headings. */
  function renderProgress() {
    repaint = null;
    for (const section of Object.values(sections)) {
      if (!section.dirty) continue;
      const {node, panel, text} = section;
      const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 30;
      node.innerHTML = markdown.render(text);
      panel.hidden = false;
      if (nearBottom) node.scrollTop = node.scrollHeight;
      section.dirty = false;
    }
  }

  try {
    const response = await fetch("/api/interpret/stream", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({question: originalQuestion, values: reading.values}),
    });
    if (!response.ok) throw new Error((await response.json()).error || "解读请求失败。");
    let finished = false;
    for await (const event of readEvents(response)) {
      if (event.type === "error") throw new Error(event.text);
      if (event.type === "done") {
        finished = true;
        break;
      }
      if (!Object.hasOwn(sections, event.type)) continue;
      const section = sections[event.type];
      section.text += event.text;
      section.dirty = true;
      answerStatus.textContent = event.type === "content" ? "正在生成解读正文…" : "模型正在思考…";
      if (repaint === null) repaint = setTimeout(renderProgress, 100);
    }
    if (!finished) throw new Error("解读连接中断，可用原卦重试。");
    interpretButton.textContent = "请求模型解读";
    status.textContent = "已完成解读。";
    answerStatus.textContent = "";
  } catch (error) {
    status.textContent = "解读未完成。";
    answerStatus.textContent = error.message;
    interpretButton.textContent = "用原卦重试解读";
  } finally {
    clearTimeout(repaint);
    renderProgress();
    busy = false;
    updateControls();
  }
}

form.addEventListener("submit", castQuestion);
interpretButton.addEventListener("click", interpretQuestion);
question.addEventListener("input", updateControls);
request("/api/settings").then((result) => {
  settings = result;
  modelNote.textContent = settings.can_interpret
    ? "请求解读时，当前问题与所选经文会发送至 " + settings.model_endpoint
    : settings.model_error;
  document.querySelector("#model-controls").hidden = false;
  interpretButton.hidden = !settings.can_interpret;
  updateControls();
}).catch((error) => { status.textContent = error.message; });
