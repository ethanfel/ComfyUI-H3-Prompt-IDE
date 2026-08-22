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
2. Connect images to `<Picture 1>`, `<Picture 2>`, and so on.
3. Connect `references` to the Prompt IDE.
4. Connect the IDE's `text` output to your H3 prompt input.

`H3 Reference Inputs` handles labels and previews only. For Ref2VA generation, connect the same image loaders to the matching inputs on the native H3 conditioner.

## Nodes

- **H3 Prompt IDE** — rich editor with T2VA, I2VA, FL2VA, L2VA, and Ref2VA validation; H3-aware completion; section insertion; diagnostics; and plain-text output.
- **H3 Reference Inputs** — automatically grows from `<Picture 1>` to `<Picture 9>` and keeps image sockets off the editor node.

Reference associations use H3's native `<Picture 1>` naming. This standalone editor intentionally does not include Motion Context `@tag` or `@@@@tag` compilation.

Requires a current ComfyUI version with the V3 node API and `Autogrow` support.

## License

[MIT](LICENSE)
