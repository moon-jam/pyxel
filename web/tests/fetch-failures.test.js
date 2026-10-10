const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const codeMakerSource = fs.readFileSync(
  path.join(__dirname, "..", "code-maker", "index.html"),
  "utf8",
);
const pyxelSource = fs.readFileSync(
  path.join(__dirname, "..", "..", "wasm", "pyxel.js"),
  "utf8",
);

const extractBlock = (source, marker) => {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing source marker: ${marker}`);
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `Missing function body: ${marker}`);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function body: ${marker}`);
};

const loadNamedFunction = (source, name, context) => {
  const declaration = extractBlock(source, `async function ${name}`);
  vm.runInNewContext(`${declaration}; globalThis.__test = ${name};`, context);
  return context.__test;
};

const loadArrowFunction = (source, name, context) => {
  const declaration = extractBlock(source, `const ${name} =`);
  vm.runInNewContext(`${declaration}; globalThis.__test = ${name};`, context);
  return context.__test;
};

test("loadFromGist rejects a missing truncated file before reading its body", async () => {
  let textCount = 0;
  let loadCount = 0;
  const responses = [
    {
      ok: true,
      json: async () => ({
        files: {
          "project.zip": {
            content: "",
            filename: "project.zip",
            raw_url: "https://example.com/project.zip",
            truncated: true,
          },
        },
      }),
    },
    {
      ok: false,
      status: 404,
      text: async () => {
        textCount += 1;
      },
    },
  ];
  const context = {
    base64ToUint8: () => new Uint8Array(),
    fetch: async () => responses.shift(),
    loadProjectFromZip: async () => {
      loadCount += 1;
    },
    updateShareUrl: () => {},
  };
  const loadFromGist = loadNamedFunction(
    codeMakerSource,
    "loadFromGist",
    context,
  );

  await assert.rejects(
    loadFromGist("https://gist.github.com/example/0123456789abcdef0123"),
    /Gist file not found/,
  );
  assert.equal(textCount, 0);
  assert.equal(loadCount, 0);
});

test("loadFromUrl imports an HTTPS ZIP without credentials and preserves its query", async () => {
  const buffer = new ArrayBuffer(4);
  let imported;
  let shared;
  const context = {
    URL,
    fetch: async (url, options) => {
      assert.equal(url, "https://example.com/Lab%201.zip?version=2");
      assert.equal(options.credentials, "omit");
      assert.equal(options.referrerPolicy, "no-referrer");
      return { ok: true, arrayBuffer: async () => buffer };
    },
    loadProjectFromZip: async (...args) => { imported = args; },
    updateShareUrl: (...args) => { shared = args; },
  };
  const loadFromUrl = loadNamedFunction(codeMakerSource, "loadFromUrl", context);
  await loadFromUrl(" https://example.com/Lab%201.zip?version=2 ");
  assert.deepEqual(imported, [buffer, "Lab 1"]);
  assert.deepEqual(shared, ["url", "https://example.com/Lab%201.zip?version=2"]);
});

test("loadFromUrl rejects unsafe URLs before fetching", async () => {
  const context = { URL, fetch: () => assert.fail("Must not fetch invalid URLs") };
  const loadFromUrl = loadNamedFunction(codeMakerSource, "loadFromUrl", context);
  for (const url of ["invalid", "http://example.com/lab.zip", "javascript:alert(1)", "https://user:password@example.com/lab.zip"]) {
    await assert.rejects(loadFromUrl(url), /Invalid URL|Use an HTTPS URL/);
  }
});

test("loadFromUrl rejects a missing ZIP before reading its body", async () => {
  const context = {
    URL,
    fetch: async () => ({ ok: false, arrayBuffer: () => assert.fail("Must not read error responses") }),
    loadProjectFromZip: () => assert.fail("Must not import error responses"),
    updateShareUrl: () => assert.fail("Must not share failed imports"),
  };
  const loadFromUrl = loadNamedFunction(codeMakerSource, "loadFromUrl", context);
  await assert.rejects(loadFromUrl("https://example.com/missing.zip"), /File not found/);
});

test("loadInitialFiles rejects a missing starter project before reading it", async () => {
  let arrayBufferCount = 0;
  let loadCount = 0;
  const context = {
    fetch: async () => ({
      ok: false,
      status: 500,
      arrayBuffer: async () => {
        arrayBufferCount += 1;
      },
    }),
    loadProjectFromZip: async () => {
      loadCount += 1;
    },
    window: { _codeEditor: { focus: () => {} } },
  };
  const loadInitialFiles = loadNamedFunction(
    codeMakerSource,
    "loadInitialFiles",
    context,
  );

  await assert.rejects(loadInitialFiles(), /Starter project not found/);
  assert.equal(arrayBufferCount, 0);
  assert.equal(loadCount, 0);
});

for (const [name, status] of [
  ["pyxel wheel", 503],
  ["import_hook.py", 404],
]) {
  test(`_fetchAsset rejects a non-success ${name} response`, async () => {
    const context = {
      fetch: async () => ({ ok: false, status }),
    };
    const fetchAsset = loadArrowFunction(pyxelSource, "_fetchAsset", context);

    await assert.rejects(
      fetchAsset(`https://example.com/${name}`, name),
      new RegExp(`Failed to fetch ${name.replace(".", "\\.")}: ${status}`),
    );
  });
}
