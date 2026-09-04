export const H3_PROMPT_IDE_SETTING_IDS = Object.freeze({
    defaultPresentation:"H3PromptIDE.Editor.DefaultPresentation",
    automaticSuggestions:"H3PromptIDE.Completion.AutomaticSuggestions",
    appendCompletionSpace:"H3PromptIDE.Completion.AppendSpace",
    markerReplacement:"H3PromptIDE.Interaction.MarkerReplacement",
});

export const H3_PROMPT_IDE_SETTING_DEFINITIONS = Object.freeze([
    Object.freeze({
        id:H3_PROMPT_IDE_SETTING_IDS.defaultPresentation,
        category:["H3 Prompt IDE", "Editor", "Default presentation"],
        name:"Default presentation for new nodes",
        type:"combo",
        defaultValue:"rich",
        options:[
            {text:"Rich text", value:"rich"},
            {text:"Plain text", value:"plain"},
        ],
        tooltip:"Choose how H3 Prompt IDE nodes without a saved per-node Rich/Plain choice are displayed.",
    }),
    Object.freeze({
        id:H3_PROMPT_IDE_SETTING_IDS.automaticSuggestions,
        category:["H3 Prompt IDE", "Completion", "Automatic suggestions"],
        name:"Show suggestions while typing",
        type:"boolean",
        defaultValue:true,
        tooltip:"Show contextual completions automatically. Ctrl/Cmd+Space continues to open completions when this is disabled.",
    }),
    Object.freeze({
        id:H3_PROMPT_IDE_SETTING_IDS.appendCompletionSpace,
        category:["H3 Prompt IDE", "Completion", "Trailing space"],
        name:"Append a space after completed symbols",
        type:"boolean",
        defaultValue:true,
        tooltip:"Insert a trailing space after completing reference labels and other sentence-level H3 symbols.",
    }),
    Object.freeze({
        id:H3_PROMPT_IDE_SETTING_IDS.markerReplacement,
        category:["H3 Prompt IDE", "Interaction", "Marker replacement"],
        name:"Enable marker replacement interactions",
        type:"boolean",
        defaultValue:true,
        tooltip:"Allow click replacement for styled tokens and Ctrl/Cmd-click replacement for unstyled bracket and retention markers.",
    }),
]);

function readValue(readSetting, id, fallback) {
    const value = typeof readSetting === "function" ? readSetting(id, fallback) : undefined;
    return value == null ? fallback : value;
}

export function h3PromptIdePreferences(readSetting) {
    const presentation = String(readValue(
        readSetting, H3_PROMPT_IDE_SETTING_IDS.defaultPresentation, "rich",
    )).toLowerCase();
    return {
        defaultRichText:presentation !== "plain",
        automaticSuggestions:readValue(
            readSetting, H3_PROMPT_IDE_SETTING_IDS.automaticSuggestions, true,
        ) !== false,
        appendCompletionSpace:readValue(
            readSetting, H3_PROMPT_IDE_SETTING_IDS.appendCompletionSpace, true,
        ) !== false,
        markerReplacement:readValue(
            readSetting, H3_PROMPT_IDE_SETTING_IDS.markerReplacement, true,
        ) !== false,
    };
}
