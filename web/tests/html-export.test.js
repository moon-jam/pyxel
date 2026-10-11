const assert = require("node:assert/strict");
const { createHash, webcrypto } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const JSZip = require("jszip");

const source = fs.readFileSync(
  path.join(__dirname, "../code-maker/html-export.js"),
  "utf8",
);
const context = { window: {}, JSZip, crypto: webcrypto, TextEncoder, btoa };
vm.runInNewContext(source, context);
const { build } = context.window.PyxelHtmlExport;
const encode = (value) => Buffer.from(value).toString("base64");
const project = (overrides = {}) => ({
  name: "我的遊戲",
  code: "print('current edit')",
  resource: encode("current resource"),
  files: {
    "main.py": encode("old code"),
    "my_resource.pyxres": encode("old resource"),
    "modules/helper.py": encode("VALUE = 42"),
    "assets/雪.gif": encode([0, 128, 255]),
    "assets/data.zip": encode("asset archive"),
    ".pyxapp_startup_script": encode("attacker.py"),
    ".env": encode("SECRET=do-not-export"),
    "__pycache__/helper.pyc": encode("cache"),
  },
  ...overrides,
});

function bootstrap(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
}

async function launchOptions(html, overrides = {}) {
  let options;
  const status = { remove() {}, textContent: "" };
  vm.runInNewContext(bootstrap(html), {
    document: { getElementById: () => status, body: { appendChild() {} } },
    launchPyxel: async (params) => {
      options = params;
    },
    ...overrides,
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { options, status };
}

test("HTML plays a real Pyxel archive with current edits and nested assets", async () => {
  const { html, filename } = await build(project());
  assert.equal(filename, "我的遊戲.html");
  const { options } = await launchOptions(html);
  assert.equal(options.command, "play");
  assert.equal(options.name, "game.pyxapp");
  assert.equal(options.gamepad, "enabled");
  const archive = await JSZip.loadAsync(options.base64, { base64: true });
  assert.equal(
    await archive.file("game/.pyxapp_startup_script").async("string"),
    "main.py",
  );
  assert.equal(
    await archive.file("game/main.py").async("string"),
    "print('current edit')",
  );
  assert.equal(
    await archive.file("game/my_resource.pyxres").async("string"),
    "current resource",
  );
  assert.equal(
    await archive.file("game/modules/helper.py").async("string"),
    "VALUE = 42",
  );
  assert.deepEqual(
    await archive.file("game/assets/雪.gif").async("nodebuffer"),
    Buffer.from([0, 128, 255]),
  );
  assert.ok(archive.file("game/assets/data.zip"));
  assert.equal(archive.file("game/.env"), null);
  assert.equal(archive.file("game/__pycache__/helper.pyc"), null);
});

test("untrusted titles and Python text cannot add executable HTML", async () => {
  const { html, filename } = await build(
    project({
      name: '</title><script>alert("title")</script>',
      code: 'print("</script><script>alert(1)</script>")',
    }),
  );
  assert.equal([...html.matchAll(/<script\b/g)].length, 2);
  assert.doesNotMatch(html, /<script>alert|print\(/);
  assert.match(html, /&lt;\/title&gt;&lt;script&gt;/);
  assert.doesNotMatch(filename, /[<>:"/\\|?*]/);
  const { options } = await launchOptions(html);
  const archive = await JSZip.loadAsync(options.base64, { base64: true });
  assert.equal(
    await archive.file("game/main.py").async("string"),
    'print("</script><script>alert(1)</script>")',
  );
});

test("export rejects paths that could escape or ambiguously name archive files", async () => {
  for (const name of [
    "../evil.py",
    "/evil.py",
    "a/../../evil.py",
    "a//evil.py",
    "a/./evil.py",
    "C:/evil.py",
    "a\\evil.py",
    "evil\0.py",
  ]) {
    await assert.rejects(
      build(project({ files: { [name]: encode("bad") } })),
      /Unsafe project file path/,
    );
  }
  await assert.rejects(build(project({ resource: "" })), /still loading/);
});

test("export pins the audited loader and hashes the exact inline startup script", async () => {
  const { html } = await build(project());
  assert.match(
    html,
    /moon-jam\/pyxel@16b09cc63731a9456704cff23ef0882cdd4edb2c\/wasm\/pyxel\.js/,
  );
  assert.match(
    html,
    /integrity="sha384-3eL2Nqh0K\/HU3FbBaX0kzwoLEzHQN8C7Jc9UT4Pp\+quvqeEp8ezO47WG8PDEdr36"/,
  );
  assert.doesNotMatch(html, /@main|kitao\/pyxel|localhost/);
  const hash = createHash("sha256").update(bootstrap(html)).digest("base64");
  assert.ok(html.includes(`sha256-${hash}`));
  assert.match(html, /connect-src https:\/\/cdn\.jsdelivr\.net;/);
});

test("startup reports an internet/runtime error instead of silently failing", async () => {
  const { html } = await build(project());
  const { status } = await launchOptions(html, { launchPyxel: undefined });
  assert.match(status.textContent, /Connect to the internet/);
});

test("Maker and manual authorize their exact updated inline scripts", () => {
  for (const name of ["index.html", "manual.html"]) {
    const html = fs.readFileSync(
      path.join(__dirname, "../code-maker", name),
      "utf8",
    );
    for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      const hash = createHash("sha256").update(script).digest("base64");
      assert.ok(
        html.includes(`sha256-${hash}`),
        `${name} has a stale script policy`,
      );
    }
  }
});
