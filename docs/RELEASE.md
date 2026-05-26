# Release Checklist

## Preflight

- Run `npm run validate`.
- Run `npm run prepare:dist`.
- Test manual install from `dist/stellar-graph/` in a clean vault.
- Verify `dist/stellar-graph-<version>.zip` contains only `main.js`, `manifest.json`, and `styles.css`.
- Verify the plugin opens from the ribbon icon and command palette.
- Verify clicking a node opens the matching note.
- Verify keyboard controls: arrow rotate, plus/minus zoom, bracket node stepping, Enter open.
- Check that closing the view stops animation and removes listeners.
- Check that enabling the plugin does not force-open a pane.
- Check CPU behavior on a larger vault.
- Verify Auto render budget and Manual render budget settings.
- Verify reduced-motion setting opens the view paused.
- Verify starter wizard shows exact files and asks for confirmation before writing.
- Verify manifest remains desktop-only until touch/mobile support exists.

## GitHub Release

Use the same version in `manifest.json`, `package.json`, and the GitHub release
tag.

Attach these release files:

- `main.js`
- `manifest.json`
- `styles.css`
- optional `stellar-graph-<version>.zip`

## Obsidian Community Submission

Submit the plugin after the repo has:

- `README.md`
- `LICENSE`
- `manifest.json`
- release assets attached to a GitHub release
- external demo link, if available
- clear privacy statement
- no claims that it is the first 3D graph, first animated graph, or first AI
  graph for Obsidian
- settings verified on a clean vault
- sparse-vault wizard tested on a vault with fewer than four linked notes

## Privacy Statement

Stellar Graph reads local vault metadata and markdown file paths through the
Obsidian plugin API. It does not make network requests.
