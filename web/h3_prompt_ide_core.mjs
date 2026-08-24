import {
    H3_ALL_SECTIONS,
    H3_MINIMAX_SPECIAL_TOKENS,
} from "./h3_prompt_schema_core.mjs?v=0.8.3";

export const H3_EDIT_ENCODER_NODE = "TextEncodeH3Edit";
export const H3_EDIT_OPTIONS_NODE = "H3EditOptions";

const EDIT_OPTION_PRESETS = Object.freeze({
    "still | edit or generate": Object.freeze({
        promptMode:"edit instruction",
        qualityProfile:"recommended | 5-frame context -> 1 image",
    }),
    "directed | re-pose character": Object.freeze({
        promptMode:"directed | re-pose character",
        qualityProfile:"directed change | 39-frame settle -> 1 image",
    }),
    "directed | character swap": Object.freeze({
        promptMode:"directed | character swap",
        qualityProfile:"directed change | 39-frame settle -> 1 image",
    }),
    "directed | new camera angle": Object.freeze({
        promptMode:"directed | new camera angle",
        qualityProfile:"directed change | 39-frame settle -> 1 image",
    }),
    "character sheet | canonical 6 views": Object.freeze({
        promptMode:"edit instruction",
        qualityProfile:"character sheet | 6 panels / 124-frame orbit",
    }),
    "scene coverage | canonical camera path": Object.freeze({
        promptMode:"directed | frozen scene coverage",
        qualityProfile:"scene coverage | 124-frame camera path",
    }),
    "scene coverage | cinematic hard cuts": Object.freeze({
        promptMode:"directed | frozen cinematic cuts",
        qualityProfile:"scene coverage | 124-frame camera path",
    }),
    "advanced | prompt verbatim": Object.freeze({
        promptMode:"use prompt verbatim",
        qualityProfile:"recommended | 5-frame context -> 1 image",
    }),
});

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
    "directed | frozen cinematic cuts": Object.freeze({
        id:"scene_cuts",
        label:"Cinematic scene cuts",
        placeholder:"Name one exact person, object, or fixed point as the coverage target for every camera cut.",
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

function inputSource(node, name) {
    const input = node?.inputs?.find((item) => item.name === name);
    const link = graphLink(node?.graph, input?.link);
    return link ? node.graph?.getNodeById?.(link.origin_id) ?? null : null;
}

function editOptionPreset(target) {
    const source = inputSource(target, "options");
    if (nodeType(source) !== H3_EDIT_OPTIONS_NODE) return null;
    const mode = String(widgetValue(source, "mode") ?? "");
    const preset = EDIT_OPTION_PRESETS[mode];
    if (!preset) return null;
    const showOverrides = Boolean(widgetValue(source, "show_overrides"));
    const profileOverride = String(widgetValue(source, "profile_override") ?? "");
    const qualityProfile = showOverrides
        && profileOverride
        && profileOverride !== "canonical for selected mode"
        ? profileOverride : preset.qualityProfile;
    return {source, mode, promptMode:preset.promptMode, qualityProfile};
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

        const optionPreset = editOptionPreset(target);
        const promptMode = optionPreset?.promptMode
            ?? String(widgetValue(target, "prompt_mode") ?? "edit instruction");
        const qualityProfile = optionPreset?.qualityProfile
            ?? String(widgetValue(target, "quality_profile") ?? "");
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
            signature:[
                target.id,
                promptMode,
                qualityProfile,
                primaryImageRole,
                optionPreset?.source?.id ?? "",
                optionPreset?.mode ?? "",
            ].join("\u001f"),
            ...(optionPreset ? {optionsMode:optionPreset.mode} : {}),
        };
    }
    return null;
}

/**
 * Return a concise, editable instruction for the selected H3 Edit task. The
 * downstream encoder owns the full H3 schema, timing, and transport contracts.
 */
export function editInstructionTemplate(context) {
    if (!context || context.verbatim) return "";
    switch (context.task) {
    case "repose":
        return "Move the person in <Picture 1> into the body pose shown in <Picture 2>. Transfer only limb placement, torso and head orientation, hand positions, weight distribution, and expression. Preserve the identity, face, hairstyle, physique, wardrobe, scene, lighting, lens, framing, and camera position from <Picture 1>.";
    case "character_swap":
        return "Replace the person in <Picture 1> with the character from <Picture 2>. Transfer only the requested identity, face, hair, physique, wardrobe, and accessories. Preserve the source pose, placement, action, scene geometry, camera, perspective, lighting, shadows, and every unaffected object from <Picture 1>.";
    case "new_angle":
        return "Move the camera 45 degrees to camera right around the frozen subject at the same height, distance, and focal length. Preserve the subject identity, pose, expression, wardrobe, props, scene geometry, object placement, materials, colors, and lighting from <Picture 1>.";
    case "character_sheet":
        return "Use <Picture 1> for the character's identity and facial structure. Use each additional connected picture only for its explicitly assigned wardrobe, material, accessory, or appearance detail. Ignore every source background and source pose, then create one coherent full-body character for the turntable sheet.";
    case "scene_coverage":
        if (String(context.primaryImageRole ?? "").startsWith("generate |")) {
            return "Create one completely new coherent room using <Picture 1> and any additional connected pictures as design references only. Combine their explicitly useful architecture, furniture, materials, palette, and lighting without copying any source composition. Establish the complete room first, freeze it, then orbit around its geometric center.";
        }
        return "Freeze the complete physical scene shown in <Picture 1>. Orbit around the geometric center of the room while keeping every person, object, wall, opening, fixture, material, and light source fixed in one shared world coordinate system. Treat any additional connected pictures as alternate views of this exact same scene.";
    case "scene_cuts":
        if (String(context.primaryImageRole ?? "").startsWith("generate |")) {
            return "Create one completely new coherent scene using <Picture 1> and any additional connected pictures as design references only. Coverage target: the primary person or object in the generated scene. Establish the complete scene first, freeze every subject and object, then use instantaneous hard cuts to capture distinct cinematic viewpoints around that exact target.";
        }
        return "Coverage target: the primary person or object in <Picture 1>. Freeze the complete physical scene, including the target's exact pose, expression, wardrobe, surrounding objects, geometry, materials, lighting, and shadows. Use instantaneous hard cuts to capture distinct cinematic viewpoints around that exact target; never animate the scene or show camera travel between views.";
    default:
        return "";
    }
}

export function canAutoReplaceEditInstruction(current, previousTemplate = "") {
    const value = String(current ?? "").trim();
    const previous = String(previousTemplate ?? "").trim();
    return !value || Boolean(previous && value === previous);
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
