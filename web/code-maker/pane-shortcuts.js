function setupVimPaneShortcuts({ targets, isEnabled, focusPane }) {
  let pending = false;
  let timer;
  function clear() {
    pending = false;
    clearTimeout(timer);
  }
  function handle(event) {
    if (!isEnabled()) {
      clear();
      return;
    }
    const key = event.key.toLowerCase();
    if (pending && !["control", "shift", "alt", "meta"].includes(key)) {
      clear();
      if (key === "l" || key === "r" || key === "escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (key !== "escape") focusPane(key === "l" ? "left" : "right");
        return;
      }
    }
    if (event.ctrlKey && !event.metaKey && !event.altKey && key === "w") {
      event.preventDefault();
      event.stopImmediatePropagation();
      clear();
      pending = true;
      timer = setTimeout(clear, 1500);
    }
  }
  for (const target of targets) {
    target.addEventListener("keydown", handle, { capture: true });
    target.document?.addEventListener("keydown", handle, { capture: true });
    target.addEventListener("pointerdown", clear, { capture: true });
    target.addEventListener("blur", clear);
  }
}
