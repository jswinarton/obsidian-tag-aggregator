import { ItemView, MarkdownRenderer, Notice, TFile, type WorkspaceLeaf } from "obsidian";
import type { AggregatedResult } from "./aggregate";
import { VIEW_TYPE_AGGREGATOR, type MatchCategory } from "./constants";

const CATEGORY_LABELS: Record<MatchCategory, string> = {
	frontmatter: "Page",
	heading: "Heading",
	inline: "Inline",
};

export interface AggregatorViewOptions {
	dividerStyle: "hr" | "card";
}

const DEFAULT_VIEW_OPTIONS: AggregatorViewOptions = { dividerStyle: "hr" };

// Results taller than this get collapsed behind a "Show more" toggle rather than
// truncated by character count, since content is rendered markdown (headings, lists,
// embeds) where cutting mid-element would leave broken HTML.
const COLLAPSE_HEIGHT_PX = 480;

export class AggregatorView extends ItemView {
	private tag: string;
	private results: AggregatedResult[] = [];
	private loading = true;
	private viewOptions: AggregatorViewOptions = DEFAULT_VIEW_OPTIONS;

	constructor(leaf: WorkspaceLeaf, initialTag = "") {
		super(leaf);
		this.navigation = false;
		// Set before any lifecycle method runs so the pane header's one-time
		// getDisplayText() read (there's no public "refresh pane header" API,
		// unlike the tab strip) captures the real tag instead of an empty string.
		this.tag = initialTag;
	}

	getViewType(): string {
		return VIEW_TYPE_AGGREGATOR;
	}

	getDisplayText(): string {
		if (this.loading) return `#${this.tag}`;
		return `#${this.tag} (${this.results.length} results)`;
	}

	getIcon(): string {
		return "tags";
	}

	setLoading(tag: string): void {
		this.tag = tag;
		this.loading = true;
		this.results = [];
		this.renderContent();
		this.refreshHeader();
	}

	setResults(tag: string, results: AggregatedResult[], viewOptions?: AggregatorViewOptions): void {
		this.tag = tag;
		this.loading = false;
		this.results = results;
		if (viewOptions) this.viewOptions = viewOptions;
		this.renderContent();
		this.refreshHeader();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/**
	 * Re-applies the leaf's own view state to itself, purely through the public
	 * setViewState/getViewState API, so Obsidian re-reads getDisplayText() for the tab
	 * header. There is no dedicated public "refresh title" method.
	 */
	private refreshHeader(): void {
		void this.leaf.setViewState(this.leaf.getViewState());
	}

	private renderContent(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("tag-aggregator-view");

		if (this.loading) {
			container.createDiv({ cls: "tag-aggregator-loading", text: `Aggregating #${this.tag}…` });
			return;
		}

		if (this.results.length === 0) {
			container.createDiv({ cls: "tag-aggregator-empty", text: `No results found for #${this.tag}.` });
			return;
		}

		this.results.forEach((result, index) => {
			this.renderResult(container, result, index < this.results.length - 1);
		});
	}

	private renderResult(container: HTMLElement, result: AggregatedResult, showDivider: boolean): void {
		const card = container.createDiv({
			cls: `tag-aggregator-result tag-aggregator-result-${this.viewOptions.dividerStyle}`,
		});

		const header = card.createDiv({ cls: "tag-aggregator-result-header" });

		const sourceLink = header.createEl("a", {
			cls: "tag-aggregator-source-link",
			text: result.fileBasename,
			href: "#",
		});
		sourceLink.addEventListener("click", (evt) => {
			evt.preventDefault();
			void this.openSource(result);
		});

		header.createSpan({
			cls: `tag-aggregator-badge tag-aggregator-badge-${result.category}`,
			text: CATEGORY_LABELS[result.category],
		});

		if (result.headingText) {
			header.createSpan({ cls: "tag-aggregator-heading-context", text: result.headingText });
		}

		const body = card.createDiv({ cls: "tag-aggregator-result-body" });
		void MarkdownRenderer.render(this.app, result.content, body, result.filePath, this).then(() => {
			this.setupTruncation(card, body);
		});

		if (showDivider && this.viewOptions.dividerStyle === "hr") {
			container.createEl("hr", { cls: "tag-aggregator-divider" });
		}
	}

	/** Collapses the body behind a fade + toggle button if the rendered content overflows COLLAPSE_HEIGHT_PX. */
	private setupTruncation(card: HTMLElement, body: HTMLElement): void {
		if (body.scrollHeight <= COLLAPSE_HEIGHT_PX) return;

		body.addClass("is-collapsed");
		const button = card.createEl("button", {
			cls: "tag-aggregator-expand-btn",
			text: "Show more",
		});
		button.addEventListener("click", () => {
			body.toggleClass("is-collapsed", !body.hasClass("is-collapsed"));
			button.setText(body.hasClass("is-collapsed") ? "Show more" : "Show less");
		});
	}

	private async openSource(result: AggregatedResult): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(result.filePath);
		if (!(file instanceof TFile)) {
			new Notice("Source note no longer exists.");
			return;
		}
		const linktext = result.headingText ? `${result.filePath}#${result.headingText}` : result.filePath;
		try {
			await this.app.workspace.openLinkText(linktext, "", false);
		} catch {
			new Notice("Could not open source note.");
		}
	}
}
