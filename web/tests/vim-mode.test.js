const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../code-maker/vim-mode.js"),
  "utf8",
);

function setup({
  saved = null,
  motionSaved = null,
  unavailable = false,
  blockedStorage = false,
} = {}) {
  const handlers = {};
  const toggle = {
    checked: false,
    addEventListener: (event, fn) => (handlers[event] = fn),
  };
  const vim = {};
  const motionToggle = {
    checked: false,
    addEventListener: (event, fn) => (handlers[`motion-${event}`] = fn),
  };
  const settingsButton = {
    disabled: true,
    setAttribute() {},
    addEventListener() {},
  };
  const settings = { hidden: true };
  const arrow = { hidden: true };
  const motion = {
    cancel() {},
    setEnabled(value) {
      this.enabled = value;
    },
  };
  const elements = {
    "vim-mode-toggle": toggle,
    "vim-settings-button": settingsButton,
    "vim-settings": settings,
    "vim-settings-arrow": arrow,
    "easy-motion-toggle": motionToggle,
  };
  const editor = {
    text: "print('unchanged')",
    live: true,
    getOption() {
      return this.live;
    },
    setOption(name, value) {
      this.live = value;
    },
    setKeyboardHandler(value) {
      this.handler = value;
    },
    focus() {
      this.focused = true;
    },
  };
  const storage = {
    getItem(key) {
      if (blockedStorage) throw new Error("blocked");
      return key === "pyxel-code-maker-vim" ? saved : motionSaved;
    },
    setItem(key, value) {
      if (blockedStorage) throw new Error("blocked");
      if (key === "pyxel-code-maker-vim") saved = value;
      else motionSaved = value;
    },
  };
  const context = {
    document: { getElementById: (id) => elements[id], addEventListener() {} },
    window: { addEventListener() {} },
    setupEasyMotion: () => motion,
    ace: { require: () => (unavailable ? null : { handler: vim }) },
    localStorage: storage,
  };
  vm.runInNewContext(source, context);
  context.setupVimMode(editor);
  return {
    toggle,
    editor,
    vim,
    motion,
    motionToggle,
    settingsButton,
    settings,
    arrow,
    changeMotion: () => handlers["motion-change"](),
    change: () => handlers.change(),
    saved: () => saved,
  };
}

test("restoring and toggling Vim preserves code and restores ordinary completion", () => {
  const state = setup({ saved: "1" });
  assert.equal(state.toggle.checked, true);
  assert.equal(state.editor.handler, state.vim);
  assert.equal(state.editor.live, false);
  state.toggle.checked = false;
  state.change();
  assert.equal(state.editor.handler, null);
  assert.equal(state.editor.live, true);
  assert.equal(state.saved(), "0");
  assert.equal(state.editor.text, "print('unchanged')");
  assert.equal(state.editor.focused, true);
});

test("EasyMotion preference is gated by Vim and survives turning Vim off", () => {
  const state = setup({ saved: "1", motionSaved: "1" });
  assert.equal(state.motion.enabled, true);
  assert.equal(state.settingsButton.disabled, false);
  assert.equal(state.arrow.hidden, false);
  state.settings.hidden = false;
  state.toggle.checked = false;
  state.change();
  assert.equal(state.motion.enabled, false);
  assert.equal(state.settings.hidden, true);
  assert.equal(state.settingsButton.disabled, true);
  assert.equal(state.motionToggle.checked, true);
  state.toggle.checked = true;
  state.change();
  assert.equal(state.motion.enabled, true);
  state.motionToggle.checked = false;
  state.changeMotion();
  assert.equal(state.motion.enabled, false);
  assert.equal(state.editor.handler, state.vim);
});

test("Vim is off by default and works even when browser storage is blocked", () => {
  const state = setup({ blockedStorage: true });
  assert.equal(state.toggle.checked, false);
  state.toggle.checked = true;
  assert.doesNotThrow(state.change);
  assert.equal(state.editor.handler, state.vim);
});

test("a missing Vim module leaves the ordinary editor available", () => {
  const state = setup({ unavailable: true, saved: "1" });
  assert.equal(state.toggle.disabled, true);
  assert.equal(state.editor.handler, undefined);
  assert.equal(state.editor.live, true);
});
