"""Backend nodes for the standalone H3 Prompt IDE.

The prompt editor deliberately returns an ordinary STRING. Reference media
travels through a small authoring-only bundle on a separate node so the editor
does not grow H3 media sockets of its own.
"""

from typing_extensions import override

from comfy_api.latest import ComfyExtension, io


H3_PROMPT_REFERENCES = io.Custom("H3_PROMPT_REFERENCES")
PICTURE_NAMES = [f"<Picture {index}>" for index in range(1, 10)]
VIDEO_NAMES = [f"<Video {index}>" for index in range(1, 4)]
# MiniMax H3 can emit three video soundtracks followed by three standalone
# audio references. Audio ordinals are shared across those two sources.
AUDIO_NAMES = [f"<Audio {index}>" for index in range(1, 7)]


def _reference_records(source, names, kind, value_key):
    """Return connected media in H3 label order."""

    values = source or {}
    records = []
    for token in names:
        value = values.get(token)
        if value is not None:
            records.append({"token": token, "kind": kind, value_key: value})
    return records


class H3PromptReferenceInputs(io.ComfyNode):
    """Collect prompt-authoring media using MiniMax H3's native labels."""

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
            min=0,
        )
        videos = io.Autogrow.TemplateNames(
            input=io.Image.Input(
                "video",
                tooltip=(
                    "Reference video frames for the matching MiniMax H3 token. "
                    "Use the same IMAGE frame batch sent to the native H3 "
                    "ref_videos input."
                ),
            ),
            names=VIDEO_NAMES,
            min=0,
        )
        audios = io.Autogrow.TemplateNames(
            input=io.Audio.Input(
                "audio",
                tooltip=(
                    "Reference audio for the matching MiniMax H3 token. Audio "
                    "labels follow native presentation order: connected video "
                    "soundtracks first, then standalone audio."
                ),
            ),
            names=AUDIO_NAMES,
            min=0,
        )
        return io.Schema(
            node_id="H3PromptReferenceInputs",
            display_name="H3 Reference Inputs",
            category="text/H3 Prompt IDE",
            search_aliases=[
                "h3 ref input",
                "h3 reference media",
                "h3 reference images videos audio",
                "minimax picture video audio references",
            ],
            description=(
                "Authoring references for H3 Prompt IDE. Picture, video-frame, "
                "and audio sockets auto-grow with native MiniMax H3 labels. "
                "Connect the references output to the editor."
            ),
            inputs=[
                io.Autogrow.Input(
                    "pictures",
                    optional=True,
                    template=pictures,
                    tooltip=(
                        "Up to nine prompt reference pictures, numbered in "
                        "their H3 presentation order."
                    ),
                ),
                io.Autogrow.Input(
                    "videos",
                    optional=True,
                    template=videos,
                    tooltip=(
                        "Up to three reference video frame batches, numbered "
                        "<Video 1> through <Video 3>."
                    ),
                ),
                io.Autogrow.Input(
                    "audios",
                    optional=True,
                    template=audios,
                    tooltip=(
                        "Up to six emitted H3 audio labels: video soundtracks "
                        "first, then standalone audio."
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
    def execute(
        cls,
        pictures: io.Autogrow.Type = None,
        videos: io.Autogrow.Type = None,
        audios: io.Autogrow.Type = None,
    ) -> io.NodeOutput:
        # Preserve H3 presentation order even if a workflow serializer returns
        # the dynamic-input dictionaries in a different insertion order.
        picture_records = _reference_records(pictures, PICTURE_NAMES, "picture", "image")
        video_records = _reference_records(videos, VIDEO_NAMES, "video", "frames")
        audio_records = _reference_records(audios, AUDIO_NAMES, "audio", "audio")
        return io.NodeOutput(
            {
                "pictures": picture_records,
                "videos": video_records,
                "audios": audio_records,
                "references": picture_records + video_records + audio_records,
            }
        )


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
                "STRING output. Reference media stays on the separate H3 "
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
                        "evaluating reference media when only text is queued."
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
