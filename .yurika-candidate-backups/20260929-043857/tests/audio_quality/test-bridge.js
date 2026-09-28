"use strict";
// Test-only bridge. Loaded only by tests/audio_quality/runtime.html.
globalThis.__YURIKA_TEST_API__ = Object.freeze({
  start,
  stop,
  status,
  applySettings,
  getState: () => state
});
