# Contributing

Thanks for helping improve Stellar Graph.

## Development

Run validation before opening a pull request:

```powershell
npm run validate
npm run prepare:dist
```

Manual test the plugin in Obsidian after changes that affect rendering,
settings, keyboard controls, or file creation.

## Pull Requests

Keep changes focused. Include:

- what changed
- how it was tested
- external demo links for visual changes; do not commit vault captures
- vault size and platform for performance changes

Do not add network calls, telemetry, or LLM integrations without an explicit
opt-in design and privacy review.
