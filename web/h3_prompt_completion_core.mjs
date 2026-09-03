import {
    H3_ALL_SECTIONS,
    H3_AUDIO_RETENTION_MARKERS,
    H3_MINIMAX_SPECIAL_TOKENS,
    H3_TASK_DIRECTIVES,
    H3_VISUAL_RETENTION_MARKERS,
    effectiveH3Mode,
    h3SectionsForMode,
} from "./h3_prompt_schema_core.mjs?v=0.8.10";

export const H3_LANGUAGE_MARKERS = Object.freeze([
    "[English]", "[French]", "[Spanish]", "[German]", "[Italian]",
    "[Portuguese]", "[Chinese]", "[Japanese]", "[Korean]", "[Arabic]",
    "[unclear]",
]);

const [
    DIALOGUE_START,
    DIALOGUE_END,
    CUTOFF_TOKEN,
    LYRICS_START,
    LYRICS_END,
    CAPTION_START,
    CAPTION_END,
] = H3_MINIMAX_SPECIAL_TOKENS;

function clampedCaret(text, caret) {
    const number = Number(caret);
    return Number.isFinite(number) ? Math.max(0, Math.min(text.length, Math.trunc(number))) : text.length;
}

function specialQuery(before, trigger, pattern) {
    const match = before.match(pattern);
    if (!match) return null;
    const typed = match[1];
    return {trigger, start:before.length - typed.length, end:before.length,
        typed, query:typed.slice(1), manual:false};
}

function completedAngleQuery(text, position) {
    const start = text.lastIndexOf("<", Math.max(0, position - 1));
    if (start < 0 || start >= position) return null;
    const end = text.indexOf(">", start + 1);
    if (end < position || end - start > 65) return null;
    const typed = text.slice(start, end + 1);
    if (typed.includes("\n") || typed.slice(1).includes("<")) return null;
    return promptTokenReplacementQuery(text, start, end + 1);
}

export function promptTokenReplacementQuery(value, requestedStart, requestedEnd) {
    const text = String(value ?? "");
    const start = clampedCaret(text, requestedStart);
    const end = Math.max(start, clampedCaret(text, requestedEnd));
    const typed = text.slice(start, end);
    const angle = typed.match(/^<([^<>\n]{1,64})>$/);
    if (angle) {
        const reference = typed.match(/^<(Picture|Video|Audio|Subject)\s+\d+>$/i);
        return {trigger:"<", start, end, typed,
            query:reference?.[1] ?? angle[1], manual:false, replacement:true,
            allowDelete:true};
    }
    if (/^\(S\d+(?:,S\d+)*\)$/i.test(typed)) {
        return {trigger:"(", start, end, typed, query:"S", manual:false,
            replacement:true, allowDelete:true};
    }
    return null;
}

function activeSectionAt(text, position) {
    const pattern = new RegExp(`^(${H3_ALL_SECTIONS.join("|")}):`, "gim");
    let active = null;
    for (const match of text.slice(0, position + 1).matchAll(pattern)) {
        active = match[1].toLowerCase();
    }
    return active;
}

export function promptRetentionReplacementQuery(value, caret) {
    // Retention markers deliberately remain ordinary text in the editor. Only
    // a modifier-click in their canonical line position activates this query.
    const text = String(value ?? "");
    const position = clampedCaret(text, caret);
    if (activeSectionAt(text, position) !== "retention_analysis") return null;
    const lineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
    const nextLine = text.indexOf("\n", position);
    const lineEnd = nextLine < 0 ? text.length : nextLine;
    const line = text.slice(lineStart, lineEnd);
    const markers = [...new Set([
        ...H3_VISUAL_RETENTION_MARKERS,
        ...H3_AUDIO_RETENTION_MARKERS,
    ])];
    const pattern = new RegExp(`\\b(${markers.join("|")})\\b`, "gi");
    for (const match of line.matchAll(pattern)) {
        const start = lineStart + (match.index ?? 0);
        const end = start + match[0].length;
        if (position < start || position > end) continue;
        const before = line.slice(0, match.index ?? 0);
        const reference = before.match(
            /^\s*<(Subject|Picture|Video|Audio)\s+\d+>(?:\s*\([^\n)]*\))?\s*:\s*$/i,
        );
        if (!reference) return null;
        const family = reference[1].toLowerCase() === "audio" ? "audio" : "visual";
        const allowed = family === "audio"
            ? H3_AUDIO_RETENTION_MARKERS : H3_VISUAL_RETENTION_MARKERS;
        const canonical = allowed.find((item) => item === match[0].toLowerCase());
        if (!canonical) return null;
        return {trigger:`retention_${family}`, start, end, typed:match[0], query:"",
            manual:false, replacement:true};
    }
    return null;
}

export function promptCompletionQuery(value, caret, {manual = false} = {}) {
    const text = String(value ?? "");
    const position = clampedCaret(text, caret);
    const before = text.slice(0, position);
    const completedAngle = completedAngleQuery(text, position);
    if (completedAngle) return completedAngle;
    for (const [trigger, pattern] of [
        ["<", /(<[^>\n]{0,64})$/],
        ["[", /(\[[^\]\n]{0,96})$/],
        ["(", /(\(S[0-9,]*)$/i],
    ]) {
        const result = specialQuery(before, trigger, pattern);
        if (result) return result;
    }
    const section = before.match(/(?:^|\n)([A-Za-z_][A-Za-z_]*)$/);
    if (section && H3_ALL_SECTIONS.some((item) => item.startsWith(section[1].toLowerCase()))) {
        const typed = section[1];
        return {trigger:"section", start:position - typed.length, end:position,
            typed, query:typed, manual:false};
    }
    if (!manual) return null;
    return {trigger:"manual", start:position, end:position, typed:"", query:"", manual:true};
}

function normalizedSearch(value) {
    return String(value ?? "").toLowerCase().replace(/^<\|?/, "")
        .replace(/\|?>$/, "").replace(/^[\[(]/, "").replace(/[\])]$/, "")
        .replace(/[|_+:-]+/g, " ").replace(/…/g, " ")
        .replace(/\s+/g, " ").trim();
}

function score(item, query) {
    const wanted = normalizedSearch(query);
    if (!wanted) return 0;
    const candidate = normalizedSearch(item.filterText ?? item.label);
    if (candidate === wanted) return 0;
    if (candidate.startsWith(wanted)) return 1;
    const word = candidate.split(" ").findIndex((part) => part.startsWith(wanted));
    if (word >= 0) return 3 + word;
    const contained = candidate.indexOf(wanted);
    return contained >= 0 ? 20 + contained : null;
}

function referenceItems(records) {
    const items = [];
    for (const record of records ?? []) {
        const label = String(record?.token ?? "");
        const match = label.match(/^<(Picture|Video|Audio)\s+\d+>$/i);
        if (!match) continue;
        const kind = match[1].toLowerCase();
        items.push({kind, label, insertText:label, appendSpace:true,
            detail:`Connected H3 ${kind} reference`, priority:record.ordinal ?? 0});
    }
    for (let index = 1; index <= 9; index += 1) {
        items.push({kind:"picture", label:`<Picture ${index}>`, insertText:`<Picture ${index}>`,
            appendSpace:true, detail:"H3 reference picture label", priority:10 + index});
    }
    for (let index = 1; index <= 8; index += 1) {
        items.push({kind:"subject", label:`<Subject ${index}>`, insertText:`<Subject ${index}>`,
            appendSpace:true, detail:"H3 reusable visible subject", priority:20 + index});
    }
    for (let index = 1; index <= 3; index += 1) {
        items.push({kind:"video", label:`<Video ${index}>`, insertText:`<Video ${index}>`,
            appendSpace:true, detail:"H3 reference video label", priority:40 + index});
    }
    for (let index = 1; index <= 6; index += 1) {
        items.push({kind:"audio", label:`<Audio ${index}>`, insertText:`<Audio ${index}>`,
            appendSpace:true, detail:"H3 reference audio label", priority:50 + index});
    }
    items.push(
        {kind:"dialogue", label:"<d>…</d>", insertText:`${DIALOGUE_START}${DIALOGUE_END}`, filterText:"d dialogue", detail:"H3 dialogue or lyric span", caretOffset:DIALOGUE_START.length, priority:60},
        {kind:"flow", label:"<scenetrans>", insertText:"<scenetrans>", detail:"Dialogue continues across a shot transition", priority:61},
        {kind:"flow", label:CUTOFF_TOKEN, insertText:CUTOFF_TOKEN, filterText:"cutoff speech end", detail:"Tokenizer-native speech cutoff marker", priority:62},
        {kind:"dialogue", label:DIALOGUE_START, insertText:DIALOGUE_START, filterText:"d open dialogue", detail:"Open an H3 dialogue span", priority:63},
        {kind:"dialogue", label:DIALOGUE_END, insertText:DIALOGUE_END, filterText:"/d close dialogue", detail:"Close an H3 dialogue span", priority:64},
        {kind:"lyrics", label:`${LYRICS_START}…${LYRICS_END}`,
            insertText:`${LYRICS_START}${LYRICS_END}`,
            filterText:"lyrics lyric song pair", detail:"Paired MiniMax lyric boundaries",
            caretOffset:LYRICS_START.length, priority:65},
        {kind:"lyrics", label:LYRICS_START, insertText:LYRICS_START,
            filterText:"lyrics start", detail:"Open a MiniMax lyric boundary", priority:66},
        {kind:"lyrics", label:LYRICS_END, insertText:LYRICS_END,
            filterText:"lyrics end", detail:"Close a MiniMax lyric boundary", priority:67},
        {kind:"caption", label:`${CAPTION_START}…${CAPTION_END}`,
            insertText:`${CAPTION_START}${CAPTION_END}`,
            filterText:"caption description pair", detail:"Paired MiniMax caption boundaries",
            caretOffset:CAPTION_START.length, priority:68},
        {kind:"caption", label:CAPTION_START, insertText:CAPTION_START,
            filterText:"caption start", detail:"Open a MiniMax caption boundary", priority:69},
        {kind:"caption", label:CAPTION_END, insertText:CAPTION_END,
            filterText:"caption end", detail:"Close a MiniMax caption boundary", priority:70},
    );
    return items;
}

function bracketItems() {
    const items = H3_TASK_DIRECTIVES.map((label, index) => ({
        kind:"directive", label, insertText:label, detail:"Ref2VA summary task type", priority:index,
    }));
    for (let index = 1; index <= 12; index += 1) {
        const label = `[Shot ${index}]`;
        items.push({kind:"shot", label, insertText:label, detail:"H3 shot marker", priority:40 + index});
    }
    H3_LANGUAGE_MARKERS.forEach((label, index) => items.push({
        kind:"language", label, insertText:label,
        detail:label === "[unclear]" ? "Unintelligible dialogue span" : "Dialogue language marker",
        priority:60 + index,
    }));
    return items;
}

function speakerItems() {
    const items = [];
    for (let index = 1; index <= 8; index += 1) {
        const label = `(S${index})`;
        items.push({kind:"speaker", label, insertText:label, detail:"Stable H3 speaker ID", priority:index});
    }
    items.push({kind:"speaker", label:"(S1,S2)", insertText:"(S1,S2)", detail:"Multiple speakers together", priority:20});
    return items;
}

const RETENTION_DETAILS = Object.freeze({
    fully_preserved:"Preserve the defined visual role completely",
    partially_preserved:"Retain the reference with defined changes",
    attribute_transfer:"Transfer referenced traits to another subject",
    fully_copy:"Reuse the complete source audio signal",
    partially_copy:"Reuse only part of the signal or its layers",
    reference:"Guide audio without copying the source signal",
    weak_reference:"Retain only broad similarity or atmosphere",
});

function retentionItems(family) {
    const markers = family === "audio"
        ? H3_AUDIO_RETENTION_MARKERS : H3_VISUAL_RETENTION_MARKERS;
    return markers.map((label, index) => ({
        kind:"retention", label, insertText:label,
        detail:RETENTION_DETAILS[label], priority:index,
    }));
}

function sectionItems(text, mode) {
    const effective = effectiveH3Mode(text, mode);
    return h3SectionsForMode(effective).map((section, index) => ({
        kind:"section", label:`${section}:`, insertText:`${section}:`,
        detail:`Required ${effective.toUpperCase()} section`, priority:index,
    }));
}

function unique(items) {
    const seen = new Set();
    return items.filter((item) => {
        if (seen.has(item.insertText)) return false;
        seen.add(item.insertText);
        return true;
    });
}

export function promptCompletionItems(query, records = [], {text = "", mode = "auto", limit = 40} = {}) {
    if (!query) return [];
    let items;
    if (query.trigger === "<") items = referenceItems(records);
    else if (query.trigger === "[") items = bracketItems();
    else if (query.trigger === "(") items = speakerItems();
    else if (query.trigger === "retention_visual") items = retentionItems("visual");
    else if (query.trigger === "retention_audio") items = retentionItems("audio");
    else if (query.trigger === "section") items = sectionItems(text, mode);
    else items = [...referenceItems(records), ...bracketItems(), ...speakerItems(), ...sectionItems(text, mode)];
    const result = unique(items).map((item) => ({item, score:score(item, query.query)}))
        .filter((entry) => entry.score != null)
        .sort((left, right) => left.score - right.score
            || (left.item.priority ?? 0) - (right.item.priority ?? 0)
            || left.item.label.localeCompare(right.item.label))
        .slice(0, Math.max(1, Number(limit) || 40)).map((entry) => entry.item);
    if (query.allowDelete) result.push({
        kind:"delete", label:`Delete ${query.typed}`, insertText:"",
        detail:"Remove this token", deleteToken:true,
    });
    return result;
}

export function applyPromptCompletion(value, query, item) {
    const text = String(value ?? "");
    if (!query || !item) return {text, caret:text.length};
    const start = Math.max(0, Math.min(text.length, Number(query.start) || 0));
    const end = Math.max(start, Math.min(text.length, Number(query.end) || start));
    const insertText = String(item.insertText ?? item.label ?? "");
    const before = text.slice(0, start);
    let after = text.slice(end);
    if (item.deleteToken) {
        after = after.replace(/^[ \t]+/, (spacing) => /[ \t]$/.test(before) ? "" : " ");
    }
    const wantsSpace = Boolean(item.appendSpace && !query.replacement);
    const addedSpace = wantsSpace && !/^\s/.test(after) ? " " : "";
    const existingSpace = wantsSpace && /^[ \t]/.test(after) ? 1 : 0;
    const result = before + insertText + addedSpace + after;
    const relative = item.caretOffset == null ? insertText.length
        : Math.max(0, Math.min(insertText.length, Number(item.caretOffset) || 0));
    const spacingOffset = relative === insertText.length ? addedSpace.length + existingSpace : 0;
    return {text:result, caret:start + relative + spacingOffset};
}

function injectStyles() {
    if (document.getElementById("h3-prompt-completion-style")) return;
    const style = document.createElement("style");
    style.id = "h3-prompt-completion-style";
    style.textContent = `
      .h3pc-menu { position:fixed; z-index:100200; width:min(440px,calc(100vw - 24px));
        max-height:min(300px,45vh); overflow:auto; padding:5px; border:1px solid #60718c;
        border-radius:8px; background:var(--comfy-menu-bg,#171a20); color:var(--input-text,#eef2f8);
        box-shadow:0 16px 42px rgba(0,0,0,.52); font:12px/1.35 system-ui,sans-serif; }
      .h3pc-menu[hidden] { display:none; }
      .h3pc-option { display:grid; grid-template-columns:auto minmax(0,1fr); gap:2px 8px;
        align-items:center; padding:6px 7px; border-radius:5px; cursor:pointer; }
      .h3pc-option[aria-selected="true"] { background:color-mix(in srgb,#5e8fff 24%,transparent); }
      .h3pc-option-delete { color:#ff8f8f; }
      .h3pc-kind { grid-row:1/3; min-width:28px; padding:2px 4px; border:1px solid #65738a;
        border-radius:4px; color:color-mix(in srgb,var(--input-text,#eef2f8) 72%,transparent);
        text-align:center; font-size:9px; font-weight:750; text-transform:uppercase; }
      .h3pc-label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        font:600 12px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace; }
      .h3pc-detail { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        color:color-mix(in srgb,var(--input-text,#eef2f8) 58%,transparent); font-size:10px; }
    `;
    document.head.append(style);
}

function caretAnchor(input) {
    const selection = globalThis.getSelection?.();
    if (selection?.rangeCount && input.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0).cloneRange();
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        if (rect && (rect.width || rect.height || rect.left || rect.top)) return rect;
    }
    return input.getBoundingClientRect?.() ?? {left:12, bottom:40, top:12};
}

export function createPromptCompletionController({
    input, getText, getCaret, getRecords = () => [], getMode = () => "auto",
    replaceText, maxItems = 80,
} = {}) {
    if (!input || typeof replaceText !== "function") return null;
    injectStyles();
    const menu = document.createElement("div");
    const menuId = `h3pc-${Math.random().toString(36).slice(2)}`;
    menu.id = menuId;
    menu.className = "h3pc-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;
    for (const eventName of ["pointerdown", "click", "wheel"]) {
        menu.addEventListener(eventName, (event) => event.stopPropagation());
    }
    document.body.append(menu);
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", menuId);
    let currentQuery = null;
    let currentItems = [];
    let selected = 0;

    function hide() {
        currentQuery = null; currentItems = []; selected = 0; menu.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
    }

    function position() {
        const anchor = caretAnchor(input);
        const width = Math.min(440, Math.max(240, globalThis.innerWidth - 24));
        menu.style.left = `${Math.max(12, Math.min(globalThis.innerWidth - width - 12, anchor.left ?? 12))}px`;
        const below = (anchor.bottom ?? anchor.top ?? 12) + 6;
        menu.style.top = globalThis.innerHeight - below > 180 ? `${below}px`
            : `${Math.max(12, (anchor.top ?? below) - menu.offsetHeight - 6)}px`;
    }

    function updateActive() {
        const options = [...menu.querySelectorAll(".h3pc-option")];
        options.forEach((option, index) => option.setAttribute("aria-selected", String(index === selected)));
        const active = options[selected];
        if (active) {
            input.setAttribute("aria-activedescendant", active.id);
            active.scrollIntoView?.({block:"nearest"});
        }
    }

    function accept(index = selected) {
        const item = currentItems[index];
        if (!item || !currentQuery) return false;
        const result = applyPromptCompletion(getText(), currentQuery, item);
        hide();
        input.focus();
        replaceText(result, item);
        return true;
    }

    function render() {
        menu.replaceChildren();
        currentItems.forEach((item, index) => {
            const option = document.createElement("div");
            option.id = `${menuId}-option-${index}`;
            option.className = `h3pc-option${item.kind === "delete" ? " h3pc-option-delete" : ""}`;
            option.setAttribute("role", "option");
            const kind = document.createElement("span");
            kind.className = "h3pc-kind";
            kind.textContent = String(item.kind || "H3").slice(0, 3);
            const label = document.createElement("span");
            label.className = "h3pc-label"; label.textContent = item.label;
            const detail = document.createElement("span");
            detail.className = "h3pc-detail"; detail.textContent = item.detail || "H3 completion";
            option.append(kind, label, detail);
            option.addEventListener("pointerdown", (event) => event.preventDefault());
            option.addEventListener("mouseenter", () => { selected = index; updateActive(); });
            option.addEventListener("click", () => accept(index));
            menu.append(option);
        });
        menu.hidden = false; input.setAttribute("aria-expanded", "true"); updateActive(); position();
    }

    function show(query, {selectCurrent = false} = {}) {
        const text = String(getText?.() ?? "");
        currentQuery = query;
        currentItems = promptCompletionItems(currentQuery, getRecords(), {
            text, mode:getMode(), limit:maxItems,
        });
        if (selectCurrent) {
            const current = currentItems.findIndex((item) => item.insertText === query?.typed);
            selected = current < 0 ? 0 : current;
        }
        selected = Math.min(selected, Math.max(0, currentItems.length - 1));
        if (!currentQuery || !currentItems.length) hide(); else render();
        return !menu.hidden;
    }

    function refresh({manual = false} = {}) {
        const text = String(getText?.() ?? "");
        return show(promptCompletionQuery(text, getCaret?.(), {manual}));
    }

    function open(query) {
        return show(query, {selectCurrent:true});
    }

    function handleKeydown(event) {
        if ((event.ctrlKey || event.metaKey) && !event.altKey
                && (event.code === "Space" || event.key === " ")) {
            event.preventDefault(); refresh({manual:true}); return true;
        }
        if (menu.hidden) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + currentItems.length) % currentItems.length;
            updateActive(); return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault(); return accept();
        }
        if (event.key === "Escape") { event.preventDefault(); hide(); return true; }
        return false;
    }

    const onBlur = () => globalThis.setTimeout?.(() => { if (!menu.matches(":hover")) hide(); }, 100);
    const onClick = () => refresh();
    const onKeyup = (event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) refresh(); };
    const onResize = () => { if (!menu.hidden) position(); };
    input.addEventListener("blur", onBlur);
    input.addEventListener("click", onClick);
    input.addEventListener("keyup", onKeyup);
    globalThis.addEventListener?.("resize", onResize);
    globalThis.addEventListener?.("scroll", onResize, true);
    return {refresh, open, hide, accept, handleKeydown, get visible() { return !menu.hidden; }, destroy() {
        input.removeEventListener("blur", onBlur);
        input.removeEventListener("click", onClick);
        input.removeEventListener("keyup", onKeyup);
        globalThis.removeEventListener?.("resize", onResize);
        globalThis.removeEventListener?.("scroll", onResize, true);
        menu.remove();
    }};
}
