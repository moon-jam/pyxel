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
  let pendingKeys = [];
  let awaitingCharacter = false;
  function cancel() {
    generation++;
    startPending = false;
    pendingKeys = [];
    awaitingCharacter = false;
    overlay?.remove();
    overlay = null;
    targets = [];
    prefix = "";
  }

  function createOverlay(message) {
    overlay = document.createElement("div");
    overlay.className = "easy-motion-overlay";
    const status = document.createElement("div");
    status.className = "easy-motion-status";
    status.setAttribute("role", "status");
    status.textContent = message;
    overlay.appendChild(status);
    editor.renderer.scroller.appendChild(overlay);
  }

  // undefined: word starts; null: wait for a character; string: literal search.
  function start(character) {
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
    if (character === null) {
      awaitingCharacter = true;
      createOverlay("EasyMotion search: type a character · Esc to cancel");
      return;
    }
    const scroller = editor.renderer.scroller;
    const bounds = scroller.getBoundingClientRect();
    for (
      let row = editor.getFirstVisibleRow();
      row <= editor.getLastVisibleRow();
      row++
    ) {
      const line = editor.session.getLine(row);
      const columns =
        character === undefined
          ? [...line.matchAll(/[\p{L}\p{N}_]+/gu)].map((match) => match.index)
          : [...line.matchAll(/./gu)]
              .filter((match) => match[0] === character)
              .map((match) => match.index);
      for (const column of columns) {
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
    if (!targets.length) {
      if (character !== undefined) {
        awaitingCharacter = true;
        createOverlay(
          `EasyMotion: no matches for ${JSON.stringify(character)} · Try another character or Esc`,
        );
      }
      return;
    }
    createOverlay("EasyMotion: type a label · Esc to cancel");
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
  }

  // Ace finishes the Vim command by updating cursor/scroll state; draw afterward.
  Vim.defineAction("pyxelEasyMotion", (cm, args = {}) => {
    const ticket = ++generation;
    startPending = true;
    requestAnimationFrame(() => {
      if (ticket !== generation) return;
      const buffered = pendingKeys;
      startPending = false;
      start(args.search ? null : undefined);
      for (const key of buffered) {
        if (!overlay) break;
        handleMotionKey(key);
      }
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
      Vim.mapCommand(
        "<Space><Space>s",
        "action",
        "pyxelEasyMotion",
        { search: true },
        { context: "normal" },
      );
    } else {
      Vim.unmap("<Space><Space>w", "normal");
      Vim.unmap("<Space><Space>s", "normal");
      Vim.unmap("<Space>", "visual");
      Vim.unmap("<Space>", "operatorPending");
      Vim.map("<Space>", "l");
    }
  }

  function handleMotionKey(key) {
    if (key === "Escape") {
      cancel();
      return;
    }
    if (key === "Shift") return;
    if (awaitingCharacter) {
      if ([...key].length === 1) start(key);
      return;
    }
    if (key === "Backspace") prefix = prefix.slice(0, -1);
    else if (/^[a-z]$/i.test(key)) prefix += key.toLowerCase();
    else {
      cancel();
      return;
    }
    const matches = targets.filter((target) => target.label.startsWith(prefix));
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
  }
  editor.container.addEventListener(
    "keydown",
    (event) => {
      if (!startPending && !overlay) return;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        cancel();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") cancel();
      else if (startPending) pendingKeys.push(event.key);
      else handleMotionKey(event.key);
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
