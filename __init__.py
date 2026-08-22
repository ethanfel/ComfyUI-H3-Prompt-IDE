"""Standalone rich prompt editor for ComfyUI and MiniMax H3."""

# ComfyUI imports custom-node folders as packages. Pytest may instead collect
# this file as top-level ``__init__`` when the checkout directory contains
# hyphens, in which case there is no package anchor for a relative import.
if __package__:
    from .nodes import H3PromptIDEExtension, comfy_entrypoint
else:  # pragma: no cover - exercised by repository-level test collection
    from nodes import H3PromptIDEExtension, comfy_entrypoint

WEB_DIRECTORY = "./web"

__all__ = ["H3PromptIDEExtension", "WEB_DIRECTORY", "comfy_entrypoint"]
