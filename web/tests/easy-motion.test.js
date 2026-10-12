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

function fixture({ defer = false, line = "first second third" } = {}) {
  const listeners = {};
  let overlay = null;
  let action;
  let moved;
  let frame;
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
      if (key === "<Space><Space>w" || key === "<Space><Space>s")
        mappings.push(`remove:${key}`);
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
    start: (search = false) => action(null, { search }),
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
  assert.equal(
    state.overlay().children.find((child) => child.dataset.column === 6)
      .textContent,
    "s",
  );
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
    "<Space><Space>s",
    "remove:<Space><Space>w",
    "remove:<Space><Space>s",
  ]);
  state.motion.setEnabled(true);
  state.editor.state.cm.state.vim.insertMode = true;
  state.start();
  assert.equal(state.overlay(), null);
});

test("search finds matching characters inside words and jumps to their exact columns", () => {
  const state = fixture();
  state.motion.setEnabled(true);
  state.start(true);
  assert.match(state.overlay().children[0].textContent, /type a character/);
  state.key("r");
  const tags = state
    .overlay()
    .children.filter((child) => child.dataset.column !== undefined);
  assert.deepEqual(
    tags.map((tag) => tag.dataset.column),
    [2, 16],
  );
  state.key("s");
  assert.deepEqual(state.moved(), { row: 0, column: 16 });
  assert.equal(state.editor.session.getLine(0), "first second third");
});

test("search treats punctuation literally and supports Unicode characters", () => {
  for (const [line, char, columns] of [
    ["a.b.c", ".", [1, 3]],
    ["雪x雪", "雪", [0, 2]],
  ]) {
    const state = fixture({ line });
    state.motion.setEnabled(true);
    state.start(true);
    state.key(char);
    assert.deepEqual(
      state
        .overlay()
        .children.filter((child) => child.dataset.column !== undefined)
        .map((tag) => tag.dataset.column),
      columns,
    );
  }
});

test("unmatched search can be retried or cancelled without editing code", () => {
  const state = fixture();
  state.motion.setEnabled(true);
  state.start(true);
  state.key("z");
  assert.match(state.overlay().children[0].textContent, /no matches/);
  state.key("r");
  assert.equal(state.overlay().children.length, 3);
  state.key("Escape");
  assert.equal(state.overlay(), null);
  assert.equal(state.moved(), undefined);
});

test("fast character and label input is buffered until the activation frame", () => {
  const state = fixture({ defer: true });
  state.motion.setEnabled(true);
  state.start(true);
  state.key("r");
  state.key("s");
  state.frame();
  assert.deepEqual(state.moved(), { row: 0, column: 16 });
  assert.equal(state.overlay(), null);
});
