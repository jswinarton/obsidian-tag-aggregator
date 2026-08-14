import { describe, expect, it } from "vitest";
import {
	computeHeadingRange,
	computeInlineRange,
	dedupeResults,
	extractTagOccurrences,
	findEnclosingListItemRange,
	hasFrontmatterTagMatch,
	tagMatches,
	type ExtractOptions,
} from "../src/extract";
import { cache, heading, listItem, section, tag } from "./fixtures";

const defaultOptions: ExtractOptions = {
	includeNestedTags: true,
	includeFrontmatterInBody: false,
	sectionBoundaryLevels: [1, 2, 3, 4, 5, 6],
};

describe("tagMatches", () => {
	it("matches exact tags case-insensitively", () => {
		expect(tagMatches("#Foo", "foo", true)).toBe(true);
		expect(tagMatches("foo", "#Foo", true)).toBe(true);
	});

	it("matches nested tags when includeNested is true", () => {
		expect(tagMatches("#foo/bar", "foo", true)).toBe(true);
	});

	it("does not match nested tags when includeNested is false", () => {
		expect(tagMatches("#foo/bar", "foo", false)).toBe(false);
	});

	it("does not match a tag that merely starts with the target string", () => {
		expect(tagMatches("#foobar", "foo", true)).toBe(false);
	});
});

describe("hasFrontmatterTagMatch", () => {
	it("matches an exact frontmatter tag", () => {
		expect(hasFrontmatterTagMatch(["project", "life/work"], "project", true)).toBe(true);
	});

	it("matches a nested frontmatter tag", () => {
		expect(hasFrontmatterTagMatch(["life/work"], "life", true)).toBe(true);
	});

	it("does not match a nested frontmatter tag when disabled", () => {
		expect(hasFrontmatterTagMatch(["life/work"], "life", false)).toBe(false);
	});

	it("does not false-positive on a differently-named tag with a shared prefix", () => {
		expect(hasFrontmatterTagMatch(["lifework"], "life", true)).toBe(false);
	});
});

describe("heading-scoped extraction", () => {
	const fileContent = [
		"# Daily Note",
		"## Workout #fitness",
		"Did 30 pushups.",
		"Felt great.",
		"## Journal",
		"Just some thoughts.",
		"### Subsection #life",
		"nested content here",
		"## Another Heading",
		"more content",
	].join("\n");

	const fileCache = cache({
		headings: [
			heading("Daily Note", 1, 0),
			heading("Workout #fitness", 2, 1),
			heading("Journal", 2, 4),
			heading("Subsection #life", 3, 6),
			heading("Another Heading", 2, 8),
		],
		tags: [tag("#fitness", 1), tag("#life", 6)],
	});

	it("stops a level-2 heading section at the next heading of level <= 2", () => {
		const results = extractTagOccurrences(fileContent, fileCache, "fitness", [], defaultOptions);
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			category: "heading",
			startLine: 1,
			endLine: 3,
			headingText: "Workout #fitness",
			content: "## Workout #fitness\nDid 30 pushups.\nFelt great.",
		});
	});

	it("stops a level-3 heading section at the next heading of level <= 3", () => {
		const results = extractTagOccurrences(fileContent, fileCache, "life", [], defaultOptions);
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			category: "heading",
			startLine: 6,
			endLine: 7,
			headingText: "Subsection #life",
			content: "### Subsection #life\nnested content here",
		});
	});

	it("respects sectionBoundaryLevels, skipping heading levels not configured as boundaries", () => {
		const headings = [heading("Section A #tag", 2, 0), heading("Top Level Heading", 1, 2), heading("Section B", 2, 4)];

		const allLevels = computeHeadingRange(0, headings, 6, [1, 2, 3, 4, 5, 6]);
		expect(allLevels).toEqual({ startLine: 0, endLine: 1 });

		const onlyLevel2 = computeHeadingRange(0, headings, 6, [2]);
		expect(onlyLevel2).toEqual({ startLine: 0, endLine: 3 });
	});
});

describe("inline extraction: paragraph", () => {
	it("captures a full multi-line paragraph", () => {
		const fileContent = [
			"This is line one of a paragraph",
			"that continues on line two",
			"with an inline tag #project on line three.",
			"",
			"Unrelated after blank line.",
		].join("\n");

		const fileCache = cache({
			sections: [section("paragraph", 0, 2), section("paragraph", 4, 4)],
			tags: [tag("#project", 2)],
		});

		const results = extractTagOccurrences(fileContent, fileCache, "project", [], defaultOptions);
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			category: "inline",
			startLine: 0,
			endLine: 2,
			content:
				"This is line one of a paragraph\nthat continues on line two\nwith an inline tag #project on line three.",
		});
	});
});

describe("inline extraction: nested list item", () => {
	const fileContent = [
		"Intro line.",
		"",
		"- Top item one",
		"- Top item two #task with an inline tag",
		"  - Sub item A",
		"  - Sub item B",
		"- Top item three",
	].join("\n");

	const listItems = [
		listItem(2, 2, -2),
		listItem(3, 3, -2),
		listItem(4, 4, 3),
		listItem(5, 5, 3),
		listItem(6, 6, -2),
	];

	const fileCache = cache({
		sections: [section("paragraph", 0, 0), section("list", 2, 6)],
		listItems,
		tags: [tag("#task", 3)],
	});

	it("includes the tagged item and its nested sub-items but not sibling items", () => {
		const results = extractTagOccurrences(fileContent, fileCache, "task", [], defaultOptions);
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			category: "inline",
			startLine: 3,
			endLine: 5,
			content: "- Top item two #task with an inline tag\n  - Sub item A\n  - Sub item B",
		});
	});

	it("findEnclosingListItemRange excludes preceding and following top-level siblings", () => {
		const range = findEnclosingListItemRange(3, listItems);
		expect(range).toEqual({ startLine: 3, endLine: 5 });
	});
});

describe("inline extraction: blockquote/callout", () => {
	it("captures the entire callout regardless of which internal line the tag is on", () => {
		const fileContent = [
			"Some text before.",
			"",
			"> [!note] Callout title",
			"> content line one #note",
			"> content line two",
			"",
			"After callout.",
		].join("\n");

		const fileCache = cache({
			sections: [section("paragraph", 0, 0), section("callout", 2, 4)],
			tags: [tag("#note", 3)],
		});

		const results = extractTagOccurrences(fileContent, fileCache, "note", [], defaultOptions);
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			category: "inline",
			startLine: 2,
			endLine: 4,
			content: "> [!note] Callout title\n> content line one #note\n> content line two",
		});
	});
});

describe("inline extraction: table", () => {
	it("captures the whole table for a tag in a cell", () => {
		const fileContent = [
			"Intro.",
			"",
			"| Col A | Col B |",
			"| --- | --- |",
			"| val1 | #tag-in-table |",
			"| val2 | val3 |",
			"",
			"After table.",
		].join("\n");

		const fileCache = cache({
			sections: [section("paragraph", 0, 0), section("table", 2, 5)],
			tags: [tag("#tag-in-table", 4)],
		});

		const results = extractTagOccurrences(fileContent, fileCache, "tag-in-table", [], defaultOptions);
		expect(results).toHaveLength(1);
		expect(results[0].startLine).toBe(2);
		expect(results[0].endLine).toBe(5);
	});
});

describe("frontmatter extraction", () => {
	const fileContent = ["---", "tags: [project]", "---", "# Title", "", "Body content here."].join("\n");

	const fileCache = cache({
		frontmatterPosition: { start: { line: 0, col: 0, offset: 0 }, end: { line: 2, col: 3, offset: 20 } },
		headings: [heading("Title", 1, 3)],
	});

	it("excludes the frontmatter block by default", () => {
		const results = extractTagOccurrences(fileContent, fileCache, "project", ["project"], defaultOptions);
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			category: "frontmatter",
			startLine: 3,
			endLine: 5,
			content: "# Title\n\nBody content here.",
		});
	});

	it("includes the frontmatter block when includeFrontmatterInBody is true", () => {
		const results = extractTagOccurrences(fileContent, fileCache, "project", ["project"], {
			...defaultOptions,
			includeFrontmatterInBody: true,
		});
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({ startLine: 0, endLine: 5, content: fileContent });
	});
});

describe("de-duplication", () => {
	it("collapses two tag occurrences that resolve to the same block", () => {
		const results = dedupeResults([
			{ category: "inline", startLine: 0, endLine: 0, content: "x" },
			{ category: "inline", startLine: 0, endLine: 0, content: "x" },
			{ category: "inline", startLine: 1, endLine: 1, content: "y" },
		]);
		expect(results).toHaveLength(2);
	});

	it("a tag mentioned twice in the same paragraph produces one result", () => {
		const fileContent = "Paragraph with #dup tag mentioned twice, once here #dup again.";
		const fileCache = cache({
			sections: [section("paragraph", 0, 0)],
			tags: [tag("#dup", 0), tag("#dup", 0)],
		});
		const results = extractTagOccurrences(fileContent, fileCache, "dup", [], defaultOptions);
		expect(results).toHaveLength(1);
	});
});

describe("nested tag inclusion across separate blocks", () => {
	const fileContent = [
		"Paragraph one has #foo tag.",
		"",
		"Paragraph two has #foo/bar tag.",
		"",
		"Paragraph three has #foobar which must not match.",
	].join("\n");

	const fileCache = cache({
		sections: [section("paragraph", 0, 0), section("paragraph", 2, 2), section("paragraph", 4, 4)],
		tags: [tag("#foo", 0), tag("#foo/bar", 2), tag("#foobar", 4)],
	});

	it("includes nested tag occurrences when includeNestedTags is true", () => {
		const results = extractTagOccurrences(fileContent, fileCache, "foo", [], defaultOptions);
		expect(results).toHaveLength(2);
		expect(results.map((r) => r.startLine).sort()).toEqual([0, 2]);
	});

	it("excludes nested tag occurrences when includeNestedTags is false", () => {
		const results = extractTagOccurrences(fileContent, fileCache, "foo", [], {
			...defaultOptions,
			includeNestedTags: false,
		});
		expect(results).toHaveLength(1);
		expect(results[0].startLine).toBe(0);
	});
});

describe("computeInlineRange fallback", () => {
	it("falls back to a single line when no enclosing section is found", () => {
		expect(computeInlineRange(5, [], [])).toEqual({ startLine: 5, endLine: 5 });
	});
});
