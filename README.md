<p align="center">
  <img src="assets/github-social-preview.svg" alt="H3 Prompt IDE — rich H3 prompt authoring for ComfyUI" width="100%">
</p>

# H3 Prompt IDE for ComfyUI

A VS Code-inspired prompt editor for MiniMax H3. It provides rich editing, strict H3 sections, completions, reference previews, and a normal ComfyUI `STRING` output.

## Install

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ethanfel/ComfyUI-H3-Prompt-IDE.git
```

Restart ComfyUI, then find the nodes under **text → H3 Prompt IDE**.

## Use

1. Add **H3 Reference Inputs** and **H3 Prompt IDE**.
2. Connect images, video frame batches, or audio to the matching H3-labelled sockets.
3. Connect `references` to the Prompt IDE.
4. Connect the IDE's `text` output to your H3 prompt input.

`H3 Reference Inputs` handles labels and previews only. For Ref2VA generation, connect the same media loaders to the matching inputs on the native H3 conditioner. Video sockets use ComfyUI `IMAGE` frame batches, matching the native H3 `ref_videos` inputs.

### MiniMax H3 Edit integration

Connect the IDE's `text` output directly to the `prompt` input on
[`TextEncodeH3Edit`](https://github.com/ethanfel/ComfyUI-MiniMax-H3-Edit).
The schema selector automatically shows an **Edit** category and follows the
encoder's current task: edit instruction, re-pose, character swap, new camera
angle, character-sheet assignment, continuous frozen-scene coverage, or cinematic frozen-scene cuts. Changing the task/profile on the Edit
encoder updates the IDE context live.

With MiniMax H3 Edit 0.10.0 or later, connect **H3 Edit Options** to the encoder
and choose one canonical `mode`. Prompt IDE reads that Options node directly,
so changing only its mode updates the visible instruction; the encoder's hidden
legacy task/profile values cannot leave the IDE in the wrong category.
The **Room + object study** preset requires MiniMax H3 Edit 0.11.0 or later.

For frozen-scene coverage, use the IDE instruction to identify the room or
scene, declare the orbit center, and assign each optional `<Picture N>` as an
alternate angle or room-design reference. The connected encoder writes the
exact multi-view timing, world-freeze contract, and first/final keyframe
alignment. Semantic generation mode can therefore describe a completely new
room without turning the IDE text into a full Ref2VA prompt manually.

For cinematic cuts, name one exact visible person, object, architectural
feature, or fixed point as the coverage target. The Edit encoder turns that
short instruction into eight timed static shots with true hard cuts and no
intermediate camera travel.

For **Room + object study**, treat the connected pictures as equal,
complementary Qwen-only survey views of one physical room and name one exact
target object. The legacy `source_image` socket only assigns the `<Picture 1>`
ordinal in this preset; it does not make that picture a master, source frame,
pixel/composition anchor, or VAE keyframe. The Edit
encoder selects the 362-frame semantic reconstruction preset automatically and
compiles six room-establishing shots plus 10 contextual object-study shots.
Each object view retains the complete object, its floor/rug contact, and room
anchors while locking its orientation; background parallax shows that only the
camera changed position.

When a directed task or character-sheet profile is selected, the IDE loads a
short task-specific starting instruction. Empty text and the previous generated
template update automatically after a live task change; if the editor contains custom text, the IDE asks
before replacing it. Loading or switching workflows only restores the detected task context and never opens a replacement confirmation. **Task template** can restore the current task's starting
instruction at any time. Edit that short instruction directly—the downstream
Edit encoder adds its full H3 task/timing wrapper. When the encoder uses `use
prompt verbatim`, the IDE returns to the manually selected full H3 schema and
does not offer a task template.

## Nodes

- **H3 Prompt IDE** — rich editor with a Plain/Rich source toggle, T2VA, I2VA, FL2VA, L2VA, Ref2VA, and downstream Edit-instruction validation; H3-aware completion with automatic reference-label spacing; click-to-replace or delete reference, shot, language, task-directive, and speaker tokens; contextual insertion and Ctrl/Cmd-click replacement for unstyled `retention_analysis` markers; section insertion; diagnostics; and plain-text output.
- **H3 Reference Inputs** — independently autogrows `<Picture 1>`–`<Picture 9>`, `<Video 1>`–`<Video 3>`, and `<Audio 1>`–`<Audio 6>` while keeping media sockets off the editor node.

Reference associations use H3's native `<Picture 1>`, `<Video 1>`, and `<Audio 1>` naming. Audio labels must follow native presentation order: connected video soundtracks first, then standalone audio. This standalone editor intentionally does not include Motion Context `@tag` or `@@@@tag` compilation.

The editor also completes, highlights, and validates MiniMax H3's exact
case-sensitive tokenizer tokens: `<d>`, `</d>`, `<|cutoff|>`,
`<|lyrics_start|>`, `<|lyrics_end|>`, `<|caption_start|>`, and
`<|caption_end|>`. Correct single-token encoding requires a ComfyUI build with
[PR #15808](https://github.com/Comfy-Org/ComfyUI/pull/15808) or its merged
equivalent. Existing `<cutoff>` text remains readable, but the IDE recommends
the tokenizer-native `<|cutoff|>` form.

Requires a current ComfyUI version with the V3 node API and `Autogrow` support.

The editor includes a scoped workaround for the recurring [LiteGraph widget-width bug](https://github.com/Comfy-Org/ComfyUI_frontend/issues/12443), so it resizes correctly without a separate repair node.

## Credits

H3 Prompt IDE is a standalone adaptation of the Rich Scene Prompt Editor
originally developed for
[ComfyUI-MiniMaxH3-Contex-Loop](https://github.com/ethanfel/ComfyUI-MiniMaxH3-Contex-Loop/tree/feature/0.5-workflow-ux).
The Motion Context-specific plan, history, optimizer, `@tag`, and `@@@@tag`
integration was removed here to provide a normal text-output node.

The rich reference presentation, media miniatures, quick-reference interaction,
and compact authoring layout were inspired by
[ComfyUI-MiniMaxH3-Easy](https://github.com/nkxx188/ComfyUI-MiniMaxH3-Easy)
by **nkxx188**. The standalone H3 schema, graph-aware native reference labels,
diagnostics, and plain `STRING` interface are implemented in this project.

The scoped widget-width compatibility repair is adapted with permission from
[ComfyUI-LegacyWidgetWidthFix](https://github.com/pekkAi-dev/ComfyUI-LegacyWidgetWidthFix)
by **pekkAi-dev**.

## License

[GNU GPL v3](LICENSE)
