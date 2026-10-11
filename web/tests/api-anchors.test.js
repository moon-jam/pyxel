const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../api-reference/api-reference.js"),
  "utf8",
);
const reference = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../api-reference/api-reference.json"),
    "utf8",
  ),
);

function load(overrides = {}) {
  const context = { window: { addEventListener() {} }, ...overrides };
  vm.runInNewContext(
    `${source}\n;globalThis.api = { itemAnchorId, revealAnchor, anchorTargets, setSearch: value => searchQuery = value, getState: () => ({ searchQuery, showAdvanced }) };`,
    context,
  );
  return context;
}

test("all real categories, APIs, overloads and constants have unique stable anchors", () => {
  const { itemAnchorId } = load().api;
  const ids = [];
  for (const category of reference.categories) {
    ids.push(`category-${category.id}`);
    for (const item of category.items || [])
      ids.push(itemAnchorId(item, category.items));
    for (const name of category.constants || []) ids.push(`pyxel.${name}`);
    for (const group of category.constant_groups || []) {
      for (const section of group.sections || []) {
        for (const name of section.constants) ids.push(`pyxel.${name}`);
      }
    }
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => !/\s/.test(id)));
  for (const id of [
    "category-graphics",
    "pyxel.blt",
    "pyxel.clip",
    "pyxel.clip-no-args",
    "pyxel.KEY_SPACE",
  ])
    assert.ok(ids.includes(id));
});

test("a deep link clears search and reveals an advanced API inside closed sections", () => {
  const section = { tagName: "DETAILS", open: false };
  const details = { open: false };
  const search = { value: "unrelated" };
  const toggle = { checked: false };
  let scrolled = 0;
  let focused = 0;
  const target = {
    tagName: "DIV",
    parentElement: section,
    querySelector: () => details,
    scrollIntoView() {
      scrolled++;
    },
    focus() {
      focused++;
    },
  };
  const context = load({
    location: { hash: "#pyxel.title" },
    document: {
      getElementById: (id) => (id === "search-input" ? search : toggle),
    },
  });
  // Visibility is independently covered by browser tests; observe its input state.
  vm.runInNewContext("updateVisibility = () => {};", context);
  context.api.setSearch("unrelated");
  context.api.anchorTargets.set("pyxel.title", {
    element: target,
    item: { advanced: true },
  });
  context.api.revealAnchor();
  assert.equal(search.value, "");
  assert.equal(context.api.getState().searchQuery, "");
  assert.equal(context.api.getState().showAdvanced, true);
  assert.equal(toggle.checked, true);
  assert.equal(section.open, true);
  assert.equal(details.open, true);
  assert.equal(scrolled, 1);
  assert.equal(focused, 1);
});

test("constant deep links open all collapsed ancestors", () => {
  const outer = { tagName: "DETAILS", open: false };
  const inner = { tagName: "DETAILS", open: false, parentElement: outer };
  const target = {
    tagName: "A",
    parentElement: inner,
    scrollIntoView() {},
    focus() {},
  };
  const context = load({
    location: { hash: "#pyxel.KEY_SPACE" },
    document: { getElementById: () => ({ value: "" }) },
  });
  vm.runInNewContext("updateVisibility = () => {};", context);
  context.api.anchorTargets.set("pyxel.KEY_SPACE", { element: target });
  context.api.revealAnchor();
  assert.equal(outer.open, true);
  assert.equal(inner.open, true);
});

test("quick jumps also reveal categories containing only advanced APIs", () => {
  const toggle = { checked: false };
  const context = load({
    location: { hash: "#category-font" },
    document: {
      getElementById: (id) =>
        id === "advanced-toggle" ? toggle : { value: "" },
    },
  });
  vm.runInNewContext("updateVisibility = () => {};", context);
  const target = {
    tagName: "DETAILS",
    open: false,
    scrollIntoView() {},
    focus() {},
  };
  context.api.anchorTargets.set("category-font", {
    element: target,
    category: reference.categories.find((category) => category.id === "font"),
  });
  context.api.revealAnchor();
  assert.equal(toggle.checked, true);
  assert.equal(context.api.getState().showAdvanced, true);
  assert.equal(target.open, true);
});

test("unknown or malformed hashes leave the user's filters alone", () => {
  for (const hash of ["#not-an-api", "#%E0%A4%A", ""]) {
    const context = load({ location: { hash } });
    context.api.setSearch("blt");
    assert.doesNotThrow(() => context.api.revealAnchor());
    assert.equal(context.api.getState().searchQuery, "blt");
  }
});
