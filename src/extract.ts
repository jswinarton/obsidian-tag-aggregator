import type {
	CachedMetadata,
	HeadingCache,
	ListItemCache,
	SectionCache,
	TagCache,
} from "obsidian";
import type { MatchCategory } from "./constants";

export interface ExtractOptions {
	/** Whether #foo should also match #foo/bar occurrences. */
	includeNestedTags: boolean;
	/** Whether to include the frontmatter block itself when rendering a full-document (frontmatter-tag) result. */
	includeFrontmatterInBody: boolean;
	/** Heading levels (1-6) that count as section boundaries when computing a heading-scoped range. */
	sectionBoundaryLevels: number[];
}

export interface LineRange {
	startLine: number;
	endLine: number;
}

export interface ExtractedResult extends LineRange {
	category: MatchCategory;
	content: string;
	headingText?: string;
}

export function normalizeTagForCompare(tag: string): string {
	return tag.toLowerCase().replace(/^#/, "");
}

export function tagMatches(candidateTag: string, targetTag: string, includeNested: boolean): boolean {
	const candidate = normalizeTagForCompare(candidateTag);
	const target = normalizeTagForCompare(targetTag);
	if (candidate === target) return true;
	if (includeNested && candidate.startsWith(target + "/")) return true;
	return false;
}

export function hasFrontmatterTagMatch(
	normalizedFrontmatterTags: string[],
	tag: string,
	includeNested: boolean
): boolean {
	return normalizedFrontmatterTags.some((candidate) => tagMatches(candidate, tag, includeNested));
}

export function classifyBodyTagOccurrence(
	tagCache: TagCache,
	headings: HeadingCache[]
): "heading" | "inline" {
	const line = tagCache.position.start.line;
	const onHeadingLine = headings.some((h) => h.position.start.line === line);
	return onHeadingLine ? "heading" : "inline";
}

export function findHeadingIndexForLine(line: number, headings: HeadingCache[]): number {
	return headings.findIndex((h) => h.position.start.line === line);
}

export function findNearestHeadingBefore(
	line: number,
	headings: HeadingCache[]
): HeadingCache | undefined {
	let result: HeadingCache | undefined;
	for (const heading of headings) {
		if (heading.position.start.line > line) break;
		result = heading;
	}
	return result;
}

export function computeHeadingRange(
	headingIndex: number,
	headings: HeadingCache[],
	totalLines: number,
	boundaryLevels: number[]
): LineRange {
	const heading = headings[headingIndex];
	const startLine = heading.position.start.line;
	let endLine = totalLines - 1;
	for (let i = headingIndex + 1; i < headings.length; i++) {
		const next = headings[i];
		if (next.level <= heading.level && boundaryLevels.includes(next.level)) {
			endLine = next.position.start.line - 1;
			break;
		}
	}
	return { startLine, endLine };
}

export function findEnclosingSection(
	line: number,
	sections: SectionCache[]
): SectionCache | undefined {
	return sections.find(
		(section) => section.position.start.line <= line && line <= section.position.end.line
	);
}

/**
 * Finds the top-level list item containing `line` and expands the range to cover
 * all of its nested descendants. Cannot use SectionCache alone here: a 'list' section
 * spans the entire list block (all top-level items), which is broader than "one item
 * plus its own sub-items" per the spec.
 */
export function findEnclosingListItemRange(
	line: number,
	listItems: ListItemCache[]
): LineRange | undefined {
	if (!listItems.length) return undefined;

	const containing = listItems.find(
		(item) => item.position.start.line <= line && line <= item.position.end.line
	);
	if (!containing) return undefined;

	const itemsByStartLine = new Map(listItems.map((item) => [item.position.start.line, item] as const));

	// Walk up the parent chain to the top-level (root) item of this list-item's subtree.
	// ListItemCache.parent is the start line of the direct parent item, or (if root-level)
	// the negative of the list's own start line -- a defensive cycle guard covers the
	// known Obsidian bug where `parent` is occasionally misassigned.
	let root = containing;
	const seenParents = new Set<number>();
	while (root.parent >= 0) {
		if (seenParents.has(root.parent)) break;
		seenParents.add(root.parent);
		const parentItem = itemsByStartLine.get(root.parent);
		if (!parentItem) break;
		root = parentItem;
	}

	const rootIndex = listItems.indexOf(root);
	let endLine = root.position.end.line;
	for (let i = rootIndex + 1; i < listItems.length; i++) {
		const item = listItems[i];
		// A descendant's `parent` points at the start line of an item already accepted
		// into this subtree's range; anything else means we've left the subtree.
		if (item.parent >= root.position.start.line && item.parent <= endLine) {
			endLine = Math.max(endLine, item.position.end.line);
		} else {
			break;
		}
	}

	return { startLine: root.position.start.line, endLine };
}

export function computeInlineRange(
	line: number,
	sections: SectionCache[],
	listItems: ListItemCache[]
): LineRange {
	const section = findEnclosingSection(line, sections);

	if (section?.type === "list") {
		const listRange = findEnclosingListItemRange(line, listItems);
		if (listRange) {
			return {
				startLine: Math.max(listRange.startLine, section.position.start.line),
				endLine: Math.min(listRange.endLine, section.position.end.line),
			};
		}
	}

	if (section) {
		return { startLine: section.position.start.line, endLine: section.position.end.line };
	}

	return { startLine: line, endLine: line };
}

export function sliceLines(fileContent: string, startLine: number, endLine: number): string {
	const lines = fileContent.split("\n");
	const start = Math.max(0, startLine);
	const end = Math.min(lines.length - 1, endLine);
	if (end < start) return "";
	return lines.slice(start, end + 1).join("\n");
}

export function dedupeResults(results: ExtractedResult[]): ExtractedResult[] {
	const seen = new Set<string>();
	const deduped: ExtractedResult[] = [];
	for (const result of results) {
		const key = `${result.category}:${result.startLine}:${result.endLine}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(result);
	}
	return deduped;
}

/**
 * Pure extraction: given a file's raw content, its metadata cache, the target tag, and its
 * already-normalized frontmatter tag list (produced upstream via Obsidian's own
 * `parseFrontMatterTags`, since that API only runs inside a live Obsidian instance), returns
 * every distinct result block for that tag in the file.
 */
export function extractTagOccurrences(
	fileContent: string,
	cache: CachedMetadata,
	tag: string,
	normalizedFrontmatterTags: string[],
	options: ExtractOptions
): ExtractedResult[] {
	const results: ExtractedResult[] = [];
	const totalLines = fileContent.split("\n").length;
	const headings = cache.headings ?? [];
	const sections = cache.sections ?? [];
	const listItems = cache.listItems ?? [];

	if (hasFrontmatterTagMatch(normalizedFrontmatterTags, tag, options.includeNestedTags)) {
		const bodyStartLine = options.includeFrontmatterInBody
			? 0
			: cache.frontmatterPosition
				? cache.frontmatterPosition.end.line + 1
				: 0;
		results.push({
			category: "frontmatter",
			startLine: bodyStartLine,
			endLine: totalLines - 1,
			content: sliceLines(fileContent, bodyStartLine, totalLines - 1),
		});
	}

	for (const tagCache of cache.tags ?? []) {
		if (!tagMatches(tagCache.tag, tag, options.includeNestedTags)) continue;

		const line = tagCache.position.start.line;
		const category = classifyBodyTagOccurrence(tagCache, headings);

		if (category === "heading") {
			const headingIndex = findHeadingIndexForLine(line, headings);
			const { startLine, endLine } = computeHeadingRange(
				headingIndex,
				headings,
				totalLines,
				options.sectionBoundaryLevels
			);
			results.push({
				category: "heading",
				startLine,
				endLine,
				content: sliceLines(fileContent, startLine, endLine),
				headingText: headings[headingIndex].heading,
			});
		} else {
			const { startLine, endLine } = computeInlineRange(line, sections, listItems);
			const nearestHeading = findNearestHeadingBefore(line, headings);
			results.push({
				category: "inline",
				startLine,
				endLine,
				content: sliceLines(fileContent, startLine, endLine),
				headingText: nearestHeading?.heading,
			});
		}
	}

	return dedupeResults(results);
}
