from nodes import (
    AUDIO_NAMES,
    PICTURE_NAMES,
    VIDEO_NAMES,
    H3PromptIDE,
    H3PromptReferenceInputs,
)


def output_values(result):
    return tuple(result)


def test_prompt_ide_returns_plain_string_unchanged():
    prompt = "Use <Picture 1>.\n<d>Hello.</d>"
    assert output_values(H3PromptIDE.execute(prompt))[0] == prompt


def test_reference_bundle_uses_h3_media_order():
    result = H3PromptReferenceInputs.execute(
        pictures={
            "<Picture 3>": "third",
            "<Picture 1>": "first",
            "<Picture 2>": None,
        },
        videos={"<Video 2>": "second-video", "<Video 1>": "first-video"},
        audios={"<Audio 2>": "second-audio", "<Audio 1>": "first-audio"},
    )
    bundle = output_values(result)[0]
    assert [(item["token"], item["image"]) for item in bundle["pictures"]] == [
        ("<Picture 1>", "first"),
        ("<Picture 3>", "third"),
    ]
    assert [(item["token"], item["frames"]) for item in bundle["videos"]] == [
        ("<Video 1>", "first-video"),
        ("<Video 2>", "second-video"),
    ]
    assert [(item["token"], item["audio"]) for item in bundle["audios"]] == [
        ("<Audio 1>", "first-audio"),
        ("<Audio 2>", "second-audio"),
    ]


def test_h3_exposes_native_media_names():
    assert PICTURE_NAMES == [f"<Picture {index}>" for index in range(1, 10)]
    assert VIDEO_NAMES == [f"<Video {index}>" for index in range(1, 4)]
    assert AUDIO_NAMES == [f"<Audio {index}>" for index in range(1, 7)]


def test_schema_uses_h3_names_and_one_raw_authoring_link():
    reference_inputs = H3PromptReferenceInputs.INPUT_TYPES()
    assert set(reference_inputs["required"]) == {"pictures", "videos", "audios"}
    expected_names = {
        "pictures": PICTURE_NAMES,
        "videos": VIDEO_NAMES,
        "audios": AUDIO_NAMES,
    }
    for group, names in expected_names.items():
        template = reference_inputs["required"][group][1]["template"]
        assert template["names"] == names
        assert not any(name.startswith("ref_") for name in template["names"])

    editor_inputs = H3PromptIDE.INPUT_TYPES()
    assert set(editor_inputs["required"]) == {"prompt"}
    assert set(editor_inputs["optional"]) == {"references"}
    assert editor_inputs["optional"]["references"][1]["rawLink"] is True
