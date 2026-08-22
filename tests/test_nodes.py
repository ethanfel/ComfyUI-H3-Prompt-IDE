from nodes import H3PromptIDE, H3PromptReferenceInputs, PICTURE_NAMES


def output_values(result):
    return tuple(result)


def test_prompt_ide_returns_plain_string_unchanged():
    prompt = "Use <Picture 1>.\n<d>Hello.</d>"
    assert output_values(H3PromptIDE.execute(prompt))[0] == prompt


def test_reference_bundle_uses_h3_picture_order():
    result = H3PromptReferenceInputs.execute({
        "<Picture 3>": "third",
        "<Picture 1>": "first",
        "<Picture 2>": None,
    })
    records = output_values(result)[0]["pictures"]
    assert [(item["token"], item["image"]) for item in records] == [
        ("<Picture 1>", "first"),
        ("<Picture 3>", "third"),
    ]


def test_h3_exposes_nine_picture_names():
    assert PICTURE_NAMES == [f"<Picture {index}>" for index in range(1, 10)]


def test_schema_uses_h3_names_and_one_raw_authoring_link():
    reference_inputs = H3PromptReferenceInputs.INPUT_TYPES()
    template = reference_inputs["required"]["pictures"][1]["template"]
    assert template["names"] == PICTURE_NAMES
    assert not any("ref_image" in name for name in template["names"])

    editor_inputs = H3PromptIDE.INPUT_TYPES()
    assert set(editor_inputs["required"]) == {"prompt"}
    assert set(editor_inputs["optional"]) == {"references"}
    assert editor_inputs["optional"]["references"][1]["rawLink"] is True
