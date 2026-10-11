// Keep shared games on the audited runtime, independently of future site updates.
(() => {
  const runtimeUrl =
    "https://cdn.jsdelivr.net/gh/moon-jam/pyxel@16b09cc63731a9456704cff23ef0882cdd4edb2c/wasm/pyxel.js";
  const runtimeIntegrity =
    "sha384-3eL2Nqh0K/HU3FbBaX0kzwoLEzHQN8C7Jc9UT4Pp+quvqeEp8ezO47WG8PDEdr36";

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  }

  function checkPath(path) {
    if (
      /[\\:\x00-\x1f\x7f]/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error(`Unsafe project file path: ${path}`);
    }
  }

  async function build(project) {
    if (!project.resource) {
      throw new Error(
        "The project is still loading. Please try again shortly.",
      );
    }
    const archive = new JSZip();
    for (const [path, base64] of Object.entries(project.files)) {
      checkPath(path);
      // Match package's hidden-file/cache exclusions, but retain game assets
      // such as GIFs and ZIPs that an imported project may actually use.
      if (
        path
          .split("/")
          .some((part) => part.startsWith(".") || part === "__pycache__")
      ) {
        continue;
      }
      archive.file(`game/${path}`, base64, { base64: true });
    }
    // Current edits always take precedence over the originally imported files.
    archive.file("game/main.py", project.code);
    archive.file("game/my_resource.pyxres", project.resource, { base64: true });
    archive.file("game/.pyxapp_startup_script", "main.py");
    const base64 = await archive.generateAsync({
      type: "base64",
      compression: "DEFLATE",
    });
    const options = JSON.stringify({
      command: "play",
      name: "game.pyxapp",
      gamepad: "enabled",
      base64,
    });
    const bootstrap = `
const status = document.getElementById("load-status");
(async () => {
  try {
    if (typeof launchPyxel !== "function") {
      throw new Error("Cannot load Pyxel. Connect to the internet and reopen this file.");
    }
    status.remove();
    await launchPyxel(${options});
  } catch (error) {
    status.textContent = "Unable to start game: " + error.message;
    document.body.appendChild(status);
  }
})();
`;
    // Only this exact bootstrap can execute inline; project text stays in ZIP.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(bootstrap),
    );
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
    const policy = [
      "default-src 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      "form-action 'none'",
      `script-src 'sha256-${hash}' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net`,
      "style-src 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src https://cdn.jsdelivr.net data: blob:",
      "connect-src https://cdn.jsdelivr.net",
      "worker-src blob:",
      "media-src blob:",
    ].join("; ");
    const title = project.name || "Pyxel game";
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">
<title>${escapeHtml(title)}</title>
<style>html,body{margin:0;background:#000;color:#fff;font-family:system-ui}#load-status{padding:2rem}</style>
</head>
<body>
<p id="load-status">Loading Pyxel… Internet access is required. Click the game screen to play.</p>
<script src="${runtimeUrl}" integrity="${runtimeIntegrity}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script>${bootstrap}</script>
</body>
</html>
`;
    const filename =
      String(title)
        .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
        .replace(/^[. ]+|[. ]+$/g, "")
        .slice(0, 100) || "pyxel-game";
    return { html, filename: `${filename}.html` };
  }

  window.PyxelHtmlExport = Object.freeze({ build });
})();
