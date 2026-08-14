import type {
	CachedMetadata,
	HeadingCache,
	ListItemCache,
	Loc,
	Pos,
	SectionCache,
	TagCache,
} from "obsidian";

export function loc(line: number, col = 0, offset = 0): Loc {
	return { line, col, offset };
}

export function pos(startLine: number, endLine: number): Pos {
	return { start: loc(startLine), end: loc(endLine) };
}

export function heading(text: string, level: number, line: number): HeadingCache {
	return { heading: text, level, position: pos(line, line) };
}

export function tag(tagText: string, line: number): TagCache {
	return { tag: tagText, position: pos(line, line) };
}

export function section(type: SectionCache["type"], startLine: number, endLine: number): SectionCache {
	return { type, position: pos(startLine, endLine) };
}

export function listItem(startLine: number, endLine: number, parent: number): ListItemCache {
	return { parent, position: pos(startLine, endLine) };
}

export function cache(partial: Partial<CachedMetadata>): CachedMetadata {
	return { ...partial };
}
