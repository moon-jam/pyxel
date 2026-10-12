// Labels use a uniform length, so no target label is a prefix of another.
function easyMotionLabels(count) {
  const alphabet = "asdfghjklqwertyuiopzxcvbnm";
  const width = Math.max(
    1,
    Math.ceil(Math.log(Math.max(1, count)) / Math.log(alphabet.length)),
  );
  return Array.from({ length: count }, (_, index) => {
    let label = "";
    for (let i = 0; i < width; i++) {
      label = alphabet[index % alphabet.length] + label;
      index = Math.floor(index / alphabet.length);
    }
    return label;
  });
}

function setupEasyMotion(editor, Vim) {
  let enabled = false;
  let overlay = null;
  let targets = [];
  let prefix = "";
  let generation = 0;
  let startPending = false;
  function cancel() {
    generation++;
    startPending = false;
    overlay?.remove();
    overlay = null;
    targets = [];
    prefix = "";
  }

  function start() {
    cancel();
    const vim = editor.state?.cm?.state?.vim;
    if (
      !enabled ||
      !vim ||
      vim.insertMode ||
      vim.visualMode ||
      editor.inMultiSelectMode
    )
      return;
    const scroller = editor.renderer.scroller;
    const bounds = scroller.getBoundingClientRect();
    for (
      let row = editor.getFirstVisibleRow();
      row <= editor.getLastVisibleRow();
      row++
    ) {
      const line = editor.session.getLine(row);
      for (const match of line.matchAll(/[\p{L}\p{N}_]+/gu)) {
        const column = match.index;
        if (editor.session.getFoldAt(row, column, 1)) continue;
        const point = editor.renderer.textToScreenCoordinates(row, column);
        const left = point.pageX - window.scrollX - bounds.left;
        const top = point.pageY - window.scrollY - bounds.top;
        if (
          left < 0 ||
          left >= bounds.width - 16 ||
          top < 0 ||
          top >= bounds.height - 16
        )
          continue;
        targets.push({ row, column, left, top });
      }
    }
    if (!targets.length) return;
    overlay = document.createElement("div");
    overlay.className = "easy-motion-overlay";
    const labels = easyMotionLabels(targets.length);
    targets.forEach((target, index) => {
      target.label = labels[index];
      const tag = document.createElement("span");
      tag.className = "easy-motion-label";
      tag.textContent = target.label;
      tag.style.left = `${target.left}px`;
      tag.style.top = `${target.top}px`;
      tag.dataset.row = target.row;
      tag.dataset.column = target.column;
      overlay.appendChild(tag);
      target.tag = tag;
    });
    const status = document.createElement("div");
    status.className = "easy-motion-status";
    status.setAttribute("role", "status");
    status.textContent = "EasyMotion: type a label · Esc to cancel";
    overlay.appendChild(status);
    scroller.appendChild(overlay);
  }

  // Ace finishes the Vim command by updating cursor/scroll state; draw afterward.
  Vim.defineAction("pyxelEasyMotion", () => {
    const ticket = ++generation;
    startPending = true;
    requestAnimationFrame(() => {
      if (ticket !== generation) return;
      startPending = false;
      start();
    });
  });
  function setEnabled(value) {
    cancel();
    if (value === enabled) return;
    enabled = value;
    if (enabled) {
      // The default single Space motion would win over a longer leader sequence.
      Vim.unmap("<Space>");
      Vim.map("<Space>", "l", "visual");
      Vim.map("<Space>", "l", "operatorPending");
      Vim.mapCommand(
        "<Space><Space>w",
        "action",
        "pyxelEasyMotion",
        {},
        { context: "normal" },
      );
    } else {
      Vim.unmap("<Space><Space>w", "normal");
      Vim.unmap("<Space>", "visual");
      Vim.unmap("<Space>", "operatorPending");
      Vim.map("<Space>", "l");
    }
  }

  editor.container.addEventListener(
    "keydown",
    (event) => {
      if (startPending && event.key === "Escape") {
        cancel();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!overlay) return;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        cancel();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        cancel();
        return;
      }
      if (event.key === "Backspace") prefix = prefix.slice(0, -1);
      else if (/^[a-z]$/i.test(event.key)) prefix += event.key.toLowerCase();
      else if (event.key === "Shift") return;
      else {
        cancel();
        return;
      }
      const matches = targets.filter((target) =>
        target.label.startsWith(prefix),
      );
      const target = matches.find((target) => target.label === prefix);
      if (target) {
        editor.selection.clearSelection();
        editor.moveCursorTo(target.row, target.column);
        cancel();
        editor.focus();
      } else if (!matches.length) cancel();
      else
        targets.forEach((target) => {
          target.tag.hidden = !target.label.startsWith(prefix);
        });
    },
    true,
  );
  editor.container.addEventListener("pointerdown", cancel);
  editor.on("blur", cancel);
  editor.session.on("change", cancel);
  editor.session.on("changeScrollTop", cancel);
  editor.session.on("changeScrollLeft", cancel);
  editor.renderer.on("resize", cancel);
  return { setEnabled, cancel };
}
