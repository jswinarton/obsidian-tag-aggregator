import { FuzzySuggestModal, type App } from "obsidian";
import { getVaultTagCounts } from "./aggregate";

export interface TagSuggestion {
	tag: string;
	count: number;
}

export class TagSuggestModal extends FuzzySuggestModal<TagSuggestion> {
	private readonly onChoose: (tag: string) => void;

	constructor(app: App, onChoose: (tag: string) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Aggregate tag...");
	}

	getItems(): TagSuggestion[] {
		const counts = getVaultTagCounts(this.app);
		return Object.entries(counts)
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => a.tag.localeCompare(b.tag));
	}

	getItemText(item: TagSuggestion): string {
		return `${item.tag} (${item.count})`;
	}

	onChooseItem(item: TagSuggestion): void {
		this.onChoose(item.tag.replace(/^#/, ""));
	}
}
