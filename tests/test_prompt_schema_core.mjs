import assert from "node:assert/strict";
import {
    analyzeH3Prompt,
    detectH3Mode,
    ensureH3Structure,
    H3_BASE_SECTIONS,
    H3_MINIMAX_SPECIAL_TOKENS,
    H3_REFERENCE_SECTIONS,
    h3AlignmentInstruction,
    insertH3Section,
    parseH3Sections,
    validateH3TaskDirective,
} from "../web/h3_prompt_schema_core.mjs";

assert.equal(detectH3Mode("ordinary prompt"), "t2va");
assert.equal(detectH3Mode("subject_definitions:\n"), "ref2va");
assert.equal(detectH3Mode(h3AlignmentInstruction("i2va")), "i2va");
assert.equal(detectH3Mode(h3AlignmentInstruction("fl2va", {duration:8, finalShot:2})), "fl2va");
assert.equal(detectH3Mode(h3AlignmentInstruction("l2va", {duration:6, finalShot:1})), "l2va");

assert.equal(h3AlignmentInstruction("i2va"),
    "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.");
assert.match(h3AlignmentInstruction("fl2va", {duration:8, finalShot:3}), /Picture 2 \(from Shot 3\).*8\.00-second/);
assert.match(h3AlignmentInstruction("l2va", {duration:6.5, finalShot:2}), /\[Shot 2\].*6\.50-second/);
assert.ok(analyzeH3Prompt(`${h3AlignmentInstruction("i2va")}\n\ntext`, "t2va")
    .problems.some((item) => item.code === "alignment"));
assert.ok(analyzeH3Prompt(`${h3AlignmentInstruction("fl2va", {duration:8})}\n\ntext`, "fl2va", {duration:8})
    .problems.some((item) => item.code === "reference"));

const base = ensureH3Structure("", "t2va").text;
assert.deepEqual(parseH3Sections(base).map((item) => item.name), H3_BASE_SECTIONS);
assert.equal(analyzeH3Prompt(base, "t2va").valid, true);

const ref = ensureH3Structure("", "ref2va").text;
assert.deepEqual(parseH3Sections(ref).map((item) => item.name), H3_REFERENCE_SECTIONS);
assert.equal(analyzeH3Prompt(ref, "ref2va").valid, false);
assert.ok(analyzeH3Prompt(ref, "ref2va").problems.some((item) => item.code === "style"));
assert.match(ref, /summary:\n\[reference generation\]/);

const completeRef = `subject_definitions:
<Subject 1> is a baker in a white apron.

summary:
[reference generation] The target video shows <Subject 1> opening a bakery.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - the baker and apron remain consistent.

detailed_description:
The target video uses a cinematic live-action style with soft morning light.
[Shot 1] <Subject 1> opens the bakery shutters.
[Shot 2] At 00:03.500, the camera cuts to bread on the counter.

overall_soundscape:
Wooden shutters scrape over quiet room tone.

non_diegetic_music:
N/A`;
assert.equal(analyzeH3Prompt(completeRef, "ref2va").valid, true);

const partial = "integrated_multimodal_description: [Shot 1] A room.\n\nnon_diegetic_music: N/A";
const inserted = insertH3Section(partial, "overall_soundscape", "t2va");
assert.equal(inserted.added, true);
assert.deepEqual(parseH3Sections(inserted.text).map((item) => item.name), H3_BASE_SECTIONS);

const wrongOrder = "overall_soundscape: room\n\nintegrated_multimodal_description: [Shot 1] room\n\nnon_diegetic_music: N/A";
assert.ok(analyzeH3Prompt(wrongOrder, "t2va").problems.some((item) => item.code === "order"));
assert.ok(analyzeH3Prompt("Integrated Multimodal Description: text", "t2va")
    .problems.some((item) => item.code === "format"));
assert.ok(analyzeH3Prompt(base.replace("overall_soundscape:", ""), "t2va")
    .problems.some((item) => item.code === "missing"));
assert.ok(analyzeH3Prompt(`${base}\n<d>open`, "t2va")
    .problems.some((item) => item.code === "dialogue"));
assert.ok(analyzeH3Prompt(base.replace("[Shot 1]", "[Shot 2]"), "t2va")
    .problems.some((item) => item.code === "shots"));
assert.ok(analyzeH3Prompt(base.replace("[Shot 1]", "[Shot 1] A. [Shot 2] Later"), "t2va")
    .problems.some((item) => item.code === "timestamp"));
assert.ok(analyzeH3Prompt(`${base}\n<d>Hello</d>`, "t2va")
    .problems.some((item) => item.code === "language"));
assert.ok(analyzeH3Prompt(`${base}\n<scenetrans>`, "t2va")
    .problems.some((item) => item.code === "dialogue_flow"));

assert.deepEqual(H3_MINIMAX_SPECIAL_TOKENS, [
    "<d>", "</d>", "<|cutoff|>", "<|lyrics_start|>",
    "<|lyrics_end|>", "<|caption_start|>", "<|caption_end|>",
]);
const supportedSpecialSyntax = `${base}
<d>[English] Stop here<|cutoff|></d>
<|lyrics_start|>A lyric line<|lyrics_end|>
<|caption_start|>A caption<|caption_end|>`;
assert.equal(analyzeH3Prompt(supportedSpecialSyntax, "t2va").problems
    .filter((item) => ["special_token", "special_pair", "dialogue_flow"].includes(item.code)).length, 0);
assert.ok(analyzeH3Prompt(`${base}\n<|cutoff|>`, "t2va")
    .problems.some((item) => item.code === "dialogue_flow"));
assert.ok(analyzeH3Prompt(`${base}\n<|lyrics_start|>open`, "t2va")
    .problems.some((item) => item.code === "special_pair"));
assert.ok(analyzeH3Prompt(`${base}\n<|caption_end|>`, "t2va")
    .problems.some((item) => item.code === "special_pair"));
assert.ok(analyzeH3Prompt(`${base}\n<|Lyrics_start|>bad case<|lyrics_end|>`, "t2va")
    .problems.some((item) => item.code === "special_token"));
assert.ok(analyzeH3Prompt(`${base}\n<d>[English] legacy<cutoff></d>`, "t2va")
    .problems.some((item) => item.code === "legacy_token"));

const mediaReferences = `${base}\n<Picture 1> <Video 1> <Audio 1>`;
assert.equal(analyzeH3Prompt(mediaReferences, "t2va", {
    connectedReferences:[
        {token:"<Picture 1>"},
        {token:"<Video 1>"},
        {token:"<Audio 1>"},
    ],
}).problems.filter((item) => item.code === "reference").length, 0);
assert.deepEqual(analyzeH3Prompt(mediaReferences, "t2va")
    .problems.filter((item) => item.code === "reference").map((item) => item.message), [
        "<Picture 1> has no connected authoring reference",
        "<Video 1> has no connected authoring reference",
        "<Audio 1> has no connected authoring reference",
    ]);

assert.equal(validateH3TaskDirective("[video continuation + keyframe completion] target").valid, true);
assert.equal(validateH3TaskDirective("[video editing + video continuation] target").valid, false);
assert.equal(validateH3TaskDirective("[audio reuse + audio reference] target").valid, false);
assert.equal(validateH3TaskDirective("[audio reuse + reference generation] target").valid, false);

console.log("H3 strict schema, alignment, insertion, and diagnostics tests passed");
