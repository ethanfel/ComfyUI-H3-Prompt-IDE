import assert from "node:assert/strict";
import fs from "node:fs";
import {
    applyPromptCompletion,
    promptCompletionItems,
    promptCompletionQuery,
    promptRetentionReplacementQuery,
    promptTokenReplacementQuery,
} from "../web/h3_prompt_completion_core.mjs";
import {
    H3_AUDIO_RETENTION_MARKERS,
    H3_MINIMAX_SPECIAL_TOKENS,
    H3_VISUAL_RETENTION_MARKERS,
} from "../web/h3_prompt_schema_core.mjs";

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

const pastedReference = "<Audio 1>: reference - its vocal timbre guides <Subject 1>.";
const pastedAudioQuery = promptCompletionQuery(pastedReference, 6);
assert.deepEqual(pastedAudioQuery, {
    trigger:"<", start:0, end:9, typed:"<Audio 1>", query:"Audio",
    manual:false, replacement:true, allowDelete:true,
});
const audioReplacement = promptCompletionItems(pastedAudioQuery, records)
    .find((item) => item.label === "<Audio 2>");
assert.deepEqual(applyPromptCompletion(pastedReference, pastedAudioQuery, audioReplacement), {
    text:"<Audio 2>: reference - its vocal timbre guides <Subject 1>.", caret:9,
});
const subjectStart = pastedReference.indexOf("<Subject 1>");
assert.equal(promptCompletionQuery(pastedReference, subjectStart + 5).end,
    subjectStart + "<Subject 1>".length);

const richTokenQuery = promptTokenReplacementQuery("Use <Picture 1> here", 4, 15);
assert.deepEqual(richTokenQuery, {
    trigger:"<", start:4, end:15, typed:"<Picture 1>", query:"Picture",
    manual:false, replacement:true, allowDelete:true,
});
assert.deepEqual(promptCompletionItems(richTokenQuery, records).map((item) => item.label), [
    "<Picture 1>", "<Picture 2>", "<Picture 3>", "<Picture 4>", "<Picture 5>",
    "<Picture 6>", "<Picture 7>", "<Picture 8>", "<Picture 9>",
    "Delete <Picture 1>",
]);
const deletePicture = promptCompletionItems(richTokenQuery, records).at(-1);
assert.deepEqual(applyPromptCompletion("Use <Picture 1> here", richTokenQuery, deletePicture), {
    text:"Use here", caret:4,
});
const joinedTokenQuery = promptTokenReplacementQuery("Use<Picture 1>  here", 3, 14);
assert.deepEqual(applyPromptCompletion(
    "Use<Picture 1>  here", joinedTokenQuery,
    promptCompletionItems(joinedTokenQuery, records).at(-1),
), {text:"Use here", caret:3});
assert.equal(promptTokenReplacementQuery("(S2)", 0, 4).query, "S");
assert.equal(promptTokenReplacementQuery("subject_definitions:", 0, 20), null);

const retentionPrompt = `subject_definitions:
<Subject 1> is a baker.

retention_analysis:
<Subject 1> (appears in [Shot 1]): weak_reference - only the broad wardrobe palette remains.
<Audio 1>: reference - its vocal timbre guides the delivery.

detailed_description:
[Shot 1] The weak_reference phrase here is ordinary prose.`;
const visualMarker = retentionPrompt.indexOf("weak_reference");
const visualRetentionQuery = promptRetentionReplacementQuery(
    retentionPrompt, visualMarker + 4,
);
assert.equal(visualRetentionQuery.trigger, "retention_visual");
assert.deepEqual(
    promptCompletionItems(visualRetentionQuery).map((item) => item.label),
    [...H3_VISUAL_RETENTION_MARKERS],
);
const audioMarker = retentionPrompt.indexOf(": reference") + 2;
const audioRetentionQuery = promptRetentionReplacementQuery(
    retentionPrompt, audioMarker + 3,
);
assert.equal(audioRetentionQuery.trigger, "retention_audio");
assert.deepEqual(
    promptCompletionItems(audioRetentionQuery).map((item) => item.label),
    [...H3_AUDIO_RETENTION_MARKERS],
);
const proseMarker = retentionPrompt.lastIndexOf("weak_reference");
assert.equal(promptRetentionReplacementQuery(retentionPrompt, proseMarker + 4), null);

const visualInsertionPrompt = "retention_analysis:\n<Subject 1>: ";
const visualInsertionQuery = promptCompletionQuery(
    visualInsertionPrompt, visualInsertionPrompt.length, {manual:true},
);
assert.equal(visualInsertionQuery.trigger, "retention_visual");
assert.deepEqual(
    promptCompletionItems(visualInsertionQuery).map((item) => item.label),
    [...H3_VISUAL_RETENTION_MARKERS],
);
const fullyPreserved = promptCompletionItems(visualInsertionQuery)[0];
assert.deepEqual(
    applyPromptCompletion(visualInsertionPrompt, visualInsertionQuery, fullyPreserved),
    {
        text:`${visualInsertionPrompt}fully_preserved - `,
        caret:`${visualInsertionPrompt}fully_preserved - `.length,
    },
);
const partialInsertionPrompt = `${visualInsertionPrompt}wea`;
const partialInsertionQuery = promptCompletionQuery(
    partialInsertionPrompt, partialInsertionPrompt.length,
);
assert.deepEqual(promptCompletionItems(partialInsertionQuery).map((item) => item.label), [
    "weak_reference",
]);
assert.deepEqual(applyPromptCompletion(
    partialInsertionPrompt,
    partialInsertionQuery,
    promptCompletionItems(partialInsertionQuery)[0],
), {
    text:`${visualInsertionPrompt}weak_reference - `,
    caret:`${visualInsertionPrompt}weak_reference - `.length,
});
const insertionBeforeProse = `${visualInsertionPrompt}wea existing explanation`;
const insertionBeforeProseQuery = promptCompletionQuery(
    insertionBeforeProse, visualInsertionPrompt.length + 3,
);
assert.equal(applyPromptCompletion(
    insertionBeforeProse,
    insertionBeforeProseQuery,
    promptCompletionItems(insertionBeforeProseQuery)[0],
).text, `${visualInsertionPrompt}weak_reference - existing explanation`);
const misplacedColonSpace = "retention_analysis:\n<Picture 1> :wea";
const misplacedColonQuery = promptCompletionQuery(
    misplacedColonSpace, misplacedColonSpace.length,
);
assert.equal(applyPromptCompletion(
    misplacedColonSpace,
    misplacedColonQuery,
    promptCompletionItems(misplacedColonQuery)[0],
).text, "retention_analysis:\n<Picture 1>: weak_reference - ");
const audioInsertionPrompt = "retention_analysis:\n<Audio 1>: ful";
const audioInsertionQuery = promptCompletionQuery(
    audioInsertionPrompt, audioInsertionPrompt.length,
);
assert.equal(audioInsertionQuery.trigger, "retention_audio");
assert.deepEqual(promptCompletionItems(audioInsertionQuery).map((item) => item.label), [
    "fully_copy",
]);
const visualReplacement = promptCompletionItems(visualRetentionQuery)
    .find((item) => item.label === "fully_preserved");
assert.equal(
    applyPromptCompletion(retentionPrompt, visualRetentionQuery, visualReplacement).text,
    retentionPrompt.replace("weak_reference", "fully_preserved"),
);

const pictures = promptCompletionItems(promptCompletionQuery("<Pic", 4), records);
assert.deepEqual(pictures.map((item) => item.label), [
    "<Picture 1>", "<Picture 2>", "<Picture 3>", "<Picture 4>", "<Picture 5>",
    "<Picture 6>", "<Picture 7>", "<Picture 8>", "<Picture 9>",
]);
assert.match(pictures[0].detail, /Connected/);
assert.match(promptCompletionItems(promptCompletionQuery("<Vid", 4), records)[0].detail, /Connected/);
assert.match(promptCompletionItems(promptCompletionQuery("<Aud", 4), records)[0].detail, /Connected/);
assert.deepEqual(applyPromptCompletion("Use <Pic", promptCompletionQuery("Use <Pic", 8), pictures[0]), {
    text:"Use <Picture 1> ", caret:16,
});
assert.deepEqual(applyPromptCompletion("<Pic next", promptCompletionQuery("<Pic next", 4), pictures[0]), {
    text:"<Picture 1> next", caret:12,
});
assert.ok(promptCompletionItems(promptCompletionQuery("<sce", 4), records)
    .some((item) => item.label === "<scenetrans>"));
assert.ok(promptCompletionItems(promptCompletionQuery("<cut", 4), records)
    .some((item) => item.label === "<|cutoff|>"));
const lyricsQuery = promptCompletionQuery("<|lyr", "<|lyr".length);
const lyricsPair = promptCompletionItems(lyricsQuery, records)[0];
assert.equal(lyricsPair.label, "<|lyrics_start|>…<|lyrics_end|>");
assert.equal(applyPromptCompletion("<|lyr", lyricsQuery, lyricsPair).caret,
    "<|lyrics_start|>".length);
assert.ok(promptCompletionItems(
    promptCompletionQuery("<|cap", "<|cap".length), records,
).some((item) => item.label === "<|caption_start|>…<|caption_end|>"));
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
for (const token of H3_MINIMAX_SPECIAL_TOKENS) {
    assert.ok(manual.some((item) => item.insertText.includes(token)), `Missing ${token}`);
}
const editManual = promptCompletionItems(
    promptCompletionQuery("", 0, {manual:true}), records,
    {text:"", mode:"edit", limit:200},
);
assert.equal(editManual.some((item) => item.kind === "section"), false);
assert.ok(editManual.some((item) => item.label === "<Picture 1>"));

const completionSource = fs.readFileSync(
    new URL("../web/h3_prompt_completion_core.mjs", import.meta.url), "utf8");
const acceptBody = completionSource.match(/function accept\(index = selected\) \{([\s\S]*?)\n    \}/)?.[1] ?? "";
assert.ok(acceptBody.indexOf("input.focus()") < acceptBody.indexOf("replaceText(result, item)"));

console.log("H3 standalone completion tests passed");
