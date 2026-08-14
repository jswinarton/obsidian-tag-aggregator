# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Obsidian plugin. Clicking through the **Aggregate tag...** command palette entry opens an ephemeral, read-only tab that reconstructs every piece of content tagged `#foo` across the vault — full documents for frontmatter tags, whole sections for heading-scoped tags, individual blocks for inline tags. Nothing is written to disk; closing the tab discards it.

## Commands

```bash
npm install                                 # once, installs devDependencies
npm run build                               # tsc typecheck + esbuild bundle src/*.ts + main.ts -> main.js
npm run dev                                 # same bundle, esbuild watch mode
npm test                                    # vitest run (all of tests/extract.test.ts)
npm run test:watch                          # vitest watch mode
npm run install-to-vault -- /path/to/vault  # build, then copy manifest.json/main.js/styles.css into <vault>/.obsidian/plugins/tag-aggregator/
```

Obsidian only loads the bundled `main.js` (per `manifest.json`) — it has no notion of the TypeScript source or the multi-file `src/` layout, so `npm run build` is the step that actually produces the installable artifact.

Run a single test file or a specific case with vitest directly:

```bash
npx vitest run tests/extract.test.ts -t "dedupe"
```

### Trying it out

`test-vault/` is a fixture vault for manual testing, with `test-vault/.obsidian/plugins/tag-aggregator` **symlinked** to the repo root — any `npm run build` is reflected there immediately. For any other vault (including a real one), use `npm run install-to-vault` since it isn't symlinked and needs an actual file copy; reload the plugin afterward (toggle off/on under Settings → Community plugins, or restart Obsidian) to pick up a new build.

## Architecture

**`src/extract.ts` is the core and the only unit-tested file.** It's written as pure functions using only `import type` from `obsidian` — zero runtime dependency on the `obsidian` module, so it runs under plain Node/vitest with no mocking. Given a file's raw text + its `CachedMetadata` + a tag, `extractTagOccurrences()` classifies each `cache.tags` occurrence (heading-line match → `heading`; otherwise `inline`; frontmatter checked separately via an already-normalized tag list passed in) and computes a line range to slice:

- **frontmatter** → whole document (or just the body, per `includeFrontmatterInBody`)
- **heading** → from that heading to the next heading whose level is both `<=` it and in the configured `sectionBoundaryLevels`
- **inline** → the enclosing `SectionCache` range for paragraphs/callouts/tables, but for lists, `findEnclosingListItemRange()` reconstructs one top-level item's subtree from the flat `listItems` array (Obsidian's `sections` treats an entire list as one block, too broad for "the tagged item plus its nested sub-items"; `ListItemCache.parent` encodes hierarchy via line-number pointers, with a defensive cycle-guard against a known Obsidian bug where that field is occasionally misassigned)

**Everything else is a thin shell around that:**

- `src/aggregate.ts` — the only place besides `main.ts`/`src/modal.ts` that touches the live `App`. `aggregateTag()` walks `vault.getMarkdownFiles()`, reads each via `cachedRead`, normalizes frontmatter tags via Obsidian's own `parseFrontMatterTags` (deliberately not reimplemented in `extract.ts`, to avoid drifting from Obsidian's actual YAML-shape handling), calls into `extract.ts`, sorts. Also `getVaultTagCounts()`, built from the documented `getAllTags()` rather than the undocumented `metadataCache.getTags()`.
- `src/sort.ts` — one function (`sortByFileNameDescending`), kept isolated so a future settings-driven sort is a one-line swap.
- `src/view.ts` — `AggregatorView` (`ItemView`), renders result cards (source link, category badge, heading breadcrumb, rendered markdown body, divider) and handles link-back with a graceful `Notice` if the source file's gone. Takes an `initialTag` constructor argument and re-applies its own `setViewState`/`getViewState()` after loading — both exist because Obsidian's tab-strip title and in-pane header title are two separate DOM elements refreshed by different (and, for the in-pane one, non-existent) mechanisms; there's no public API to force-refresh the in-pane title after construction, so the constructor arg avoids ever needing to.
- `src/modal.ts` — `TagSuggestModal`, a `FuzzySuggestModal` over `getVaultTagCounts()`.
- `src/settings.ts` — `TagAggregatorSettings` shape/defaults and the `PluginSettingTab`.
- `main.ts` — registers the view type, the `Aggregate tag...` command, and the settings tab; `openAggregatorView()` opens a tab, shows a loading state, awaits `aggregateTag()`, populates results. Uses a `pendingTag` field on the plugin instance to pass the tag into `AggregatorView`'s constructor, since `registerView`'s factory only receives a `leaf` — this works because `setViewState`'s internal call into that factory happens synchronously.

**Constraint that shaped several of the above:** only documented, public Obsidian APIs are used throughout. The spec's original design called for a second trigger — a right-click "Aggregate tag" entry on the tag pane — but that requires hooking an undocumented internal DOM structure (à la the community plugin Tag Wrangler); it was deliberately dropped, and the command palette is the only trigger. The `findEnclosingListItemRange` cycle-guard and the constructor-injected `initialTag` are both instances of the same bias: prefer working around an API gap over reaching into anything undocumented or private.
