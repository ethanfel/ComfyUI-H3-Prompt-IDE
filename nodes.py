"""Backend nodes for the standalone H3 Prompt IDE.

The prompt editor deliberately returns an ordinary STRING. Reference images
travel through a small authoring-only bundle on a separate node so the editor
does not grow nine IMAGE sockets of its own.
"""

from typing_extensions import override

from comfy_api.latest import ComfyExtension, io


H3_PROMPT_REFERENCES = io.Custom("H3_PROMPT_REFERENCES")
PICTURE_NAMES = [f"<Picture {index}>" for index in range(1, 10)]


class H3PromptReferenceInputs(io.ComfyNode):
    """Collect up to nine pictures using MiniMax H3's native numbering."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        pictures = io.Autogrow.TemplateNames(
            input=io.Image.Input(
                "picture",
                tooltip=(
                    "Reference picture for the matching MiniMax H3 token. "
                    "The next socket appears automatically when connected."
                ),
            ),
            names=PICTURE_NAMES,
            min=1,
        )
        return io.Schema(
            node_id="H3PromptReferenceInputs",
            display_name="H3 Reference Inputs",
            category="text/H3 Prompt IDE",
            search_aliases=[
                "h3 ref input",
                "h3 reference images",
                "minimax picture references",
            ],
            description=(
                "Authoring references for H3 Prompt IDE. Picture sockets "
                "auto-grow and use MiniMax H3 labels <Picture 1> through "
                "<Picture 9>. Connect the references output to the editor."
            ),
            inputs=[
                io.Autogrow.Input(
                    "pictures",
                    template=pictures,
                    tooltip=(
                        "Up to nine prompt reference pictures, numbered in "
                        "their H3 presentation order."
                    ),
                ),
            ],
            outputs=[
                H3_PROMPT_REFERENCES.Output(
                    display_name="references",
                    tooltip="Authoring references for H3 Prompt IDE.",
                ),
            ],
        )

    @classmethod
    def execute(cls, pictures: io.Autogrow.Type) -> io.NodeOutput:
        # Preserve H3 presentation order even if a workflow serializer returns
        # the dynamic-input dictionary in a different insertion order.
        source = pictures or {}
        records = []
        for token in PICTURE_NAMES:
            image = source.get(token)
            if image is not None:
                records.append({"token": token, "kind": "picture", "image": image})
        return io.NodeOutput({"pictures": records})


class H3PromptIDE(io.ComfyNode):
    """Rich authoring UI whose runtime contract is a normal STRING."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="H3PromptIDE",
            display_name="H3 Prompt IDE",
            category="text/H3 Prompt IDE",
            search_aliases=[
                "rich text prompt",
                "prompt editor",
                "minimax h3 prompt editor",
            ],
            description=(
                "Standalone rich prompt editor with strict H3 mode schemas, "
                "contextual completion, reference tokens, and an ordinary "
                "STRING output. Reference images stay on the separate H3 "
                "Reference Inputs node."
            ),
            inputs=[
                io.String.Input(
                    "prompt",
                    default="",
                    multiline=True,
                    dynamic_prompts=True,
                    tooltip="The plain text serialized and returned by this node.",
                ),
                H3_PROMPT_REFERENCES.Input(
                    "references",
                    optional=True,
                    raw_link=True,
                    tooltip=(
                        "Optional authoring-only link from H3 Reference Inputs. "
                        "It supplies the token palette and previews without "
                        "evaluating reference images when only text is queued."
                    ),
                ),
            ],
            outputs=[
                io.String.Output(
                    display_name="text",
                    tooltip="The prompt as an ordinary ComfyUI STRING.",
                ),
            ],
        )

    @classmethod
    def execute(cls, prompt: str, references=None) -> io.NodeOutput:
        del references
        return io.NodeOutput(str(prompt or ""))


class H3PromptIDEExtension(ComfyExtension):
    @override
    async def get_node_list(self):
        return [H3PromptReferenceInputs, H3PromptIDE]


async def comfy_entrypoint() -> H3PromptIDEExtension:
    return H3PromptIDEExtension()
