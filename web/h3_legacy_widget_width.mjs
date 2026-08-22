// Scoped compatibility guard for ComfyUI frontend issue #12443.
//
// In LiteGraph mode, a frontend draw path can persist the rendered DOM width
// onto widget.width. LiteGraph then treats that stale number as authoritative
// instead of following node.size[0]. This module protects only widgets created
// by H3 Prompt IDE; it does not patch LGraphNode or unrelated extensions.

const STATE_KEY = "__h3ide_legacy_width_state";
const GUARD_KEY = "__h3ide_legacy_width_guarded";
const GETTER_KEY = "__h3ide_legacy_width_getter";
const SETTER_KEY = "__h3ide_legacy_width_setter";

export function isVueNodeRenderer(liteGraph = globalThis.LiteGraph) {
    return Boolean(liteGraph?.vueNodesMode);
}

function ownsWidthGuard(widget) {
    if (!widget?.[GUARD_KEY]) return false;
    const descriptor = Object.getOwnPropertyDescriptor(widget, "width");
    return descriptor?.get === widget[GETTER_KEY]
        && descriptor?.set === widget[SETTER_KEY];
}

function clearStaleMetadata(widget) {
    for (const key of [STATE_KEY, GUARD_KEY, GETTER_KEY, SETTER_KEY]) {
        try {
            delete widget[key];
        } catch {
            // A foreign wrapper may temporarily make the object non-configurable.
        }
    }
}

export function repairLegacyWidgetWidth(
    widget,
    {vueMode = () => isVueNodeRenderer()} = {},
) {
    if (!widget || typeof widget !== "object") return false;
    if (ownsWidthGuard(widget)) {
        if (!vueMode()) widget[STATE_KEY] = undefined;
        return true;
    }
    if (widget[GUARD_KEY]) clearStaleMetadata(widget);

    // If the standalone compatibility extension already owns this widget,
    // leave its accessor intact. A later refresh will install our scoped guard
    // if that extension is removed.
    if (widget.__lwwf_guarded) {
        if (!vueMode()) widget.__lwwf_width = undefined;
        return true;
    }

    const previous = Object.getOwnPropertyDescriptor(widget, "width");
    if (previous && !previous.configurable) return false;
    const initialWidth = widget.width;
    const getter = function () {
        return this[STATE_KEY];
    };
    const setter = function (value) {
        // Width writes are legitimate in the Vue node renderer. In legacy
        // LiteGraph they are the regression, so retain the node-width fallback.
        this[STATE_KEY] = vueMode() ? value : undefined;
    };

    Object.defineProperties(widget, {
        [STATE_KEY]: {
            value:initialWidth,
            writable:true,
            configurable:true,
        },
        [GETTER_KEY]: {
            value:getter,
            configurable:true,
        },
        [SETTER_KEY]: {
            value:setter,
            configurable:true,
        },
        [GUARD_KEY]: {
            value:true,
            configurable:true,
        },
        width: {
            configurable:true,
            enumerable:previous?.enumerable ?? true,
            get:getter,
            set:setter,
        },
    });
    if (!vueMode()) widget[STATE_KEY] = undefined;
    return true;
}
