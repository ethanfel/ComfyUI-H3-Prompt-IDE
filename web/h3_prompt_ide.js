import {app} from "/scripts/app.js";
import {api} from "/scripts/api.js";
import {
    PromptUndoHistory,
    referenceFromInputName,
    tokenizePrompt,
    undoDirection,
} from "./h3_prompt_ide_core.mjs?v=0.3.0";
import {createPromptCompletionController} from "./h3_prompt_completion_core.mjs?v=0.3.0";
import {
    analyzeH3Prompt,
    effectiveH3Mode,
    ensureH3Structure,
    H3_MODES,
    h3ModeLabel,
    insertH3Section,
} from "./h3_prompt_schema_core.mjs?v=0.3.0";

const EDITOR_NODE = "H3PromptIDE";
const REFERENCES_NODE = "H3PromptReferenceInputs";
const FONT_PROPERTY = "h3_prompt_ide_font_size";
const TRAY_PROPERTY = "h3_prompt_ide_references_open";
const STRUCTURE_PROPERTY = "h3_prompt_ide_structure_open";
const MODE_PROPERTY = "h3_prompt_ide_mode";
const DURATION_PROPERTY = "h3_prompt_ide_duration";
const FINAL_SHOT_PROPERTY = "h3_prompt_ide_final_shot";
const DEFAULT_FONT = 17;
const MIN_FONT = 12;
const MAX_FONT = 32;

const ICONS = Object.freeze({
    picture: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 17 4.5-4.5 3.2 3.2 2.3-2.3 4 3.6"/></svg>',
    video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg>',
    audio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-2M8 17V7M12 20V4M16 16V8M20 13v-2"/></svg>',
    subject: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21c.8-4.2 3.1-6.3 7-6.3s6.2 2.1 7 6.3"/></svg>',
    dialogue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v11H9l-4 3z"/><path d="M8 9h8M8 12h6"/></svg>',
    reference: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    section: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M5 12h14M5 19h14"/><path d="M8 3v4M12 10v4M16 17v4"/></svg>',
    flow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h11M12 4l3 3-3 3M20 17H9M12 14l-3 3 3 3"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6M18.5 6.5c3 3 3 8 0 11"/></svg>',
});

function injectStyles() {
    if (document.getElementById("h3-prompt-ide-style")) return;
    const style = document.createElement("style");
    style.id = "h3-prompt-ide-style";
    style.textContent = `
      .h3ide-root { --h3ide-bg:color-mix(in srgb,var(--comfy-menu-bg,#202124) 94%,#101727);
        --h3ide-panel:color-mix(in srgb,var(--comfy-input-bg,#111827) 86%,#26334d);
        --h3ide-border:color-mix(in srgb,var(--border-color,#555) 70%,#7591bd);
        --h3ide-text:var(--input-text,#edf2fa); --h3ide-muted:color-mix(in srgb,var(--h3ide-text) 57%,transparent);
        --h3ide-accent:color-mix(in srgb,var(--h3ide-text) 38%,#4f83ff);
        --h3ide-picture:color-mix(in srgb,var(--h3ide-text) 42%,#139be8);
        --h3ide-video:color-mix(in srgb,var(--h3ide-text) 42%,#9355d6);
        --h3ide-audio:color-mix(in srgb,var(--h3ide-text) 42%,#d47700);
        --h3ide-subject:color-mix(in srgb,var(--h3ide-text) 42%,#26934a);
        --h3ide-dialogue:color-mix(in srgb,var(--h3ide-text) 42%,#cf3976);
        --h3ide-section:color-mix(in srgb,var(--h3ide-text) 38%,#5f87ff);
        --h3ide-flow:color-mix(in srgb,var(--h3ide-text) 42%,#00a99d);
        --h3ide-speaker:color-mix(in srgb,var(--h3ide-text) 42%,#d268b7);
        --h3ide-danger:color-mix(in srgb,var(--h3ide-text) 42%,#d44747);
        --h3ide-font-size:17px; box-sizing:border-box; width:100%; height:100%; min-height:500px;
        display:flex; flex-direction:column; gap:8px; overflow:hidden; padding:10px;
        border:1px solid var(--h3ide-border); border-radius:9px; background:var(--h3ide-bg);
        color:var(--h3ide-text); font:12px/1.35 system-ui,sans-serif; }
      .h3ide-root *, .h3ide-root *::before, .h3ide-root *::after { box-sizing:border-box; }
      .h3ide-head,.h3ide-toolbar,.h3ide-footer { display:flex; align-items:center; gap:6px; }
      .h3ide-head { justify-content:space-between; min-width:0; }
      .h3ide-title { color:var(--h3ide-accent); font-size:15px; font-weight:760; }
      .h3ide-context,.h3ide-muted { color:var(--h3ide-muted); }
      .h3ide-context { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .h3ide-toolbar { flex-wrap:wrap; }
      .h3ide-root button,.h3ide-root select,.h3ide-root input { min-height:30px; color:var(--h3ide-text);
        font:inherit; border:1px solid var(--h3ide-border); border-radius:6px; background:var(--comfy-input-bg,#171a21); }
      .h3ide-root button { display:inline-flex; align-items:center; justify-content:center;
        gap:5px; padding:5px 8px; color:var(--h3ide-text); font:inherit; white-space:nowrap; cursor:pointer;
        border:1px solid var(--h3ide-border); border-radius:6px; background:var(--comfy-input-bg,#171a21); }
      .h3ide-root select,.h3ide-root input { min-width:0; padding:4px 7px; }
      .h3ide-root button:hover,.h3ide-root button:focus-visible { border-color:var(--h3ide-accent); outline:none; }
      .h3ide-root button:disabled { opacity:.4; cursor:not-allowed; }
      .h3ide-icon { width:16px; height:16px; display:inline-flex; flex:0 0 16px; }
      .h3ide-icon svg { width:100%; height:100%; fill:none; stroke:currentColor; stroke-width:1.7;
        stroke-linecap:round; stroke-linejoin:round; }
      .h3ide-spacer { flex:1; }
      .h3ide-editor-shell { position:relative; flex:1 1 auto; min-height:300px; overflow:hidden;
        border:1px solid var(--h3ide-border); border-radius:8px; background:var(--comfy-input-bg,#11141a); }
      .h3ide-editor-shell:focus-within { border-color:var(--h3ide-accent);
        box-shadow:0 0 0 1px color-mix(in srgb,var(--h3ide-accent) 40%,transparent); }
      .h3ide-editor { width:100%; height:100%; min-height:300px; overflow:auto; padding:13px 14px;
        outline:none; white-space:pre-wrap; overflow-wrap:anywhere; caret-color:var(--h3ide-text);
        font:var(--h3ide-font-size)/1.58 ui-monospace,SFMono-Regular,Consolas,monospace; }
      .h3ide-editor:empty::before { content:attr(data-placeholder); color:var(--h3ide-muted); pointer-events:none; }
      .h3ide-token { display:inline-flex; align-items:center; gap:3px; max-width:320px; margin:0 1px;
        padding:1px 4px 1px 2px; border:1px solid currentColor; border-radius:5px; vertical-align:1px;
        line-height:1.25; cursor:pointer; user-select:all; background:color-mix(in srgb,currentColor 14%,transparent); }
      .h3ide-token-picture { color:var(--h3ide-picture); }
      .h3ide-token-video { color:var(--h3ide-video); }
      .h3ide-token-audio { color:var(--h3ide-audio); }
      .h3ide-token-subject { color:var(--h3ide-subject); }
      .h3ide-token-dialogue { color:var(--h3ide-dialogue); }
      .h3ide-token-section { display:inline; margin:0; padding:0; border:0; border-radius:0;
        color:color-mix(in srgb,var(--h3ide-text) 82%,var(--h3ide-section)); background:none;
        font-weight:650; cursor:text; user-select:text; }
      .h3ide-token-flow { color:var(--h3ide-flow); }
      .h3ide-token-speaker { color:var(--h3ide-speaker); }
      .h3ide-token-unresolved { color:var(--h3ide-danger); border-style:dashed; }
      .h3ide-token-thumb { width:18px; height:18px; flex:0 0 18px; object-fit:cover; border-radius:3px;
        background:rgba(255,255,255,.09); }
      .h3ide-token-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .h3ide-ref-tray { display:none; max-height:230px; overflow:auto; padding:8px; gap:6px;
        border:1px solid var(--h3ide-border); border-radius:7px; background:var(--h3ide-panel); }
      .h3ide-ref-tray.h3ide-open { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); }
      .h3ide-ref-help { grid-column:1/-1; color:var(--h3ide-muted); }
      .h3ide-ref-card { justify-content:flex-start !important; min-width:0; text-align:left; }
      .h3ide-ref-card img { width:34px; height:34px; flex:0 0 34px; object-fit:cover; border-radius:4px;
        background:rgba(255,255,255,.08); }
      .h3ide-ref-card > .h3ide-icon { width:34px; height:34px; flex-basis:34px; padding:7px;
        border-radius:4px; background:rgba(255,255,255,.08); }
      .h3ide-ref-copy { min-width:0; overflow:hidden; }
      .h3ide-ref-name,.h3ide-ref-source { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .h3ide-ref-name { font-weight:700; }
      .h3ide-ref-source { color:var(--h3ide-muted); font-size:10px; }
      .h3ide-structure { display:none; max-height:285px; overflow:auto; padding:8px; gap:7px;
        border:1px solid var(--h3ide-border); border-radius:7px; background:var(--h3ide-panel); }
      .h3ide-structure.h3ide-open { display:flex; flex-direction:column; }
      .h3ide-structure-head,.h3ide-structure-options,.h3ide-section-row { display:flex; align-items:center; gap:6px; }
      .h3ide-structure-head { justify-content:space-between; }
      .h3ide-structure-options { flex-wrap:wrap; }
      .h3ide-structure-options label { display:flex; align-items:center; gap:4px; color:var(--h3ide-muted); }
      .h3ide-structure-options input { width:74px; }
      .h3ide-section-list { display:grid; gap:5px; }
      .h3ide-section-row { min-width:0; padding:5px 7px; border:1px solid var(--h3ide-border);
        border-radius:6px; background:color-mix(in srgb,var(--comfy-input-bg,#11141a) 88%,transparent); }
      .h3ide-section-row.h3ide-missing { border-style:dashed; color:var(--h3ide-danger); }
      .h3ide-section-mark { flex:0 0 18px; text-align:center; font-weight:800; }
      .h3ide-section-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        font:600 11px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace; }
      .h3ide-section-row button { min-height:24px; padding:2px 7px; }
      .h3ide-problems { display:grid; gap:3px; color:var(--h3ide-muted); }
      .h3ide-problem-error { color:#ffaaaa; }
      .h3ide-problem-warning { color:#e9bd72; }
      .h3ide-completion-hint { flex-basis:100%; color:var(--h3ide-muted); font-size:10px; }
      .h3ide-footer { justify-content:space-between; color:var(--h3ide-muted); }
      .h3ide-counts { font-variant-numeric:tabular-nums; }
      .h3ide-status { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; }
    `;
    document.head.append(style);
}

function element(tag, className = "", text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
}

function icon(kind) {
    const item = element("span", "h3ide-icon");
    item.innerHTML = ICONS[kind] ?? ICONS.reference;
    return item;
}

function button(label, title, action, iconKind = null) {
    const item = element("button");
    item.type = "button";
    item.title = title;
    if (iconKind) item.append(icon(iconKind));
    if (label) item.append(document.createTextNode(label));
    item.addEventListener("pointerdown", (event) => event.preventDefault());
    item.addEventListener("click", action);
    return item;
}

function nodeType(node) {
    return node?.comfyClass ?? node?.type ?? null;
}

function inputConnection(node, name) {
    const input = node?.inputs?.find((item) => item.name === name);
    const link = input?.link == null ? null : node.graph?.links?.[input.link];
    const source = link ? node.graph?.getNodeById?.(link.origin_id) ?? null : null;
    return source ? {source, link, input} : null;
}

function inputSource(node, name) {
    return inputConnection(node, name)?.source ?? null;
}

function referencesNode(editorNode) {
    const source = inputSource(editorNode, "references");
    return nodeType(source) === REFERENCES_NODE ? source : null;
}

function mediaAsset(widgetValue) {
    if (widgetValue && typeof widgetValue === "object" && widgetValue.filename) {
        return {
            filename:String(widgetValue.filename),
            subfolder:String(widgetValue.subfolder ?? ""),
            type:String(widgetValue.type ?? "input"),
        };
    }
    let text = typeof widgetValue === "string" ? widgetValue.trim() : "";
    if (!text) return null;
    if (/^(?:blob:|data:|https?:|\/api\/view\?|\/view\?)/i.test(text)) return {url:text};
    let type = "input";
    const annotated = text.match(/\s+\[(input|output|temp)\]\s*$/i);
    if (annotated) {
        type = annotated[1].toLowerCase();
        text = text.slice(0, annotated.index).trim();
    }
    text = text.replaceAll("\\", "/").replace(/^\/+/, "");
    if (!/\.(?:avif|bmp|gif|jpe?g|png|webp)$/i.test(text)) return null;
    const slash = text.lastIndexOf("/");
    return {
        filename:slash >= 0 ? text.slice(slash + 1) : text,
        subfolder:slash >= 0 ? text.slice(0, slash) : "",
        type,
    };
}

function assetUrl(asset) {
    if (!asset) return null;
    if (asset.url) return asset.url;
    const query = new URLSearchParams({
        filename:asset.filename,
        subfolder:asset.subfolder ?? "",
        type:asset.type ?? "input",
    });
    return api.apiURL(`/view?${query.toString()}`);
}

function previewFromNode(node) {
    const rendered = node?.imgs?.[0];
    const renderedUrl = typeof rendered === "string" ? rendered : rendered?.src;
    if (renderedUrl) return renderedUrl;
    for (const widget of node?.widgets ?? []) {
        const asset = mediaAsset(widget.value);
        if (asset) return assetUrl(asset);
    }
    return null;
}

function findImagePreview(start) {
    const queue = [start];
    const seen = new Set();
    while (queue.length) {
        const candidate = queue.shift();
        if (!candidate || seen.has(candidate)) continue;
        seen.add(candidate);
        const url = previewFromNode(candidate);
        if (url) return url;
        for (const input of candidate.inputs ?? []) {
            const parent = inputSource(candidate, input.name);
            if (parent) queue.push(parent);
        }
    }
    return null;
}

function referenceRecords(editorNode) {
    const container = referencesNode(editorNode);
    if (!container) return [];
    const records = [];
    for (const input of container.inputs ?? []) {
        const reference = referenceFromInputName(input.name);
        if (!reference || input.link == null) continue;
        const source = inputSource(container, input.name);
        records.push({
            ...reference,
            source,
            preview:reference.kind === "audio" ? null : findImagePreview(source),
        });
    }
    const kindOrder = {picture:0, video:1, audio:2};
    records.sort((left, right) => kindOrder[left.kind] - kindOrder[right.kind]
        || left.ordinal - right.ordinal);
    return records;
}

function referenceSignature(editorNode) {
    const container = referencesNode(editorNode);
    if (!container) return "";
    return (container.inputs ?? []).map((input) => {
        const reference = referenceFromInputName(input.name);
        if (!reference) return "";
        const source = inputSource(container, input.name);
        const widgets = (source?.widgets ?? []).map((item) => String(item.value ?? "")).join("|");
        return `${reference.token}:${input.link ?? ""}:${source?.id ?? ""}:${widgets}`;
    }).join(";");
}

function labelReferenceSockets(node) {
    if (nodeType(node) !== REFERENCES_NODE) return;
    for (const input of node.inputs ?? []) {
        const reference = referenceFromInputName(input.name);
        if (reference) input.label = reference.token;
    }
    node.graph?.setDirtyCanvas?.(true, false);
}

function editorPlainText(editor) {
    function read(node, root) {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
        if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            let text = "";
            for (const child of node.childNodes) text += read(child, root);
            return text;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return "";
        if (node.classList?.contains("h3ide-token")) {
            return node.dataset.token ?? node.textContent ?? "";
        }
        if (node.tagName === "BR") return "\n";
        let text = "";
        for (const child of node.childNodes) text += read(child, root);
        if (["DIV", "P"].includes(node.tagName) && node !== root && !text.endsWith("\n")) text += "\n";
        return text;
    }
    return read(editor, editor).replace(/\n$/, "");
}

function selectedPlainText(editor) {
    const selection = globalThis.getSelection?.();
    if (!selection?.rangeCount || selection.isCollapsed) return null;
    if (!editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return null;
    return editorPlainText(selection.getRangeAt(0).cloneContents());
}

function copySelection(editor, event, cut = false) {
    const text = selectedPlainText(editor);
    if (text == null || !event.clipboardData) return false;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    if (cut) {
        const selection = globalThis.getSelection?.();
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        editor.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"deleteByCut"}));
    }
    return true;
}

function selectionTextOffset(editor) {
    const selection = globalThis.getSelection?.();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) {
        return editorPlainText(editor).length;
    }
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(editor);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return editorPlainText(range.cloneContents()).length;
}

function restoreCaret(editor, requested) {
    const target = Math.max(0, Number(requested) || 0);
    const range = document.createRange();
    const selection = globalThis.getSelection?.();
    let consumed = 0;
    let placed = false;
    function visit(node) {
        if (placed) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const length = node.textContent?.length ?? 0;
            if (target <= consumed + length) {
                range.setStart(node, Math.max(0, target - consumed));
                placed = true;
                return;
            }
            consumed += length;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.classList?.contains("h3ide-token")) {
            const length = String(node.dataset.token ?? "").length;
            if (target <= consumed + length) {
                if (target <= consumed) range.setStartBefore(node);
                else range.setStartAfter(node);
                placed = true;
                return;
            }
            consumed += length;
            return;
        }
        for (const child of node.childNodes) visit(child);
    }
    visit(editor);
    if (!placed) range.selectNodeContents(editor), range.collapse(false);
    else range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function insertPlainText(editor, text) {
    editor.focus();
    const selection = globalThis.getSelection?.();
    const hasSelection = selection?.rangeCount && editor.contains(selection.anchorNode);
    const range = hasSelection ? selection.getRangeAt(0) : document.createRange();
    if (!hasSelection) range.selectNodeContents(editor), range.collapse(false);
    range.deleteContents();
    const textNode = document.createTextNode(String(text ?? ""));
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"insertText", data:String(text ?? "")}));
}

function clampFont(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_FONT;
    return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.round(number)));
}

function hidePromptWidget(widget) {
    if (!widget || widget._h3PromptIdeHidden) return;
    widget._h3PromptIdeHidden = true;
    widget.hidden = true;
    widget.computeSize = () => [0, -4];
}

function mountEditor(node) {
    if (node._h3PromptIdeMounted || typeof node.addDOMWidget !== "function") return;
    const promptWidget = node.widgets?.find((item) => item.name === "prompt");
    if (!promptWidget) return;
    node._h3PromptIdeMounted = true;
    injectStyles();
    hidePromptWidget(promptWidget);
    node.properties ??= {};

    const root = element("div", "h3ide-root");
    root.title = "Standalone rich editor; the output is ordinary text.";
    for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick"]) {
        root.addEventListener(eventName, (event) => event.stopPropagation());
    }
    for (const eventName of ["keydown", "keyup", "keypress", "copy", "cut", "paste"]) {
        root.addEventListener(eventName, (event) => event.stopPropagation());
    }
    root.addEventListener("wheel", (event) => event.stopPropagation());

    const state = {
        editor:null,
        tray:null,
        structure:null,
        counts:null,
        status:null,
        records:[],
        signature:"",
        lastWidgetValue:String(promptWidget.value ?? ""),
        history:new PromptUndoHistory(String(promptWidget.value ?? "")),
        fontSize:clampFont(node.properties[FONT_PROPERTY]),
        trayOpen:Boolean(node.properties[TRAY_PROPERTY]),
        structureOpen:Boolean(node.properties[STRUCTURE_PROPERTY]),
        mode:H3_MODES.some((item) => item.id === node.properties[MODE_PROPERTY])
            ? node.properties[MODE_PROPERTY] : "auto",
        duration:Math.max(0.01, Number(node.properties[DURATION_PROPERTY]) || 6),
        finalShot:Math.max(1, Math.min(99, Math.trunc(Number(node.properties[FINAL_SHOT_PROPERTY]) || 1))),
        analysis:null,
        completion:null,
        pollTimer:null,
    };
    node._h3PromptIdeState = state;

    function dirty() {
        node.graph?.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }

    function updateFooter(message = "Plain STRING ready") {
        const text = state.editor ? editorPlainText(state.editor) : state.lastWidgetValue;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        state.analysis = analyzeH3Prompt(text, state.mode, {
            duration:state.duration,
            finalShot:state.finalShot,
            connectedReferences:state.records,
        });
        const errors = state.analysis.problems.filter((item) => item.severity === "error").length;
        const warnings = state.analysis.problems.length - errors;
        const health = errors ? `${errors} structure error${errors === 1 ? "" : "s"}`
            : warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "H3 structure valid";
        if (state.counts) state.counts.textContent = `${words} words · ${text.length} chars`;
        if (state.status) state.status.textContent = `${message} · ${health}`;
        if (state.structure) renderStructurePanel();
        updateHeader();
    }

    function makeToken(part) {
        if (part.type === "text") return document.createTextNode(part.text);
        const token = element("span", `h3ide-token h3ide-token-${part.kind}`);
        token.contentEditable = "false";
        token.dataset.token = part.text;
        const record = part.type === "reference"
            ? state.records.find((item) => item.kind === part.kind && item.ordinal === part.ordinal)
            : null;
        if (part.unresolved) token.classList.add("h3ide-token-unresolved");
        if (part.type === "section") {
            token.append(element("span", "h3ide-token-label", part.text));
        } else if (record?.preview) {
            const thumb = element("img", "h3ide-token-thumb");
            thumb.src = record.preview;
            thumb.alt = "";
            token.append(thumb);
        } else {
            token.append(icon(part.kind));
            token.append(element("span", "h3ide-token-label", part.text));
        }
        token.title = part.unresolved
            ? part.type === "reference"
                ? `${part.text} is not connected on H3 Reference Inputs`
                : `Use the exact H3 spelling and capitalization for ${part.text}`
            : part.kind === "section" ? `H3 section · ${part.section}` : part.text;
        return token;
    }

    function renderText(text, caret = null) {
        const fragment = document.createDocumentFragment();
        for (const part of tokenizePrompt(text, state.records)) fragment.append(makeToken(part));
        state.editor.replaceChildren(fragment);
        if (caret != null) restoreCaret(state.editor, caret);
        updateFooter();
    }

    function writeWidget(text, event = null, message = "Saved") {
        const value = String(text ?? "");
        state.history.record(value, {inputType:event?.inputType});
        state.lastWidgetValue = value;
        promptWidget.value = value;
        promptWidget.callback?.(value);
        updateFooter(message);
        dirty();
        refreshHistoryButtons();
    }

    function replaceEditorText(text, caret = null, message = "Updated") {
        const value = String(text ?? "");
        state.history.record(value, {inputType:"insertReplacementText"});
        state.lastWidgetValue = value;
        promptWidget.value = value;
        promptWidget.callback?.(value);
        renderText(value, caret == null ? value.length : caret);
        updateFooter(message);
        refreshHistoryButtons();
        state.editor.focus();
        dirty();
    }

    function insertDecorated(text, caret = null) {
        const start = selectionTextOffset(state.editor);
        insertPlainText(state.editor, text);
        renderText(editorPlainText(state.editor), caret == null ? start + String(text).length : start + caret);
        state.editor.focus();
    }

    function renderTray() {
        state.tray.replaceChildren();
        if (!referencesNode(node)) {
            state.tray.append(element(
                "div", "h3ide-ref-help",
                "Connect an H3 Reference Inputs node to use picture, video, and audio tokens.",
            ));
            return;
        }
        if (!state.records.length) {
            state.tray.append(element(
                "div", "h3ide-ref-help",
                "Connect media to <Picture 1>, <Video 1>, or <Audio 1>; each group grows automatically.",
            ));
            return;
        }
        state.tray.append(element(
            "div", "h3ide-ref-help",
            "Click a reference to insert its exact MiniMax H3 token.",
        ));
        for (const record of state.records) {
            const card = button("", `Insert ${record.token}`, () => insertDecorated(record.token));
            card.className = "h3ide-ref-card";
            if (record.preview) {
                const image = element("img");
                image.src = record.preview;
                image.alt = "";
                card.append(image);
            } else card.append(icon(record.kind));
            const copy = element("span", "h3ide-ref-copy");
            copy.append(
                element("div", "h3ide-ref-name", record.token),
                element("div", "h3ide-ref-source", record.source?.title || nodeType(record.source) || `Connected ${record.kind}`),
            );
            card.append(copy);
            state.tray.append(card);
        }
    }

    function structureOptions() {
        return {duration:state.duration, finalShot:state.finalShot};
    }

    function addSection(section) {
        const text = editorPlainText(state.editor);
        const mode = effectiveH3Mode(text, state.mode);
        const result = insertH3Section(text, section, mode);
        if (result.added) replaceEditorText(result.text, result.caret, `Added ${section}:`);
        else {
            renderText(text, result.caret);
            state.editor.focus();
        }
    }

    function addMissingStructure() {
        const text = editorPlainText(state.editor);
        const mode = effectiveH3Mode(text, state.mode);
        const result = ensureH3Structure(text, mode, structureOptions());
        const message = result.added.length
            ? `Added ${result.added.length} missing section${result.added.length === 1 ? "" : "s"}`
            : `Normalized ${h3ModeLabel(result.mode)} alignment`;
        replaceEditorText(result.text, result.caret, message);
    }

    function optionInput(label, value, {min, max, step}, onChange) {
        const host = element("label");
        host.append(document.createTextNode(label));
        const input = element("input");
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        input.addEventListener("change", () => onChange(input.value));
        host.append(input);
        return host;
    }

    function renderStructurePanel() {
        if (!state.structure) return;
        const text = state.editor ? editorPlainText(state.editor) : state.lastWidgetValue;
        const analysis = state.analysis ?? analyzeH3Prompt(text, state.mode, {
            ...structureOptions(),
            connectedReferences:state.records,
        });
        state.structure.replaceChildren();
        const head = element("div", "h3ide-structure-head");
        head.append(
            element("strong", "", `${h3ModeLabel(analysis.mode)} strict section order`),
            button(
                analysis.missing.length ? "Add missing" : "Normalize",
                "Add absent categories in H3 order and write the exact mode alignment line",
                addMissingStructure,
                "section",
            ),
        );
        state.structure.append(head);

        if (["i2va", "fl2va", "l2va"].includes(analysis.mode)) {
            const options = element("div", "h3ide-structure-options");
            if (["fl2va", "l2va"].includes(analysis.mode)) {
                options.append(optionInput("Duration (s)", state.duration,
                    {min:0.01, max:999, step:0.01}, (value) => {
                        state.duration = Math.max(0.01, Number(value) || 6);
                        node.properties[DURATION_PROPERTY] = state.duration;
                        updateFooter("Duration changed; normalize alignment");
                        dirty();
                    }));
                options.append(optionInput("Final shot", state.finalShot,
                    {min:1, max:99, step:1}, (value) => {
                        state.finalShot = Math.max(1, Math.min(99, Math.trunc(Number(value) || 1)));
                        node.properties[FINAL_SHOT_PROPERTY] = state.finalShot;
                        updateFooter("Final shot changed; normalize alignment");
                        dirty();
                    }));
            } else {
                options.append(element("span", "h3ide-muted", "I2VA uses <Picture 1> at 0.00 seconds in [Shot 1]."));
            }
            state.structure.append(options);
        }

        const list = element("div", "h3ide-section-list");
        for (const section of analysis.required) {
            const record = analysis.records.find((item) => item.name === section);
            const row = element("div", `h3ide-section-row${record ? "" : " h3ide-missing"}`);
            row.append(
                element("span", "h3ide-section-mark", record ? "✓" : "+"),
                element("span", "h3ide-section-name", `${section}:`),
                button(record ? "Go" : "Add", record ? `Go to ${section}:` : `Add ${section}: in H3 order`, () => {
                    if (record) {
                        renderText(editorPlainText(state.editor), record.contentStart);
                        state.editor.focus();
                    } else addSection(section);
                }),
            );
            list.append(row);
        }
        state.structure.append(list);

        const problems = element("div", "h3ide-problems");
        if (!analysis.problems.length) {
            problems.append(element("div", "", "✓ Exact section names, ordering, alignment, and dialogue balance pass."));
        } else {
            for (const problem of analysis.problems) {
                problems.append(element("div", `h3ide-problem-${problem.severity}`,
                    `${problem.severity === "error" ? "×" : "!"} ${problem.message}`));
            }
        }
        state.structure.append(problems);
    }

    function refreshReferences(force = false) {
        const signature = referenceSignature(node);
        if (!force && signature === state.signature) return;
        state.signature = signature;
        state.records = referenceRecords(node);
        if (state.tray) renderTray();
        if (state.editor) {
            const text = editorPlainText(state.editor);
            const caret = document.activeElement === state.editor
                ? selectionTextOffset(state.editor) : null;
            renderText(text, caret);
        }
        updateHeader();
    }

    function synchronizeWidget() {
        const value = String(promptWidget.value ?? "");
        if (value === state.lastWidgetValue) return;
        state.lastWidgetValue = value;
        state.history.align(value);
        const caret = document.activeElement === state.editor
            ? Math.min(selectionTextOffset(state.editor), value.length) : null;
        renderText(value, caret);
        refreshHistoryButtons();
    }

    let undoButton;
    let redoButton;
    function refreshHistoryButtons() {
        if (undoButton) undoButton.disabled = !state.history.undoStack.length;
        if (redoButton) redoButton.disabled = !state.history.redoStack.length;
    }

    function applyHistory(direction) {
        const text = state.history[direction]?.();
        if (text == null) return;
        state.lastWidgetValue = text;
        promptWidget.value = text;
        promptWidget.callback?.(text);
        renderText(text, text.length);
        updateFooter(direction === "undo" ? "Undo" : "Redo");
        refreshHistoryButtons();
        state.editor.focus();
        dirty();
    }

    let context;
    function updateHeader() {
        if (!context) return;
        const text = state.editor ? editorPlainText(state.editor) : state.lastWidgetValue;
        const mode = state.analysis?.mode ?? effectiveH3Mode(text, state.mode);
        const health = state.analysis?.valid ? "schema valid"
            : `${state.analysis?.problems.filter((item) => item.severity === "error").length ?? 0} errors`;
        const references = referencesNode(node)
            ? ["picture", "video", "audio"].map((kind) => {
                const count = state.records.filter((item) => item.kind === kind).length;
                return count ? `${count} ${kind}${count === 1 ? "" : "s"}` : null;
            }).filter(Boolean).join(" · ") || "0 refs"
            : "no refs";
        context.textContent = `${h3ModeLabel(mode)} · ${health} · ${references} · STRING`;
    }

    const head = element("div", "h3ide-head");
    context = element("span", "h3ide-context");
    head.append(element("span", "h3ide-title", "H3 Prompt IDE"), context);

    const toolbar = element("div", "h3ide-toolbar");
    const modeSelect = element("select");
    modeSelect.title = "Choose the strict H3 prompt schema; Auto detects it from the prompt";
    for (const mode of H3_MODES) {
        const option = element("option", "", mode.label);
        option.value = mode.id;
        modeSelect.append(option);
    }
    modeSelect.value = state.mode;
    modeSelect.addEventListener("change", () => {
        state.mode = modeSelect.value;
        node.properties[MODE_PROPERTY] = state.mode;
        updateFooter("Schema mode changed");
        state.completion?.hide();
        dirty();
    });
    const sectionsButton = button("Sections", "Show strict H3 categories and validation", () => {
        state.structureOpen = !state.structureOpen;
        node.properties[STRUCTURE_PROPERTY] = state.structureOpen;
        state.structure.classList.toggle("h3ide-open", state.structureOpen);
        state.completion?.hide();
        if (state.structureOpen) renderStructurePanel();
        dirty();
    }, "section");
    const refsButton = button("References", "Show H3 picture, video, and audio references", () => {
        state.trayOpen = !state.trayOpen;
        node.properties[TRAY_PROPERTY] = state.trayOpen;
        state.tray.classList.toggle("h3ide-open", state.trayOpen);
        if (state.trayOpen) renderTray();
        dirty();
    }, "reference");
    const dialogueButton = button("Dialogue", "Wrap the selection in <d> tags", () => {
        const selected = selectedPlainText(state.editor);
        if (selected == null) insertDecorated("<d></d>", 3);
        else insertDecorated(`<d>${selected}</d>`);
    }, "dialogue");
    undoButton = button("↶", "Undo (Ctrl/Cmd+Z)", () => applyHistory("undo"));
    redoButton = button("↷", "Redo (Ctrl/Cmd+Shift+Z)", () => applyHistory("redo"));
    const smaller = button("A−", "Decrease editor font", () => {
        state.fontSize = clampFont(state.fontSize - 1);
        node.properties[FONT_PROPERTY] = state.fontSize;
        root.style.setProperty("--h3ide-font-size", `${state.fontSize}px`);
        dirty();
    });
    const larger = button("A+", "Increase editor font", () => {
        state.fontSize = clampFont(state.fontSize + 1);
        node.properties[FONT_PROPERTY] = state.fontSize;
        root.style.setProperty("--h3ide-font-size", `${state.fontSize}px`);
        dirty();
    });
    toolbar.append(
        modeSelect,
        sectionsButton,
        refsButton,
        dialogueButton,
        undoButton,
        redoButton,
        element("span", "h3ide-spacer"),
        smaller,
        larger,
        element("span", "h3ide-completion-hint", "Type <, [, (, or a section name · Ctrl/Cmd+Space for all H3 completions"),
    );

    state.tray = element("div", "h3ide-ref-tray");
    state.tray.classList.toggle("h3ide-open", state.trayOpen);
    state.structure = element("div", "h3ide-structure");
    state.structure.classList.toggle("h3ide-open", state.structureOpen);

    const shell = element("div", "h3ide-editor-shell");
    state.editor = element("div", "h3ide-editor");
    state.editor.contentEditable = "true";
    state.editor.spellcheck = true;
    state.editor.tabIndex = 0;
    state.editor.setAttribute("role", "textbox");
    state.editor.setAttribute("aria-multiline", "true");
    state.editor.dataset.placeholder = "Write a prompt. Use References to insert <Picture 1>, <Video 1>, or <Audio 1>.";
    state.editor.addEventListener("input", (event) => {
        writeWidget(editorPlainText(state.editor), event);
        state.completion?.refresh();
    });
    state.editor.addEventListener("beforeinput", (event) => {
        if (["insertParagraph", "insertLineBreak"].includes(event.inputType)) {
            event.preventDefault();
            insertPlainText(state.editor, "\n");
        }
    });
    state.editor.addEventListener("paste", (event) => {
        event.preventDefault();
        insertPlainText(state.editor, event.clipboardData?.getData("text/plain") ?? "");
    });
    state.editor.addEventListener("copy", (event) => copySelection(state.editor, event));
    state.editor.addEventListener("cut", (event) => copySelection(state.editor, event, true));
    state.editor.addEventListener("keydown", (event) => {
        if (state.completion?.handleKeydown(event)) return;
        const direction = undoDirection(event);
        if (direction) {
            event.preventDefault();
            applyHistory(direction);
        } else if (event.key === "Escape") {
            state.trayOpen = false;
            node.properties[TRAY_PROPERTY] = false;
            state.tray.classList.remove("h3ide-open");
            state.structureOpen = false;
            node.properties[STRUCTURE_PROPERTY] = false;
            state.structure.classList.remove("h3ide-open");
        }
    });
    state.editor.addEventListener("blur", () => renderText(editorPlainText(state.editor)));
    shell.append(state.editor);
    state.completion = createPromptCompletionController({
        input:state.editor,
        getText:() => editorPlainText(state.editor),
        getCaret:() => selectionTextOffset(state.editor),
        getRecords:() => state.records,
        getMode:() => state.mode,
        replaceText:(result) => replaceEditorText(result.text, result.caret, "H3 completion inserted"),
    });

    const footer = element("div", "h3ide-footer");
    state.counts = element("span", "h3ide-counts");
    state.status = element("span", "h3ide-status", "Plain STRING ready");
    footer.append(state.counts, state.status);

    root.style.setProperty("--h3ide-font-size", `${state.fontSize}px`);
    root.append(head, toolbar, state.structure, state.tray, shell, footer);
    const domWidget = node.addDOMWidget(
        "h3_prompt_ide_editor", "h3-prompt-ide", root,
        {serialize:false, hideOnZoom:false, getMinHeight:() => 500},
    );
    domWidget.serialize = false;
    node.setSize?.([
        Math.max(Number(node.size?.[0]) || 700, 700),
        Math.max(Number(node.size?.[1]) || 650, 650),
    ]);

    const connectionsChanged = node.onConnectionsChange;
    node.onConnectionsChange = function () {
        const result = connectionsChanged?.apply(this, arguments);
        setTimeout(() => refreshReferences(true), 0);
        return result;
    };
    const removed = node.onRemoved;
    node.onRemoved = function () {
        if (state.pollTimer != null) window.clearInterval(state.pollTimer);
        state.completion?.destroy();
        state.completion = null;
        return removed?.apply(this, arguments);
    };
    node._h3PromptIdeRefresh = () => {
        hidePromptWidget(promptWidget);
        synchronizeWidget();
        refreshReferences(true);
    };
    state.pollTimer = window.setInterval(() => {
        synchronizeWidget();
        refreshReferences(false);
    }, 500);

    renderText(state.lastWidgetValue);
    refreshReferences(true);
    refreshHistoryButtons();
    updateHeader();
}

app.registerExtension({
    name:"h3_prompt_ide.standalone_editor",
    async beforeRegisterNodeDef(nodeTypeDefinition, nodeData) {
        if (nodeData.name === EDITOR_NODE) {
            const created = nodeTypeDefinition.prototype.onNodeCreated;
            nodeTypeDefinition.prototype.onNodeCreated = function () {
                const result = created?.apply(this, arguments);
                setTimeout(() => mountEditor(this), 0);
                return result;
            };
            const configured = nodeTypeDefinition.prototype.onConfigure;
            nodeTypeDefinition.prototype.onConfigure = function () {
                const result = configured?.apply(this, arguments);
                setTimeout(() => this._h3PromptIdeRefresh?.(), 0);
                return result;
            };
        } else if (nodeData.name === REFERENCES_NODE) {
            const created = nodeTypeDefinition.prototype.onNodeCreated;
            nodeTypeDefinition.prototype.onNodeCreated = function () {
                const result = created?.apply(this, arguments);
                setTimeout(() => labelReferenceSockets(this), 0);
                return result;
            };
            const configured = nodeTypeDefinition.prototype.onConfigure;
            nodeTypeDefinition.prototype.onConfigure = function () {
                const result = configured?.apply(this, arguments);
                setTimeout(() => labelReferenceSockets(this), 0);
                return result;
            };
            const connectionsChanged = nodeTypeDefinition.prototype.onConnectionsChange;
            nodeTypeDefinition.prototype.onConnectionsChange = function () {
                const result = connectionsChanged?.apply(this, arguments);
                setTimeout(() => labelReferenceSockets(this), 0);
                return result;
            };
        }
    },
    async nodeCreated(node) {
        if (nodeType(node) === EDITOR_NODE) setTimeout(() => mountEditor(node), 0);
        else if (nodeType(node) === REFERENCES_NODE) setTimeout(() => labelReferenceSockets(node), 0);
    },
    async afterConfigureGraph() {
        for (const node of app.graph?._nodes ?? []) {
            if (nodeType(node) === EDITOR_NODE) setTimeout(() => node._h3PromptIdeRefresh?.(), 0);
            else if (nodeType(node) === REFERENCES_NODE) setTimeout(() => labelReferenceSockets(node), 0);
        }
    },
});
