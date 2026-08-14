import { PluginSettingTab, Setting, type App } from "obsidian";
import type TagAggregatorPlugin from "../main";

export interface TagAggregatorSettings {
	dividerStyle: "hr" | "card";
	includeFrontmatterInBody: boolean;
	includeNestedTags: boolean;
	sectionBoundaryLevels: number[];
	excludedFolders: string[];
}

export const DEFAULT_SETTINGS: TagAggregatorSettings = {
	dividerStyle: "hr",
	includeFrontmatterInBody: false,
	includeNestedTags: true,
	sectionBoundaryLevels: [1, 2, 3, 4, 5, 6],
	excludedFolders: [],
};

const ALL_HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

export class TagAggregatorSettingTab extends PluginSettingTab {
	private readonly plugin: TagAggregatorPlugin;

	constructor(app: App, plugin: TagAggregatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Divider style")
			.setDesc("How results are visually separated from each other.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("hr", "Horizontal rule")
					.addOption("card", "Card border")
					.setValue(this.plugin.settings.dividerStyle)
					.onChange(async (value) => {
						this.plugin.settings.dividerStyle = value as "hr" | "card";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Include frontmatter block")
			.setDesc("Include the frontmatter block itself when rendering a full-document (frontmatter-tag) result.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeFrontmatterInBody).onChange(async (value) => {
					this.plugin.settings.includeFrontmatterInBody = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Include nested tags")
			.setDesc("Clicking #foo also includes #foo/bar occurrences, matching Obsidian's native tag search.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeNestedTags).onChange(async (value) => {
					this.plugin.settings.includeNestedTags = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Section boundary heading levels")
			.setDesc(
				"Heading levels (1-6) that count as section boundaries when computing a heading-scoped result's range. Comma-separated, e.g. \"1,2,3\"."
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.sectionBoundaryLevels.join(","))
					.onChange(async (value) => {
						const levels = value
							.split(",")
							.map((part) => Number.parseInt(part.trim(), 10))
							.filter((level) => ALL_HEADING_LEVELS.includes(level));
						this.plugin.settings.sectionBoundaryLevels = levels.length > 0 ? levels : ALL_HEADING_LEVELS;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc("Notes under these folders (one per line) are skipped when aggregating.")
			.addTextArea((text) =>
				text.setValue(this.plugin.settings.excludedFolders.join("\n")).onChange(async (value) => {
					this.plugin.settings.excludedFolders = value
						.split("\n")
						.map((line) => line.trim())
						.filter((line) => line.length > 0);
					await this.plugin.saveSettings();
				})
			);
	}
}
