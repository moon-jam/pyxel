// Keep editor preferences on this browser, outside the shared project archive.
function setupVimMode(editor) {
  const toggle = document.getElementById("vim-mode-toggle");
  const handler = ace.require("ace/keyboard/vim")?.handler;
  const storageKey = "pyxel-code-maker-vim";
  if (!handler) {
    toggle.disabled = true;
    toggle.title = "Vim mode could not load. Reload to try again.";
    return;
  }

  const liveAutocompletion = editor.getOption("enableLiveAutocompletion");
  function apply() {
    editor.setKeyboardHandler(toggle.checked ? handler : null);
    // Completion popups would consume keys used by Vim's normal mode.
    editor.setOption(
      "enableLiveAutocompletion",
      toggle.checked ? false : liveAutocompletion,
    );
  }
  try {
    toggle.checked = localStorage.getItem(storageKey) === "1";
  } catch {
    // The toggle also works when browser storage is unavailable.
  }
  apply();
  toggle.addEventListener("change", () => {
    apply();
    try {
      localStorage.setItem(storageKey, toggle.checked ? "1" : "0");
    } catch {}
    editor.focus();
  });
}
