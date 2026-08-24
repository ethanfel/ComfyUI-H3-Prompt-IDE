import {
    H3_ALL_SECTIONS,
    H3_MINIMAX_SPECIAL_TOKENS,
} from "./h3_prompt_schema_core.mjs?v=0.8.0";

export const H3_EDIT_ENCODER_NODE = "TextEncodeH3Edit";

const EDIT_TASKS = Object.freeze({
    "directed | re-pose character": Object.freeze({
        id:"repose",
        label:"Re-pose instruction",
        placeholder:"Describe only the pose transfer. Name the guide picture and what must stay unchanged.",
    }),
    "directed | character swap": Object.freeze({
        id:"character_swap",
        label:"Character-swap instruction",
        placeholder:"Describe the donor character to use and which scene, framing, and action must stay unchanged.",
    }),
    "directed | new camera angle": Object.freeze({
        id:"new_angle",
        label:"New-angle instruction",
        placeholder:"Describe the requested camera move, framing, height, and focal-length constraints.",
    }),
    "directed | frozen scene coverage": Object.freeze({
        id:"scene_coverage",
        label:"Frozen-scene coverage",
        placeholder:"Describe the room to freeze or create, the orbit center, and any per-picture room-design roles.",
    }),
});

function nodeType(node) {
    return node?.comfyClass ?? node?.type ?? null;
}

function widgetValue(node, name) {
    return node?.widgets?.find((widget) => widget.name === name)?.value;
}

function graphLink(graph, link) {
    return link && typeof link === "object" ? link : graph?.links?.[link] ?? null;
}

function editTask(promptMode, qualityProfile) {
    if (String(qualityProfile ?? "").startsWith("character sheet |")) {
        return {
            id:"character_sheet",
            label:"Character-sheet assignment",
            placeholder:"Assign every connected picture a precise identity, wardrobe, pose, or appearance role.",
        };
    }
    return EDIT_TASKS[promptMode] ?? {
        id:"edit",
        label:"Edit instruction",
        placeholder:"Describe only the requested change and what must remain unchanged.",
    };
}

/**
 * Inspect an H3 Prompt IDE STRING output for a direct connection to the prompt
 * socket of TextEncodeH3Edit. The returned context is authoring metadata only;
 * it never rewrites or serializes the user's prompt.
 */
export function downstreamH3EditContext(editorNode) {
    const graph = editorNode?.graph;
    const output = editorNode?.outputs?.find((item) => item.name === "text")
        ?? editorNode?.outputs?.[0];
    const links = (output?.links ?? [])
        .map((link) => graphLink(graph, link))
        .filter(Boolean)
        .sort((left, right) => Number(left.id ?? 0) - Number(right.id ?? 0));

    for (const link of links) {
        const target = graph?.getNodeById?.(link.target_id) ?? null;
        if (nodeType(target) !== H3_EDIT_ENCODER_NODE) continue;
        const input = target?.inputs?.[Number(link.target_slot)];
        if (input?.name !== "prompt") continue;

        const promptMode = String(widgetValue(target, "prompt_mode") ?? "edit instruction");
        const qualityProfile = String(widgetValue(target, "quality_profile") ?? "");
        const primaryImageRole = String(widgetValue(target, "primary_image_role") ?? "");
        const verbatim = promptMode === "use prompt verbatim";
        const task = editTask(promptMode, qualityProfile);
        return {
            mode:verbatim ? "auto" : "edit",
            verbatim,
            task:task.id,
            label:verbatim ? "Verbatim H3 prompt" : task.label,
            placeholder:verbatim
                ? "Write the complete H3 prompt expected by the downstream encoder."
                : task.placeholder,
            promptMode,
            qualityProfile,
            primaryImageRole,
            targetId:target.id,
            signature:[target.id, promptMode, qualityProfile, primaryImageRole].join("\u001f"),
        };
    }
    return null;
}

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
    `^(${SECTION_ALTERNATION}):|(<(?:Picture|Video|Audio|Subject)\\s+\\d+>|<\\/?d>|<\\|(?:cutoff|lyrics_start|lyrics_end|caption_start|caption_end)\\|>|<scenetrans>|<cutoff>|\\(S\\d+(?:,S\\d+)*\\))`,
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
        const specialToken = H3_MINIMAX_SPECIAL_TOKENS.find(
            (token) => token.toLowerCase() === tag,
        );
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
        } else if (["<scenetrans>", "<cutoff>", "<|cutoff|>"].includes(tag)) {
            parts.push({type:"flow", kind:"flow", text,
                unresolved:specialToken ? text !== specialToken : false});
        } else if (tag.startsWith("<|lyrics_")) {
            parts.push({type:"lyrics", kind:"lyrics", text,
                unresolved:text !== specialToken});
        } else if (tag.startsWith("<|caption_")) {
            parts.push({type:"caption", kind:"caption", text,
                unresolved:text !== specialToken});
        } else if (tag.startsWith("(s")) {
            parts.push({type:"speaker", kind:"speaker", text, unresolved:false});
        } else {
            parts.push({type:"dialogue", kind:"dialogue", text,
                unresolved:specialToken ? text !== specialToken : false});
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
