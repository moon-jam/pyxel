const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../code-maker/pane-shortcuts.js"),
  "utf8",
);

function fixture() {
  let enabled = true;
  let expire;
  const focused = [];
  const targets = Array.from({ length: 3 }, () => ({
    handlers: {},
    addEventListener(name, fn) {
      this.handlers[name] = fn;
    },
  }));
  const context = {
    setTimeout: (fn) => {
      expire = fn;
      return 1;
    },
    clearTimeout() {},
  };
  vm.runInNewContext(source, context);
  context.setupVimPaneShortcuts({
    targets,
    isEnabled: () => enabled,
    focusPane: (side) => focused.push(side),
  });
  return {
    focused,
    disable: () => (enabled = false),
    expire: () => expire(),
    send(key, ctrlKey = false, target = 0) {
      const event = {
        key,
        ctrlKey,
        preventDefault() {
          this.prevented = true;
        },
        stopImmediatePropagation() {
          this.stopped = true;
        },
      };
      targets[target].handlers.keydown(event);
      return event;
    },
    blur: () => targets[0].handlers.blur(),
  };
}

test("Ctrl+W is consumed before browser close and switches focus from either iframe", () => {
  const state = fixture();
  assert.equal(state.send("w", true).prevented, true);
  assert.equal(state.send("r").stopped, true);
  state.send("w", true, 1);
  state.send("L", true, 1);
  state.send("w", true, 2);
  state.send("r", false, 2);
  assert.deepEqual(state.focused, ["right", "left", "right"]);
});

test("disabled Vim, expiry, blur, Escape and unrelated keys never switch focus", () => {
  const state = fixture();
  state.send("w", true);
  state.expire();
  state.send("r");
  state.send("w", true);
  state.blur();
  state.send("l");
  state.send("w", true);
  state.send("Escape");
  state.send("r");
  state.send("w", true);
  assert.equal(state.send("s", true).prevented, undefined);
  state.send("l");
  state.disable();
  assert.equal(state.send("w", true).prevented, undefined);
  state.send("r");
  assert.deepEqual(state.focused, []);
});
