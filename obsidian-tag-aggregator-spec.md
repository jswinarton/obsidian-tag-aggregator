# Obsidian Plugin Spec: Tag Aggregator

## Purpose

Clicking a tag opens an ephemeral, unsaved document view that renders the full content associated with that tag across the vault — not just a list of links, but the actual content, reconstructed as if it had been authored in one place.

## Core Behavior

### Trigger

Do **not** override default tag click behavior anywhere — normal tag clicks continue to open Obsidian's native search as usual. Two triggers only:

1. **Command palette command** (`Aggregate tag...`): opens a fuzzy-search modal (`FuzzySuggestModal`) listing every tag in the vault (via `metadataCache.getTags()`), with usage counts. Selecting one (Enter or click) opens the aggregator view for that tag.
2. **Context menu item on the tag pane** (right sidebar): register via `registerEvent(app.workspace.on('file-menu' / tag-pane context menu event, ...))` — follow Tag Wrangler's approach for hooking the tag pane's right-click menu, adding an "Aggregate tag" item that opens the aggregator view for the clicked tag directly (no fuzzy-search step needed since the tag is already known).

### Tag Classification

For a given clicked tag `#foo`, scan `app.metadataCache` for every file containing that tag, and classify each occurrence into exactly one of three categories:

1. **Frontmatter tag** — tag appears in the YAML `tags:` list.
   - Render: the entire document body (excluding frontmatter itself, or optionally include it — configurable).

2. **Heading-scoped tag** — tag appears in a heading line itself (e.g. `## Workout #fitness`).
   - Render: the content from that heading up to (but not including) the next heading of equal or higher level. This is the primary use case: daily notes where each `##`/`###` heading is a self-contained tagged entry.

3. **Inline tag** — tag appears within body text, not in a heading line and not in frontmatter.
   - Render: just the enclosing block. Definition of "block": the paragraph containing the tag, OR if the tag is inside a list item, the full list item including nested sub-items, OR if inside a blockquote/callout, the full callout.

A single file may produce multiple separate results if the tag appears more than once in different scopes (e.g. once in frontmatter and once inline elsewhere) — each occurrence is a distinct result block.

### Extraction Logic (using `CachedMetadata`)

For each file with a match:

- Use `metadataCache.getFileCache(file)` to get `frontmatter`, `tags` (with `position`), `headings` (with `position` and `level`), and `sections` (with `position` and `type`).
- To classify a tag occurrence, compare its `position.start.line` against the `headings` array:
  - If the line number matches a heading's line exactly → heading-scoped.
  - Else, find which heading's range it falls under (between that heading and the next heading of ≤ its level) purely for context/breadcrumb purposes, but treat it as inline unless caught by the frontmatter check.
- For frontmatter tags, no position math needed — just check `frontmatter.tags`.
- For heading-scoped extraction: find the heading's line, then find the next heading in the `headings` array with `level <= currentLevel`; the range is `[headingLine, nextHeadingLine - 1]` (or EOF). Slice the raw file content by line range.
- For inline extraction: use the `sections` array (paragraph/list/blockquote boundaries with line positions) to find which section contains the tag's line, and slice that section's line range.
- Read raw content via `app.vault.cachedRead(file)` and slice by line numbers (split on `\n`).

### Result Assembly & View

- Create a custom `ItemView` (unique `VIEW_TYPE`), opened in a new tab via `workspace.getLeaf('tab')`.
- Not backed by a `TFile` — nothing is written to disk. Content lives only in memory for the life of the tab. Closing the tab discards it (no save prompt).
- View title: `#tagname (N results)`.
- Each result rendered via `MarkdownRenderer.render(app, extractedMarkdown, el, sourceFile.path, component)` so embeds, wikilinks, and formatting render normally.
- Each result block has:
  - A small header line above the content: source note name + category badge (`Frontmatter` / `Heading` / `Inline`) + (for heading matches) the heading text.
  - A clickable link back to the source: clicking opens the actual file at the relevant location (`workspace.openLinkText(file.path + (heading ? '#' + headingText : ''), '', false)`).
  - A visual divider between results (e.g. `<hr>` or a styled card boundary).
- Sort order (v1): fixed — reverse file name order (descending). Not user-configurable yet; structure the sort as an isolated, swappable function so it can become a setting later without touching the rest of the view logic.

### Settings

- Divider style (hr vs. card/border).
- Whether to include frontmatter block when rendering full-document (frontmatter-tag) results.
- Heading levels to treat as "section boundaries" for heading-scoped extraction (default: all levels, next heading of ≤ same level ends the section).
- Optional: exclude certain folders from aggregation (e.g. templates folder).

### Edge Cases to Handle

- Nested tags (`#foo/bar`) — clicking `#foo` should optionally include `#foo/bar` occurrences (configurable, default on, matching Obsidian's native tag search behavior).
- Tag appears multiple times within the same block/heading — de-duplicate so the block isn't rendered twice.
- Tag in a table cell — treat as inline; extract the containing table row or whole table (simplest: whole table, since tables aren't line-addressable per-cell in `sections`).
- File deleted/renamed while view is open — link-back should fail gracefully (toast notice, not a crash).
- Very large result sets — consider lazy rendering (only render visible results) if performance becomes an issue; not required for v1.
- Frontmatter tags written as a single string vs. array (`tags: foo` vs `tags: [foo, bar]`) — both are valid YAML and must be normalized (Obsidian's own parser already normalizes this via `frontmatter.tags`, but confirm).

## Non-Goals (v1)

- No persistence/caching of aggregator views across restarts.
- No editing within the aggregator view (read-only rendering).
- No cross-vault aggregation.
- No configurable sort order yet (fixed reverse file name order — see Result Assembly & View).

## Suggested File Structure

```
manifest.json
main.ts          — plugin entry, registers view, command, click handler
src/
  view.ts        — AggregatorView (ItemView subclass)
  extract.ts      — classification + extraction logic (pure functions, testable)
  settings.ts     — settings tab + defaults
styles.css
```

## Suggested Build Setup

- TypeScript + esbuild, following the standard Obsidian sample plugin template (`obsidian-sample-plugin` on GitHub) as scaffold.
- `extract.ts` should be written as pure functions operating on `(fileContent: string, cache: CachedMetadata, tag: string)` → `ExtractedResult[]`, so it can be unit-tested without a live Obsidian instance (mock the cache shape).
