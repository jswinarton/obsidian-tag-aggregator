import { describe, expect, it } from "vitest";
import { sortByFileNameDescending } from "../src/sort";

describe("sortByFileNameDescending", () => {
	it("sorts by basename, descending", () => {
		const results = [{ fileBasename: "apple" }, { fileBasename: "zebra" }, { fileBasename: "mango" }];
		expect(results.sort(sortByFileNameDescending).map((r) => r.fileBasename)).toEqual([
			"zebra",
			"mango",
			"apple",
		]);
	});

	it("sorts by basename, not by folder path", () => {
		// A note in a folder that sorts later than another folder must not out-rank a
		// higher-basename note just because its folder name comes first alphabetically.
		const results = [
			{ filePath: "AAA-folder/zebra.md", fileBasename: "zebra" },
			{ filePath: "ZZZ-folder/apple.md", fileBasename: "apple" },
		];
		expect(results.sort(sortByFileNameDescending).map((r) => r.fileBasename)).toEqual(["zebra", "apple"]);
	});
});
