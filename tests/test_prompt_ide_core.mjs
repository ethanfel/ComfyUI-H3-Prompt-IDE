import assert from "node:assert/strict";
import fs from "node:fs";
import {
    audioToken,
    pictureOrdinalFromInputName,
    pictureToken,
    PromptUndoHistory,
    referenceFromInputName,
    tokenizePrompt,
    undoDirection,
    videoToken,
} from "../web/h3_prompt_ide_core.mjs";

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
    "subject_definitions:\n<Subject 1> (S1) says <d>[English] Hi<scenetrans> there<cutoff></d>",
    [],
).filter((part) => part.type !== "text");
assert.deepEqual(h3Syntax.map((part) => part.type), [
    "section", "subject", "speaker", "dialogue", "flow", "flow", "dialogue",
]);

const history = new PromptUndoHistory("a");
history.record("ab", {inputType: "insertText", now: 1});
history.record("abc", {inputType: "insertText", now: 2});
assert.equal(history.undo(), "a");
assert.equal(history.redo(), "abc");
assert.equal(undoDirection({ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: "z"}), "undo");
assert.equal(undoDirection({ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, key: "z"}), "redo");

const source = fs.readFileSync(new URL("../web/h3_prompt_ide.js", import.meta.url), "utf8");
assert.match(source, /createPromptCompletionController/);
assert.match(source, /analyzeH3Prompt/);
assert.match(source, /ensureH3Structure/);
assert.match(source, /"Sections"/);
assert.match(source, /element\("textarea", "h3ide-plain-editor"\)/);
assert.match(source, /state\.richText \? "Rich text" : "Plain text"/);
assert.match(source, /Disable rich text and show the base prompt/);
assert.match(source, /h3ide-token-label/);
assert.match(source, /Type <, \[, \(, or a section name/);
assert.doesNotMatch(source, /Type @, #/);

console.log("H3 Prompt IDE core tests passed");
