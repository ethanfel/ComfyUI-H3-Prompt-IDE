import {H3_ALL_SECTIONS} from "./h3_prompt_schema_core.mjs?v=0.2.0";

export const H3_PICTURE_LIMIT = 9;

export function pictureToken(ordinal) {
    const value = Math.trunc(Number(ordinal));
    return Number.isInteger(value) && value >= 1 && value <= H3_PICTURE_LIMIT
        ? `<Picture ${value}>` : null;
}

export function pictureOrdinalFromInputName(name) {
    const match = String(name ?? "").match(
        /^(?:pictures\.)?<Picture\s+([1-9])>$/i,
    );
    return match ? Number(match[1]) : null;
}

const SECTION_ALTERNATION = H3_ALL_SECTIONS.join("|");
const TOKEN_PATTERN = new RegExp(
    `^(${SECTION_ALTERNATION}):|(<(?:Picture|Video|Audio|Subject)\\s+\\d+>|<\\/?d>|<scenetrans>|<cutoff>|\\(S\\d+(?:,S\\d+)*\\))`,
    "gim",
);

export function tokenizePrompt(value, connectedPictures = []) {
    const source = String(value ?? "");
    const connected = new Set(
        connectedPictures.map(Number).filter(Number.isInteger),
    );
    const parts = [];
    let offset = 0;
    for (const match of source.matchAll(TOKEN_PATTERN)) {
        const index = match.index ?? 0;
        if (index > offset) parts.push({type: "text", text: source.slice(offset, index)});
        const text = match[0];
        const tag = text.toLowerCase();
        const section = tag.endsWith(":")
            ? H3_ALL_SECTIONS.find((item) => `${item}:` === tag) : null;
        const picture = tag.match(/^<picture\s+(\d+)>$/);
        if (section) {
            parts.push({type:"section", kind:"section", text, section,
                unresolved:text !== `${section}:`});
        } else if (picture) {
            const ordinal = Number(picture[1]);
            parts.push({
                type: "reference",
                kind: "picture",
                text,
                ordinal,
                unresolved: !connected.has(ordinal),
            });
        } else if (tag.startsWith("<video")) {
            parts.push({type: "reference", kind: "video", text, unresolved: false});
        } else if (tag.startsWith("<audio")) {
            parts.push({type: "reference", kind: "audio", text, unresolved: false});
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
