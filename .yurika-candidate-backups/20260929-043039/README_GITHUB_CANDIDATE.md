# YURIKA Audio 3.7.0 GitHub Candidate - FIX5 V3 Root Layout

This package now follows the same repository layout as `YURIKA-Audio-V3.zip`: **the repository root itself is the Chrome extension root**.

- `manifest.json`, `offscreen.js`, `ai-hires.js`, WASM, Dart runtime, MATLAB numeric design, etc. are installed at repository root or their normal root subfolders.
- There is no required `extension/` wrapper.
- The installer requires a real Git working tree (`.git`) and a root-level `manifest.json`, so GitHub Desktop will see the changes in the exact repository you selected.
- Fine evaluator and GitHub Actions remain development-only measurement tooling.

## Apply
Run `APPLY_TO_GITHUB_REPO.cmd`, then paste the path shown by GitHub Desktop -> Repository -> Show in Explorer.

Expected target shape:

```text
YURIKA-Audio-V3\
  .git\
  manifest.json
  offscreen.js
  ...
```

After success, GitHub Desktop should show the managed file changes immediately.
