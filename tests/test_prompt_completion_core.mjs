import assert from "node:assert/strict";
import {
    applyPromptCompletion,
    promptCompletionItems,
    promptCompletionQuery,
} from "../web/h3_prompt_completion_core.mjs";

const records = [
    {kind:"picture", token:"<Picture 1>", ordinal:1},
    {kind:"picture", token:"<Picture 2>", ordinal:2},
    {kind:"video", token:"<Video 1>", ordinal:1},
    {kind:"audio", token:"<Audio 1>", ordinal:1},
];

assert.equal(promptCompletionQuery("Use @hero", 9), null);
assert.equal(promptCompletionQuery("Use <Pic", 8).trigger, "<");
assert.equal(promptCompletionQuery("Use [key", 8).trigger, "[");
assert.equal(promptCompletionQuery("Speaker (S", 10).trigger, "(");
assert.equal(promptCompletionQuery("subject_def", 11).trigger, "section");

const pictures = promptCompletionItems(promptCompletionQuery("<Pic", 4), records);
assert.deepEqual(pictures.map((item) => item.label), [
    "<Picture 1>", "<Picture 2>", "<Picture 3>", "<Picture 4>", "<Picture 5>",
    "<Picture 6>", "<Picture 7>", "<Picture 8>", "<Picture 9>",
]);
assert.match(pictures[0].detail, /Connected/);
assert.match(promptCompletionItems(promptCompletionQuery("<Vid", 4), records)[0].detail, /Connected/);
assert.match(promptCompletionItems(promptCompletionQuery("<Aud", 4), records)[0].detail, /Connected/);
assert.ok(promptCompletionItems(promptCompletionQuery("<sce", 4), records)
    .some((item) => item.label === "<scenetrans>"));
assert.ok(promptCompletionItems(promptCompletionQuery("<cut", 4), records)
    .some((item) => item.label === "<cutoff>"));
assert.ok(promptCompletionItems(promptCompletionQuery("[key", 4), records)
    .some((item) => item.label === "[keyframe completion]"));
assert.equal(promptCompletionItems(promptCompletionQuery("(S2", 3), records)[0].label, "(S2)");

const refSection = promptCompletionItems(
    promptCompletionQuery("subject_def", 11), records,
    {text:"subject_definitions:\n", mode:"ref2va"},
)[0];
assert.equal(refSection.label, "subject_definitions:");
assert.deepEqual(applyPromptCompletion("subject_def", promptCompletionQuery("subject_def", 11), refSection), {
    text:"subject_definitions:", caret:20,
});

const dialogue = promptCompletionItems(promptCompletionQuery("<d", 2), records)[0];
assert.equal(dialogue.insertText, "<d></d>");
assert.equal(applyPromptCompletion("<d", promptCompletionQuery("<d", 2), dialogue).caret, 3);

const manual = promptCompletionItems(
    promptCompletionQuery("", 0, {manual:true}), records,
    {text:"", mode:"t2va", limit:200},
);
assert.ok(manual.some((item) => item.label === "integrated_multimodal_description:"));
assert.ok(manual.some((item) => item.label === "[English]"));
assert.ok(manual.some((item) => item.label === "[unclear]"));
assert.ok(manual.some((item) => item.label === "(S1)"));

console.log("H3 standalone completion tests passed");
