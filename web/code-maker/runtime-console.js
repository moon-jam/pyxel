// This bridge is loaded only in Maker's game iframe, before Python starts.
window.pyxelMakerOutput = (stream, text) => {
  if (window.parent !== window)
    window.parent._makerConsole?.write(stream, text);
};
