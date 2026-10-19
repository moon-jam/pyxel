const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../code-maker/maker-console.js"),
  "utf8",
);
const runtime = fs.readFileSync(
  path.join(__dirname, "../../wasm/pyxel.js"),
  "utf8",
);

function newBuffer(options) {
  const context = {};
  vm.runInNewContext(
    `${source}\n;globalThis.BufferClass = MakerConsoleBuffer;`,
    context,
  );
  return new context.BufferClass(options);
}

test("console preserves partial print output, blank lines and Unicode", () => {
  const buffer = newBuffer();
  buffer.write("stdout", "玩家");
  buffer.write("stdout", "位置：");
  buffer.write("stdout", "42\n\n完成\n");
  assert.deepEqual(
    Array.from(buffer.lines, (row) => row.text),
    ["玩家位置：42", "", "完成"],
  );
  buffer.write("stderr", "warning\n");
  assert.equal(buffer.lines.at(-1).stream, "stderr");
  buffer.clear();
  assert.equal(buffer.lines.length, 0);
  assert.equal(buffer.discarded, false);
});

test("console bounds huge chunks, long lines and continuous frame-by-frame prints", () => {
  const buffer = newBuffer({ maxLines: 10, maxChars: 100, maxLineLength: 20 });
  for (let i = 0; i < 10000; i++) buffer.write("stdout", `${i}\n`);
  assert.equal(buffer.lines.length, 10);
  assert.equal(buffer.lines.at(-1).text, "9999");
  buffer.write("stdout", "x".repeat(10000));
  assert.ok(buffer.lines.at(-1).text.length <= 20);
  buffer.write("stdout", "\n".repeat(10000));
  assert.ok(buffer.lines.length <= 10);
  assert.ok(buffer.characters <= 100);
  assert.equal(buffer.discarded, true);
});

function runtimeHooks(sink) {
  let stdout;
  let stderr;
  let cancelled = 0;
  let overlay;
  const context = {
    window: { pyxelMakerOutput: sink },
    TextDecoder,
    setTimeout: (fn) => {
      overlay = fn;
      return 1;
    },
    _displayErrorOverlay: () => {},
  };
  // Exercise the real runtime stream hooks without loading WebAssembly.
  const begin = runtime.indexOf("const _emitMakerOutput");
  const end = runtime.indexOf("// Render Python exceptions", begin);
  vm.runInNewContext(
    `${runtime.slice(begin, end)}\n;globalThis.hook = _hookPythonError;`,
    context,
  );
  context.hook({
    setStdout: (value) => (stdout = value),
    setStderr: (value) => (stderr = value),
    _module: {
      _emscripten_cancel_main_loop() {
        cancelled++;
      },
    },
  });
  return { stdout, stderr, cancelled: () => cancelled, overlay: () => overlay };
}

test("runtime decodes UTF-8 across byte boundaries and forwards ordinary stderr", () => {
  const chunks = [];
  const hooks = runtimeHooks((stream, text) => chunks.push({ stream, text }));
  const bytes = new TextEncoder().encode("雪\n");
  assert.equal(hooks.stdout.write(bytes.subarray(0, 1)), 1);
  assert.equal(hooks.stdout.write(bytes.subarray(1)), bytes.length - 1);
  assert.equal(
    chunks
      .filter((row) => row.stream === "stdout")
      .map((row) => row.text)
      .join(""),
    "雪\n",
  );
  hooks.stderr.batched("warning");
  assert.equal(chunks.at(-1).text, "warning\n");
  assert.equal(hooks.cancelled(), 0);
  hooks.stderr.batched("Traceback (most recent call last):");
  hooks.stderr.batched("ValueError: test");
  assert.equal(hooks.cancelled(), 2);
  assert.equal(typeof hooks.overlay(), "function");
});

test("standalone runtime keeps stdout defaults and a broken console never breaks Python", () => {
  assert.equal(runtimeHooks(undefined).stdout, undefined);
  const hooks = runtimeHooks(() => {
    throw new Error("UI unavailable");
  });
  assert.doesNotThrow(() =>
    hooks.stdout.write(new TextEncoder().encode("test\n")),
  );
  assert.doesNotThrow(() => hooks.stderr.batched("warning"));
});

test("versioned loader URLs keep runtime assets relative to wasm directory", () => {
  const start = runtime.indexOf("const _scriptDir =");
  const end = runtime.indexOf("})();", start) + 5;
  for (const suffix of ["", "?v=console-1", "#loader"]) {
    const context = {
      document: {
        getElementsByTagName: () => [
          { src: `https://example.com/pyxel/wasm/pyxel.js${suffix}` },
        ],
      },
    };
    vm.runInNewContext(
      `${runtime.slice(start, end)}\n;globalThis.dir = _scriptDir;`,
      context,
    );
    assert.equal(context.dir, "https://example.com/pyxel/wasm/");
  }
});
