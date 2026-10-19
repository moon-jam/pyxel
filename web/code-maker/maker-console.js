class MakerConsoleBuffer {
  constructor({
    maxLines = 1000,
    maxChars = 131072,
    maxLineLength = 8192,
  } = {}) {
    this.maxLines = maxLines;
    this.maxChars = maxChars;
    this.maxLineLength = maxLineLength;
    this.clear();
  }
  clear() {
    this.lines = [];
    this.current = null;
    this.characters = 0;
    this.discarded = false;
  }
  write(stream, text) {
    if (typeof text !== "string" || !text) return;
    // Bound each incoming chunk as well as retained output.
    if (text.length > this.maxChars) {
      text = text.slice(-this.maxChars);
      this.discarded = true;
    }
    let parts = text.replace(/\r\n?/g, "\n").split("\n");
    if (parts.length > this.maxLines) {
      parts = parts.slice(-this.maxLines);
      this.current = null;
      this.discarded = true;
    }
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] || i < parts.length - 1) {
        if (!this.current || this.current.stream !== stream) {
          this.current = { stream, text: "" };
          this.lines.push(this.current);
        }
        const room = this.maxLineLength - this.current.text.length;
        const part = parts[i].slice(0, room);
        if (part.length < parts[i].length) this.discarded = true;
        this.current.text += part;
        this.characters += part.length;
      }
      if (i < parts.length - 1) this.current = null;
    }
    while (
      this.lines.length > this.maxLines ||
      this.characters > this.maxChars
    ) {
      const removed = this.lines.shift();
      this.characters -= removed.text.length;
      if (removed === this.current) this.current = null;
      this.discarded = true;
    }
  }
}

function setupMakerConsole() {
  const panel = document.getElementById("maker-console");
  const output = document.getElementById("console-output");
  const toggle = document.getElementById("console-toggle");
  const counter = document.getElementById("console-count");
  const resize = document.getElementById("console-resize");
  const buffer = new MakerConsoleBuffer();
  let timer = null;
  let height = 180;
  let opened = true;
  try {
    opened = localStorage.getItem("pyxel-console-open") !== "0";
    height = Number(localStorage.getItem("pyxel-console-height")) || height;
  } catch {}
  function save(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {}
  }
  function setHeight(value) {
    height = Math.max(
      80,
      Math.min(value, Math.max(80, panel.parentElement.clientHeight - 100)),
    );
    panel.style.setProperty("--console-height", `${height}px`);
    resize.setAttribute("aria-valuenow", String(Math.round(height)));
  }
  function render() {
    timer = null;
    counter.textContent = `${buffer.lines.length} lines${buffer.discarded ? " · older output truncated" : ""}`;
    if (!opened) return;
    const follow =
      output.scrollTop + output.clientHeight >= output.scrollHeight - 16;
    const fragment = document.createDocumentFragment();
    for (const line of buffer.lines) {
      const row = document.createElement("div");
      row.className = `console-line console-${line.stream}`;
      row.textContent = line.text || "\u00a0";
      fragment.appendChild(row);
    }
    if (!buffer.lines.length) {
      const empty = document.createElement("div");
      empty.className = "console-empty";
      empty.textContent = "Output from print() and Python errors appears here.";
      fragment.appendChild(empty);
    }
    output.replaceChildren(fragment);
    if (follow) output.scrollTop = output.scrollHeight;
  }
  function setOpen(value) {
    opened = value;
    panel.classList.toggle("console-collapsed", !opened);
    output.hidden = !opened;
    resize.hidden = !opened;
    toggle.setAttribute("aria-expanded", String(opened));
    toggle.textContent = `${opened ? "▾" : "▸"} Console`;
    setHeight(height);
    if (timer !== null) clearTimeout(timer);
    render();
  }
  const api = {
    write(stream, text) {
      if (!["stdout", "stderr"].includes(stream)) return;
      buffer.write(stream, text);
      if (stream === "stderr" && !opened) setOpen(true);
      if (timer === null) timer = setTimeout(render, 100);
    },
    clear() {
      buffer.clear();
      if (timer !== null) clearTimeout(timer);
      render();
    },
  };
  toggle.addEventListener("click", () => {
    setOpen(!opened);
    save("pyxel-console-open", opened ? 1 : 0);
  });
  document.getElementById("console-clear").addEventListener("click", api.clear);
  let drag = null;
  function finishDrag() {
    if (!drag) return;
    drag = null;
    document.body.classList.remove("console-resizing");
    save("pyxel-console-height", height);
  }
  resize.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { y: event.clientY, height };
    resize.setPointerCapture(event.pointerId);
    document.body.classList.add("console-resizing");
    event.preventDefault();
  });
  resize.addEventListener("pointermove", (event) => {
    if (drag) setHeight(drag.height + drag.y - event.clientY);
  });
  resize.addEventListener("pointerup", finishDrag);
  resize.addEventListener("pointercancel", finishDrag);
  resize.addEventListener("lostpointercapture", finishDrag);
  resize.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    setHeight(height + (event.key === "ArrowUp" ? 20 : -20));
    save("pyxel-console-height", height);
  });
  window.addEventListener("resize", () => setHeight(height));
  new ResizeObserver(() => setHeight(height)).observe(panel.parentElement);
  setOpen(opened);
  return api;
}
