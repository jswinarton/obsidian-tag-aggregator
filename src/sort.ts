export type SortStrategy<T> = (a: T, b: T) => number;

export interface SortableResult {
	filePath: string;
}

export const sortByFileNameDescending: SortStrategy<SortableResult> = (a, b) =>
	b.filePath.localeCompare(a.filePath);
