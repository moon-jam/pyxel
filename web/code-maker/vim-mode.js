// Keep editor preferences on this browser, outside the shared project archive.
function setupVimMode(editor) {
  const toggle = document.getElementById("vim-mode-toggle");
  const module = ace.require("ace/keyboard/vim");
  const handler = module?.handler;
  const settingsButton = document.getElementById("vim-settings-button");
  const settings = document.getElementById("vim-settings");
  const arrow = document.getElementById("vim-settings-arrow");
  const motionToggle = document.getElementById("easy-motion-toggle");
  const storageKey = "pyxel-code-maker-vim";
  if (!handler) {
    toggle.disabled = true;
    toggle.title = "Vim mode could not load. Reload to try again.";
    return;
  }

  const motion = setupEasyMotion(editor, module.Vim);
  function closeSettings() {
    settings.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
  }
  settingsButton.addEventListener("click", () => {
    settings.hidden = !settings.hidden;
    settingsButton.setAttribute("aria-expanded", String(!settings.hidden));
  });
  document.addEventListener("pointerdown", (event) => {
    if (!settingsButton.parentElement.contains(event.target)) closeSettings();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !settings.hidden) {
      closeSettings();
      settingsButton.focus();
      event.preventDefault();
      event.stopPropagation();
    }
  });
  window.addEventListener("blur", closeSettings);

  const liveAutocompletion = editor.getOption("enableLiveAutocompletion");
  function apply() {
    motion.cancel();
    editor.setKeyboardHandler(toggle.checked ? handler : null);
    // Completion popups would consume keys used by Vim's normal mode.
    editor.setOption(
      "enableLiveAutocompletion",
      toggle.checked ? false : liveAutocompletion,
    );
    settingsButton.disabled = !toggle.checked;
    arrow.hidden = !toggle.checked;
    motion.setEnabled(toggle.checked && motionToggle.checked);
    if (!toggle.checked) closeSettings();
  }
  try {
    toggle.checked = localStorage.getItem(storageKey) === "1";
    motionToggle.checked =
      localStorage.getItem("pyxel-code-maker-easy-motion") === "1";
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
  motionToggle.addEventListener("change", () => {
    motion.setEnabled(toggle.checked && motionToggle.checked);
    try {
      localStorage.setItem(
        "pyxel-code-maker-easy-motion",
        motionToggle.checked ? "1" : "0",
      );
    } catch {}
  });
}
