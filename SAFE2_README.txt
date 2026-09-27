YURIKA Audio 3.5.1 CI Wiring PATCH - SAFE2

Use APPLY_TO_GITHUB_REPO_SAFE2.cmd.

Why SAFE2 exists:
- Removes robocopy from the installer.
- Uses PowerShell Copy-Item with LiteralPath for Japanese/OneDrive paths.
- Handles hidden .github and .yurika-* files.
- Detects a repo path that is one level too deep or one level too high.
- Verifies 3.5.1 metadata and all R5/Hall workflow steps after copying.
- Always pauses so the window stays visible on success or error.

IMPORTANT:
Extract this ZIP OUTSIDE the YURIKA-Audio-V3 repository folder before running it.
