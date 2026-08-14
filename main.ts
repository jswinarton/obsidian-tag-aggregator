import { Plugin, WorkspaceLeaf } from "obsidian";
import { aggregateTag, type AggregateOptions } from "./src/aggregate";
import { VIEW_TYPE_AGGREGATOR } from "./src/constants";
import { TagSuggestModal } from "./src/modal";
import { DEFAULT_SETTINGS, TagAggregatorSettingTab, type TagAggregatorSettings } from "./src/settings";
import { AggregatorView } from "./src/view";

export default class TagAggregatorPlugin extends Plugin {
	settings: TagAggregatorSettings = DEFAULT_SETTINGS;
	// Read once, synchronously, by the AggregatorView viewCreator below -- registerView's
	// factory only receives `leaf`, so there's no other way to pass per-call construction
	// data through Obsidian's public API. Safe because setViewState's internal call into
	// the viewCreator happens synchronously, before any other code can run.
	private pendingTag = "";

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_AGGREGATOR, (leaf) => new AggregatorView(leaf, this.pendingTag));

		this.addCommand({
			id: "aggregate-tag",
			name: "Aggregate tag...",
			callback: () => {
				new TagSuggestModal(this.app, (tag) => this.openAggregatorView(tag)).open();
			},
		});

		this.addSettingTab(new TagAggregatorSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private aggregateOptions(): AggregateOptions {
		return {
			includeNestedTags: this.settings.includeNestedTags,
			includeFrontmatterInBody: this.settings.includeFrontmatterInBody,
			sectionBoundaryLevels: this.settings.sectionBoundaryLevels,
			excludedFolders: this.settings.excludedFolders,
		};
	}

	private async openAggregatorView(tag: string): Promise<void> {
		this.pendingTag = tag;
		const leaf: WorkspaceLeaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_AGGREGATOR, active: true });
		this.app.workspace.revealLeaf(leaf);

		const view = leaf.view;
		if (!(view instanceof AggregatorView)) return;

		view.setLoading(tag);
		const results = await aggregateTag(this.app, tag, this.aggregateOptions());
		view.setResults(tag, results, { dividerStyle: this.settings.dividerStyle });
	}
}
