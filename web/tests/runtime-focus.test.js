const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../code-maker/runtime-focus.js"),
  "utf8",
);

test("Run starts the input gate and focuses the game canvas without scrolling", () => {
  const context = {};
  vm.runInNewContext(source, context);
  const calls = [];
  const canvas = {
    focus: (options) => calls.push(["canvas", options.preventScroll]),
  };
  const runtime = {
    pyxelContext: { resolveInput: () => calls.push("start") },
    focus: () => calls.push("window"),
    document: { getElementById: () => canvas },
  };
  context.focusMakerRuntime({ contentWindow: runtime }, (side) =>
    calls.push(side),
  );
  assert.deepEqual(calls, ["start", "window", ["canvas", true], "right"]);
  delete runtime.pyxelContext.resolveInput;
  assert.doesNotThrow(() =>
    context.focusMakerRuntime({ contentWindow: runtime }, () => {}),
  );
});

test("an unloaded runtime or missing canvas is safe to focus", () => {
  const context = {};
  vm.runInNewContext(source, context);
  assert.doesNotThrow(() => context.focusMakerRuntime({}, () => {}));
  assert.doesNotThrow(() =>
    context.focusMakerRuntime(
      {
        contentWindow: { focus() {}, document: { getElementById: () => null } },
      },
      () => {},
    ),
  );
});
