# Privacy

Stellar Graph is local-first.

The plugin reads markdown file metadata, file paths, frontmatter, and resolved
wikilinks through Obsidian's plugin API so it can draw a graph for the current
vault.

Stellar Graph does not:

- make network requests
- create accounts
- upload vault content
- call LLM APIs
- store data outside the vault plugin settings file

The sparse-vault starter wizard can create sample notes and folders in the
current vault. It shows the planned files and asks for confirmation before
writing anything.

Future LLM features, if added, should be opt-in and should show users exactly
which note content or metadata will be sent before any model call.
