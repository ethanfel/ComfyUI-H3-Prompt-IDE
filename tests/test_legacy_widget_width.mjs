import assert from "node:assert/strict";
import {
    isVueNodeRenderer,
    repairLegacyWidgetWidth,
} from "../web/h3_legacy_widget_width.mjs";

assert.equal(isVueNodeRenderer({vueNodesMode:true}), true);
assert.equal(isVueNodeRenderer({vueNodesMode:false}), false);
assert.equal(isVueNodeRenderer(undefined), false);

const legacyMode = {enabled:false};
const legacyWidget = {width:640};
assert.equal(repairLegacyWidgetWidth(legacyWidget, {
    vueMode:() => legacyMode.enabled,
}), true);
assert.equal(legacyWidget.width, undefined);
legacyWidget.width = 320;
assert.equal(legacyWidget.width, undefined);

legacyMode.enabled = true;
legacyWidget.width = 480;
assert.equal(legacyWidget.width, 480);
legacyMode.enabled = false;
legacyWidget.width = 720;
assert.equal(legacyWidget.width, undefined);
assert.equal(repairLegacyWidgetWidth(legacyWidget, {
    vueMode:() => legacyMode.enabled,
}), true);

const vueWidget = {width:512};
repairLegacyWidgetWidth(vueWidget, {vueMode:() => true});
assert.equal(vueWidget.width, 512);
vueWidget.width = 768;
assert.equal(vueWidget.width, 768);

const fixedWidth = {};
Object.defineProperty(fixedWidth, "width", {value:400, configurable:false});
assert.equal(repairLegacyWidgetWidth(fixedWidth, {vueMode:() => false}), false);
assert.equal(fixedWidth.width, 400);

console.log("H3 scoped legacy widget width tests passed");
