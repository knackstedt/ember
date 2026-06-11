# Known Shortcuts & TODOs

## itch.io Executable Detection
The `findExecutableInInstall` helper in `src/main/services/itch.service.ts` uses a naive heuristic:
- Picks the first `.exe`/`.sh`/`.bin` alphabetically in the install directory.
- Recurses into subdirectories blindly.
- May select the wrong executable when multiple candidates exist.

**Action needed:** Replace with a smarter launcher detection strategy, possibly by
reading the itch app's `receipt.json` or `manifest.json` if present, or by
consulting a curated mapping of game IDs to their actual launch executables.
