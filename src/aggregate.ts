import { type App, getAllTags, parseFrontMatterTags } from "obsidian";
import { extractTagOccurrences, type ExtractedResult, type ExtractOptions } from "./extract";
import { sortByFileNameDescending, type SortStrategy } from "./sort";

export interface AggregateOptions extends ExtractOptions {
	excludedFolders: string[];
}

export interface AggregatedResult extends ExtractedResult {
	filePath: string;
	fileBasename: string;
}

function isExcluded(filePath: string, excludedFolders: string[]): boolean {
	return excludedFolders.some((folder) => {
		const normalized = folder.endsWith("/") ? folder : folder + "/";
		return filePath.startsWith(normalized);
	});
}

export async function aggregateTag(
	app: App,
	tag: string,
	options: AggregateOptions,
	sortFn: SortStrategy<AggregatedResult> = sortByFileNameDescending
): Promise<AggregatedResult[]> {
	const results: AggregatedResult[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (isExcluded(file.path, options.excludedFolders)) continue;

		const fileCache = app.metadataCache.getFileCache(file);
		if (!fileCache) continue;

		const normalizedFrontmatterTags = (parseFrontMatterTags(fileCache.frontmatter) ?? []).map((t) =>
			t.replace(/^#/, "")
		);

		const hasBodyTag = (fileCache.tags ?? []).length > 0;
		if (normalizedFrontmatterTags.length === 0 && !hasBodyTag) continue;

		const fileContent = await app.vault.cachedRead(file);
		const extracted = extractTagOccurrences(fileContent, fileCache, tag, normalizedFrontmatterTags, options);

		for (const result of extracted) {
			results.push({ ...result, filePath: file.path, fileBasename: file.basename });
		}
	}

	return results.sort(sortFn);
}

/**
 * Builds a tag -> usage-count map for the fuzzy-search modal, using only documented
 * Obsidian APIs (`getAllTags`). `MetadataCache.getTags()` would be simpler but is an
 * undocumented internal method with no public type signature.
 */
export function getVaultTagCounts(app: App): Record<string, number> {
	const counts: Record<string, number> = {};

	for (const file of app.vault.getMarkdownFiles()) {
		const fileCache = app.metadataCache.getFileCache(file);
		if (!fileCache) continue;

		for (const tag of getAllTags(fileCache) ?? []) {
			const normalized = tag.toLowerCase();
			counts[normalized] = (counts[normalized] ?? 0) + 1;
		}
	}

	return counts;
}
