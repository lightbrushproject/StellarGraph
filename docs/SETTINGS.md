# Settings

Stellar Graph is designed to work as a normal Obsidian plugin in existing
vaults. It adds agentic overlays when your vault already has source, brief,
agent, skill, project, or repo-note structure.

Open settings here:

```text
Settings -> Community plugins -> Stellar Graph
```

Available controls:

- display name shown in the graph controls
- default theme
- default graph mode
- starter wizard toggle
- reduced-motion default
- automatic or manual render budget

Public UI defaults favor readability:

- larger controls
- adjustable canvas label size
- deep zoom range
- group jump navigation

## Existing Vaults

Stellar Graph uses Obsidian's existing metadata cache:

- markdown files become nodes
- resolved wikilinks become edges
- folder names and frontmatter infer node types

No import step is required for an existing linked vault.

## Sparse Vaults

When a vault has too few notes or links to form a graph, Stellar Graph shows a
starter wizard.

The wizard can create:

- a basic Obsidian starter graph
- an agentic starter graph with agents, skills, sources, and briefings

This is optional and can be disabled from settings.
