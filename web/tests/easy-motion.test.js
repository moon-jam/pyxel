const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../code-maker/easy-motion.js"),
  "utf8",
);

test("EasyMotion labels are unique and prefix-free beyond one and two letters", () => {
  const context = {};
  vm.runInNewContext(source, context);
  for (const count of [0, 1, 26, 27, 676, 677, 2000]) {
    const labels = context.easyMotionLabels(count);
    assert.equal(labels.length, count);
    assert.equal(new Set(labels).size, count);
    assert.ok(labels.every((label) => /^[a-z]+$/.test(label)));
    assert.ok(labels.every((label) => label.length === labels[0].length));
  }
});

function fixture({ defer = false } = {}) {
  const listeners = {};
  let overlay = null;
  let action;
  let moved;
  let frame;
  const line = "first second third";
  const element = () => ({
    style: {},
    dataset: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
    remove() {
      overlay = null;
    },
    setAttribute() {},
  });
  const editor = {
    state: { cm: { state: { vim: { insertMode: false, visualMode: false } } } },
    container: { addEventListener: (name, fn) => (listeners[name] = fn) },
    renderer: {
      scroller: {
        getBoundingClientRect: () => ({
          left: 10,
          top: 10,
          width: 300,
          height: 100,
        }),
        appendChild: (el) => (overlay = el),
      },
      textToScreenCoordinates: (row, column) => ({
        pageX: 10 + column * 8,
        pageY: 10 + row * 20,
      }),
      on: (name, fn) => (listeners[name] = fn),
    },
    session: {
      getLine: () => line,
      getFoldAt: () => null,
      on: (name, fn) => (listeners[name] = fn),
    },
    selection: { clearSelection() {} },
    getFirstVisibleRow: () => 0,
    getLastVisibleRow: () => 0,
    moveCursorTo: (row, column) => (moved = { row, column }),
    focus() {},
    on: (name, fn) => (listeners[name] = fn),
  };
  const mappings = [];
  const Vim = {
    map() {},
    defineAction: (name, fn) => (action = fn),
    mapCommand: (...args) => mappings.push(args[0]),
    unmap: (key) => {
      if (key === "<Space><Space>w") mappings.push(`remove:${key}`);
    },
  };
  const context = {
    requestAnimationFrame: (fn) => {
      if (defer) frame = fn;
      else fn();
    },
    document: { createElement: element },
    window: { scrollX: 0, scrollY: 0 },
  };
  vm.runInNewContext(source, context);
  const motion = context.setupEasyMotion(editor, Vim);
  return {
    editor,
    motion,
    mappings,
    start: () => action(),
    overlay: () => overlay,
    moved: () => moved,
    frame: () => frame(),
    key(key) {
      const event = {
        key,
        preventDefault() {
          this.prevented = true;
        },
        stopImmediatePropagation() {},
      };
      listeners.keydown(event);
      return event;
    },
    event: (name) => listeners[name](),
  };
}

test("Esc cancels a queued activation before labels are drawn", () => {
  const state = fixture({ defer: true });
  state.motion.setEnabled(true);
  state.start();
  assert.equal(state.key("Escape").prevented, true);
  state.frame();
  assert.equal(state.overlay(), null);
  assert.equal(state.moved(), undefined);
});

test("a label jumps to the exact word column without changing document text", () => {
  const state = fixture();
  state.motion.setEnabled(true);
  state.start();
  assert.equal(state.overlay().children[1].textContent, "s");
  assert.equal(state.key("s").prevented, true);
  assert.deepEqual(state.moved(), { row: 0, column: 6 });
  assert.equal(state.overlay(), null);
  assert.equal(state.editor.session.getLine(0), "first second third");
});

test("cancel, scroll, blur and disabling remove hints; insert mode never starts them", () => {
  const state = fixture();
  state.motion.setEnabled(true);
  for (const name of ["changeScrollTop", "blur", "change", "resize"]) {
    state.start();
    state.event(name);
    assert.equal(state.overlay(), null);
  }
  state.start();
  state.key("Escape");
  assert.equal(state.overlay(), null);
  assert.equal(state.moved(), undefined);
  state.start();
  state.motion.setEnabled(false);
  assert.equal(state.overlay(), null);
  assert.deepEqual(state.mappings, [
    "<Space><Space>w",
    "remove:<Space><Space>w",
  ]);
  state.motion.setEnabled(true);
  state.editor.state.cm.state.vim.insertMode = true;
  state.start();
  assert.equal(state.overlay(), null);
});
