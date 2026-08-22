import {H3_ALL_SECTIONS} from "./h3_prompt_schema_core.mjs?v=0.3.0";

export const H3_PICTURE_LIMIT = 9;
export const H3_VIDEO_LIMIT = 3;
export const H3_AUDIO_LIMIT = 6;

const REFERENCE_LIMITS = Object.freeze({
    picture:H3_PICTURE_LIMIT,
    video:H3_VIDEO_LIMIT,
    audio:H3_AUDIO_LIMIT,
});

const REFERENCE_LABELS = Object.freeze({
    picture:"Picture",
    video:"Video",
    audio:"Audio",
});

export function referenceToken(kind, ordinal) {
    const normalizedKind = String(kind ?? "").toLowerCase();
    const value = Math.trunc(Number(ordinal));
    const limit = REFERENCE_LIMITS[normalizedKind];
    return Number.isInteger(value) && value >= 1 && value <= limit
        ? `<${REFERENCE_LABELS[normalizedKind]} ${value}>` : null;
}

export function pictureToken(ordinal) {
    return referenceToken("picture", ordinal);
}

export function videoToken(ordinal) {
    return referenceToken("video", ordinal);
}

export function audioToken(ordinal) {
    return referenceToken("audio", ordinal);
}

export function referenceFromInputName(name) {
    const match = String(name ?? "").match(
        /^(?:(pictures|videos|audios)\.)?<(Picture|Video|Audio)\s+(\d+)>$/i,
    );
    if (!match) return null;
    const kind = match[2].toLowerCase();
    const groupKind = match[1]?.toLowerCase().replace(/s$/, "") ?? kind;
    if (groupKind !== kind) return null;
    const ordinal = Number(match[3]);
    const token = referenceToken(kind, ordinal);
    return token ? {kind, ordinal, token} : null;
}

export function pictureOrdinalFromInputName(name) {
    const reference = referenceFromInputName(name);
    return reference?.kind === "picture" ? reference.ordinal : null;
}

const SECTION_ALTERNATION = H3_ALL_SECTIONS.join("|");
const TOKEN_PATTERN = new RegExp(
    `^(${SECTION_ALTERNATION}):|(<(?:Picture|Video|Audio|Subject)\\s+\\d+>|<\\/?d>|<scenetrans>|<cutoff>|\\(S\\d+(?:,S\\d+)*\\))`,
    "gim",
);

function connectedReferenceTokens(references) {
    const connected = new Set();
    for (const reference of references ?? []) {
        if (typeof reference === "number") {
            const token = pictureToken(reference);
            if (token) connected.add(token.toLowerCase());
            continue;
        }
        const rawToken = typeof reference === "string" ? reference : reference?.token;
        const match = String(rawToken ?? "").match(/^<(Picture|Video|Audio)\s+(\d+)>$/i);
        if (!match) continue;
        const token = referenceToken(match[1], match[2]);
        if (token) connected.add(token.toLowerCase());
    }
    return connected;
}

export function tokenizePrompt(value, connectedReferences = []) {
    const source = String(value ?? "");
    const connected = connectedReferenceTokens(connectedReferences);
    const parts = [];
    let offset = 0;
    for (const match of source.matchAll(TOKEN_PATTERN)) {
        const index = match.index ?? 0;
        if (index > offset) parts.push({type: "text", text: source.slice(offset, index)});
        const text = match[0];
        const tag = text.toLowerCase();
        const section = tag.endsWith(":")
            ? H3_ALL_SECTIONS.find((item) => `${item}:` === tag) : null;
        const externalReference = tag.match(/^<(picture|video|audio)\s+(\d+)>$/);
        if (section) {
            parts.push({type:"section", kind:"section", text, section,
                unresolved:text !== `${section}:`});
        } else if (externalReference) {
            const kind = externalReference[1];
            const ordinal = Number(externalReference[2]);
            parts.push({
                type: "reference",
                kind,
                text,
                ordinal,
                unresolved: !connected.has(tag),
            });
        } else if (tag.startsWith("<subject")) {
            parts.push({type: "subject", kind: "subject", text, unresolved: false});
        } else if (tag === "<scenetrans>" || tag === "<cutoff>") {
            parts.push({type:"flow", kind:"flow", text, unresolved:false});
        } else if (tag.startsWith("(s")) {
            parts.push({type:"speaker", kind:"speaker", text, unresolved:false});
        } else {
            parts.push({type: "dialogue", kind: "dialogue", text, unresolved: false});
        }
        offset = index + text.length;
    }
    if (offset < source.length) parts.push({type: "text", text: source.slice(offset)});
    return parts;
}

function undoGroup(inputType) {
    const value = String(inputType ?? "");
    if (value === "insertText") return "typing";
    if (value === "deleteContentBackward") return "backspace";
    if (value === "deleteContentForward") return "delete";
    return "";
}

export function undoDirection(event) {
    if (!event || event.altKey || !(event.ctrlKey || event.metaKey)) return null;
    const key = String(event.key ?? "").toLowerCase();
    if (key === "z") return event.shiftKey ? "redo" : "undo";
    if (key === "y" && !event.shiftKey) return "redo";
    return null;
}

export class PromptUndoHistory {
    constructor(initial = "", {limit = 100, coalesceMs = 750} = {}) {
        this.limit = Math.max(1, Math.trunc(Number(limit) || 100));
        this.coalesceMs = Math.max(0, Number(coalesceMs) || 0);
        this.reset(initial);
    }

    reset(value = "") {
        this.current = String(value ?? "");
        this.undoStack = [];
        this.redoStack = [];
        this.lastGroup = "";
        this.lastTime = 0;
    }

    align(value = "") {
        const text = String(value ?? "");
        if (text === this.current) return false;
        this.reset(text);
        return true;
    }

    record(value, {inputType = "", now = Date.now()} = {}) {
        const text = String(value ?? "");
        if (text === this.current) return false;
        const group = undoGroup(inputType);
        const timestamp = Number(now) || 0;
        const coalesced = Boolean(
            group && group === this.lastGroup
            && timestamp >= this.lastTime
            && timestamp - this.lastTime <= this.coalesceMs
        );
        if (!coalesced) {
            this.undoStack.push(this.current);
            if (this.undoStack.length > this.limit) this.undoStack.shift();
        }
        this.current = text;
        this.redoStack = [];
        this.lastGroup = group;
        this.lastTime = timestamp;
        return true;
    }

    undo() {
        if (!this.undoStack.length) return null;
        this.redoStack.push(this.current);
        this.current = this.undoStack.pop();
        this.lastGroup = "";
        return this.current;
    }

    redo() {
        if (!this.redoStack.length) return null;
        this.undoStack.push(this.current);
        this.current = this.redoStack.pop();
        this.lastGroup = "";
        return this.current;
    }
}
