# Tag Aggregator

An Obsidian plugin that reconstructs a tag into a single, ephemeral, read-only view — full documents for frontmatter tags, whole sections for heading-scoped tags, and individual blocks for inline tags.

## Usage

Run the **Aggregate tag...** command from the command palette. It opens a fuzzy-search list of every tag in your vault (with usage counts); choosing one opens a new tab titled `#tag (N results)` with every matching block rendered in place, source-linked back to its note.

Nothing is written to disk — closing the tab discards it.

## How a tag occurrence is classified

- **Page** — tag is in the note's YAML `tags:` list → the whole document body is shown.
- **Heading** — tag appears in a heading line (e.g. `## Workout #fitness`) → everything from that heading up to the next heading of equal or higher level is shown.
- **Inline** — tag appears in body text → just the enclosing block (paragraph, list item with its nested sub-items, callout, or table) is shown.

## Settings

- **Divider style** — horizontal rule or card border between results.
- **Include frontmatter block** — whether frontmatter-tag results include the YAML block itself.
- **Include nested tags** — whether `#foo` also matches `#foo/bar` occurrences (on by default, matching Obsidian's native tag search).
- **Section boundary heading levels** — which heading levels count as boundaries when computing a heading-scoped result's range.
- **Excluded folders** — folders (e.g. a templates folder) skipped when aggregating.

## Development

```bash
npm install    # once, installs devDependencies
npm run build  # typecheck + bundle src/*.ts -> main.js (the file that matters)
npm run dev    # same bundling, but watches and rebuilds on save -- for active iteration only
npm test       # vitest unit tests for src/extract.ts -- verification only, doesn't touch main.js
```

`dev` and `test` are for when you're changing the code. If you're just installing a build, `build` is the only one you need.

### Installing into a vault

`test-vault/` is a small fixture vault for manual testing, with the plugin **symlinked** into `test-vault/.obsidian/plugins/tag-aggregator` — since it points back at this repo, any `npm run build` is reflected there immediately, no copying required.

Any other vault (including a real one) needs the three built files actually copied in, since it isn't symlinked. Do that with:

```bash
npm run install-to-vault -- /path/to/your/vault
```
