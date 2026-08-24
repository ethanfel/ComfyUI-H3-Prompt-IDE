import assert from "node:assert/strict";
import fs from "node:fs";
import {
    audioToken,
    canAutoReplaceEditInstruction,
    downstreamH3EditContext,
    editInstructionTemplate,
    pictureOrdinalFromInputName,
    pictureToken,
    PromptUndoHistory,
    referenceFromInputName,
    tokenizePrompt,
    undoDirection,
    videoToken,
} from "../web/h3_prompt_ide_core.mjs";
import {H3_MINIMAX_SPECIAL_TOKENS} from "../web/h3_prompt_schema_core.mjs";

assert.equal(pictureToken(1), "<Picture 1>");
assert.equal(pictureToken(9), "<Picture 9>");
assert.equal(pictureToken(0), null);
assert.equal(pictureOrdinalFromInputName("pictures.<Picture 7>"), 7);
assert.equal(pictureOrdinalFromInputName("<Picture 2>"), 2);
assert.equal(pictureOrdinalFromInputName("ref_image_0"), null);
assert.equal(videoToken(1), "<Video 1>");
assert.equal(videoToken(3), "<Video 3>");
assert.equal(videoToken(4), null);
assert.equal(audioToken(1), "<Audio 1>");
assert.equal(audioToken(6), "<Audio 6>");
assert.equal(audioToken(7), null);
assert.deepEqual(referenceFromInputName("videos.<Video 2>"), {
    kind:"video", ordinal:2, token:"<Video 2>",
});
assert.deepEqual(referenceFromInputName("audios.<Audio 4>"), {
    kind:"audio", ordinal:4, token:"<Audio 4>",
});

function editGraph({
    promptMode="edit instruction",
    qualityProfile="recommended | 9-frame settle -> 1 image",
    primaryImageRole="edit | strong scene anchor (FL2VA)",
    inputName="prompt",
    targetType="TextEncodeH3Edit",
    optionsMode=null,
    optionsShowOverrides=false,
    optionsProfileOverride="canonical for selected mode",
} = {}) {
    const target = {
        id:22,
        type:targetType,
        inputs:[{name:inputName}, {name:"options", link:optionsMode ? 8 : null}],
        widgets:[
            {name:"prompt_mode", value:promptMode},
            {name:"quality_profile", value:qualityProfile},
            {name:"primary_image_role", value:primaryImageRole},
        ],
    };
    const graph = {
        links:{
            7:{id:7, origin_id:11, origin_slot:0, target_id:22, target_slot:0},
            8:{id:8, origin_id:33, origin_slot:0, target_id:22, target_slot:1},
        },
        getNodeById:(id) => id === 22 ? target : id === 33 ? {
            id:33,
            type:"H3EditOptions",
            graph,
            widgets:[
                {name:"mode", value:optionsMode},
                {name:"show_overrides", value:optionsShowOverrides},
                {name:"profile_override", value:optionsProfileOverride},
            ],
        } : null,
    };
    target.graph = graph;
    return {id:11, graph, outputs:[{name:"text", links:[7]}]};
}

assert.deepEqual(downstreamH3EditContext(editGraph({
    promptMode:"directed | re-pose character",
})), {
    mode:"edit",
    verbatim:false,
    task:"repose",
    label:"Re-pose instruction",
    placeholder:"Describe only the pose transfer. Name the guide picture and what must stay unchanged.",
    promptMode:"directed | re-pose character",
    qualityProfile:"recommended | 9-frame settle -> 1 image",
    primaryImageRole:"edit | strong scene anchor (FL2VA)",
    targetId:22,
    signature:"22\u001fdirected | re-pose character\u001frecommended | 9-frame settle -> 1 image\u001fedit | strong scene anchor (FL2VA)\u001f\u001f",
});
assert.equal(downstreamH3EditContext(editGraph({inputName:"clip"})), null);
assert.equal(downstreamH3EditContext(editGraph({targetType:"CLIPTextEncode"})), null);
assert.equal(downstreamH3EditContext(editGraph({
    qualityProfile:"character sheet | 6 panels / 124-frame orbit",
}))?.label, "Character-sheet assignment");
assert.deepEqual(downstreamH3EditContext(editGraph({
    promptMode:"directed | frozen scene coverage",
    qualityProfile:"scene coverage | 243-frame camera path",
})), {
    mode:"edit",
    verbatim:false,
    task:"scene_coverage",
    label:"Frozen-scene coverage",
    placeholder:"Describe the room to freeze or create, the orbit center, and any per-picture room-design roles.",
    promptMode:"directed | frozen scene coverage",
    qualityProfile:"scene coverage | 243-frame camera path",
    primaryImageRole:"edit | strong scene anchor (FL2VA)",
    targetId:22,
    signature:"22\u001fdirected | frozen scene coverage\u001fscene coverage | 243-frame camera path\u001fedit | strong scene anchor (FL2VA)\u001f\u001f",
});
assert.deepEqual(downstreamH3EditContext(editGraph({
    promptMode:"use prompt verbatim",
}))?.mode, "auto");

const anchoredCoverage = downstreamH3EditContext(editGraph({
    promptMode:"directed | frozen scene coverage",
    qualityProfile:"scene coverage | 243-frame camera path",
}));
assert.match(editInstructionTemplate(anchoredCoverage), /Freeze the complete physical scene/);
assert.match(editInstructionTemplate(anchoredCoverage), /geometric center of the room/);
assert.match(editInstructionTemplate(anchoredCoverage), /alternate views of this exact same scene/);
const semanticCoverage = downstreamH3EditContext(editGraph({
    promptMode:"directed | frozen scene coverage",
    qualityProfile:"scene coverage | 243-frame camera path",
    primaryImageRole:"generate | semantic Picture 1 (FL2VA)",
}));
assert.match(editInstructionTemplate(semanticCoverage), /completely new coherent room/);
assert.match(editInstructionTemplate(semanticCoverage), /design references only/);
assert.equal(editInstructionTemplate(downstreamH3EditContext(editGraph({
    promptMode:"use prompt verbatim",
}))), "");
assert.equal(canAutoReplaceEditInstruction("", "old template"), true);
assert.equal(canAutoReplaceEditInstruction("old template", "old template"), true);
assert.equal(canAutoReplaceEditInstruction("my custom prompt", "old template"), false);

const optionCoverage = downstreamH3EditContext(editGraph({
    promptMode:"edit instruction",
    qualityProfile:"experimental | true 1 frame (low quality)",
    optionsMode:"scene coverage | canonical camera path",
}));
assert.equal(optionCoverage.task, "scene_coverage");
assert.equal(optionCoverage.qualityProfile, "scene coverage | 124-frame camera path");
assert.equal(optionCoverage.optionsMode, "scene coverage | canonical camera path");
assert.match(editInstructionTemplate(optionCoverage), /Freeze the complete physical scene/);

const optionCinematicCuts = downstreamH3EditContext(editGraph({
    promptMode:"edit instruction",
    qualityProfile:"experimental | true 1 frame (low quality)",
    optionsMode:"scene coverage | cinematic hard cuts",
}));
assert.equal(optionCinematicCuts.task, "scene_cuts");
assert.equal(optionCinematicCuts.label, "Cinematic scene cuts");
assert.equal(optionCinematicCuts.promptMode, "directed | frozen cinematic cuts");
assert.equal(optionCinematicCuts.qualityProfile, "scene coverage | 124-frame camera path");
assert.match(editInstructionTemplate(optionCinematicCuts), /Coverage target:/);
assert.match(editInstructionTemplate(optionCinematicCuts), /instantaneous hard cuts/);
assert.match(editInstructionTemplate(optionCinematicCuts), /never animate the scene/);

const parts = tokenizePrompt(
    "Use <Picture 1>, <Picture 2>, <Video 1>, <Audio 1>, and <Audio 2>. <d>Hello</d>",
    [
        {kind:"picture", ordinal:1, token:"<Picture 1>"},
        {kind:"video", ordinal:1, token:"<Video 1>"},
        {kind:"audio", ordinal:1, token:"<Audio 1>"},
    ],
);
assert.deepEqual(
    parts.filter((part) => part.type === "reference")
        .map((part) => [part.text, part.unresolved]),
    [
        ["<Picture 1>", false],
        ["<Picture 2>", true],
        ["<Video 1>", false],
        ["<Audio 1>", false],
        ["<Audio 2>", true],
    ],
);
assert.equal(parts.filter((part) => part.type === "dialogue").length, 2);
assert.deepEqual(tokenizePrompt("Use @hero", [1]), [{type:"text", text:"Use @hero"}]);

const h3Syntax = tokenizePrompt(
    "subject_definitions:\n<Subject 1> (S1) says <d>[English] Hi<scenetrans> there<|cutoff|></d>",
    [],
).filter((part) => part.type !== "text");
assert.deepEqual(h3Syntax.map((part) => part.type), [
    "section", "subject", "speaker", "dialogue", "flow", "flow", "dialogue",
]);

const specialSyntax = tokenizePrompt(H3_MINIMAX_SPECIAL_TOKENS.join(" "))
    .filter((part) => part.type !== "text");
assert.deepEqual(specialSyntax.map((part) => [part.text, part.kind, part.unresolved]), [
    ["<d>", "dialogue", false],
    ["</d>", "dialogue", false],
    ["<|cutoff|>", "flow", false],
    ["<|lyrics_start|>", "lyrics", false],
    ["<|lyrics_end|>", "lyrics", false],
    ["<|caption_start|>", "caption", false],
    ["<|caption_end|>", "caption", false],
]);
assert.equal(tokenizePrompt("<|Lyrics_start|>")[0].unresolved, true);

const history = new PromptUndoHistory("a");
history.record("ab", {inputType: "insertText", now: 1});
history.record("abc", {inputType: "insertText", now: 2});
assert.equal(history.undo(), "a");
assert.equal(history.redo(), "abc");
assert.equal(undoDirection({ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: "z"}), "undo");
assert.equal(undoDirection({ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, key: "z"}), "redo");

const source = fs.readFileSync(new URL("../web/h3_prompt_ide.js", import.meta.url), "utf8");
assert.match(source, /createPromptCompletionController/);
assert.match(source, /repairLegacyWidgetWidth\(domWidget\)/);
assert.match(source, /analyzeH3Prompt/);
assert.match(source, /ensureH3Structure/);
assert.match(source, /downstreamH3EditContext/);
assert.match(source, /applyEditTaskTemplate/);
assert.match(source, /"Task template"/);
assert.match(source, /This replaces the current prompt text/);
assert.match(source, /Edit encoder adds its full H3 timing and task wrapper downstream/);
assert.match(source, /"Sections"/);
assert.match(source, /element\("textarea", "h3ide-plain-editor"\)/);
assert.match(source, /state\.richText \? "Rich text" : "Plain text"/);
assert.match(source, /Disable rich text and show the base prompt/);
assert.match(source, /h3ide-token-label/);
assert.match(source, /Type <, \[, \(, or a section name/);
assert.doesNotMatch(source, /Type @, #/);

console.log("H3 Prompt IDE core tests passed");
