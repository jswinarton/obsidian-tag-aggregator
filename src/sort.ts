export type SortStrategy<T> = (a: T, b: T) => number;

export interface SortableResult {
	fileBasename: string;
}

export const sortByFileNameDescending: SortStrategy<SortableResult> = (a, b) =>
	b.fileBasename.localeCompare(a.fileBasename);
