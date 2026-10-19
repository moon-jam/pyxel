function focusMakerRuntime(frame, updateFocus) {
  const runtime = frame.contentWindow;
  if (!runtime) return;
  // Keyboard Run must also satisfy Maker's explicit start-input gate.
  runtime.pyxelContext?.resolveInput?.();
  runtime.focus();
  runtime.document.getElementById("canvas")?.focus({ preventScroll: true });
  updateFocus("right");
}
