import { Modal, TFile } from "obsidian";
import InkPlugin from "src/main";
import { getInkFileData } from "src/utils/getInkFileData";
import './select-ink-file-modal.scss';

const placeholderSvgs: Record<string, string> = {
	drawing: require('../../placeholders/empty-drawing-embed.svg'),
	writing: require('../../placeholders/empty-writing-embed.svg'),
};

////////
////////

/**
 * A grid file picker for existing drawing/writing files, showing each one's saved preview so the
 * right note can be found by how it looks rather than only by its (often meaningless) filename.
 */
export class SelectInkFileModal extends Modal {
	private plugin: InkPlugin;
	private extension: string;
	private kind: 'drawing' | 'writing';
	private onSubmit: (filepath: string) => void;

	private files: TFile[];
	private query: string = '';
	// Keeps a thumbnail from re-fetching (and re-flickering) every time the search filter re-renders the grid.
	private previewCache: Map<string, string | null> = new Map();

	private gridEl: HTMLDivElement;

	constructor(options: {
		plugin: InkPlugin,
		extension: string,
		kind: 'drawing' | 'writing',
		onSubmit: (filepath: string) => void,
	}) {
		super(options.plugin.app);
		this.plugin = options.plugin;
		this.extension = options.extension;
		this.kind = options.kind;
		this.onSubmit = options.onSubmit;
	}

	onOpen() {
		const { titleEl, contentEl, modalEl } = this;

		modalEl.addClass('inkc_select-ink-modal-el');
		contentEl.addClass('inkc_select-ink-modal');

		titleEl.setText(this.kind === 'drawing' ? 'Select drawing' : 'Select writing');

		this.files = this.plugin.app.vault.getFiles()
			.filter(file => file.extension === this.extension)
			.sort((a, b) => b.stat.mtime - a.stat.mtime);

		if (this.files.length > 5) {
			const searchEl = contentEl.createEl('input', {
				cls: 'inkc_select-ink-search',
				attr: { type: 'text', placeholder: `Search ${this.kind}s…` },
			});
			searchEl.addEventListener('input', () => {
				this.query = searchEl.value.toLowerCase();
				this.renderGrid();
			});
			window.setTimeout(() => searchEl.focus(), 0);
		}

		this.gridEl = contentEl.createDiv({ cls: 'inkc_select-ink-grid' });
		this.renderGrid();
	}

	onClose() {
		const { titleEl, contentEl } = this;
		titleEl.empty();
		contentEl.empty();
	}

	// Helper functions
	///////////////////

	private renderGrid() {
		this.gridEl.empty();

		const matches = this.query
			? this.files.filter(file => file.basename.toLowerCase().includes(this.query))
			: this.files;

		if (matches.length === 0) {
			this.gridEl.createDiv({
				cls: 'inkc_select-ink-empty',
				text: this.files.length === 0 ? `No ${this.kind}s yet.` : 'No matches.',
			});
			return;
		}

		for (const file of matches) {
			this.renderCard(file);
		}
	}

	private renderCard(file: TFile) {
		const card = this.gridEl.createDiv({ cls: 'inkc_select-ink-card', attr: { tabindex: '0' } });
		const choose = () => {
			this.onSubmit(file.path);
			this.close();
		};
		card.addEventListener('click', choose);
		card.addEventListener('keydown', (evt: KeyboardEvent) => {
			if (evt.key === 'Enter' || evt.key === ' ') {
				evt.preventDefault();
				choose();
			}
		});

		const thumbEl = card.createDiv({ cls: 'inkc_select-ink-thumb' });
		card.createDiv({ cls: 'inkc_select-ink-caption', text: formatFileDate(file) });

		this.renderThumbnail(thumbEl, file);
	}

	private async renderThumbnail(thumbEl: HTMLDivElement, file: TFile) {
		const cached = this.previewCache.get(file.path);
		if (cached !== undefined) {
			this.setThumbnailContent(thumbEl, cached);
			return;
		}

		this.setThumbnailContent(thumbEl, null);

		let previewUri: string | null = null;
		try {
			const inkFileData = await getInkFileData(this.plugin, file);
			previewUri = inkFileData.previewUri ?? null;
		} catch (e) {
			// A file that fails to parse still gets a slot in the grid, just with the empty-state icon.
			console.error(`Ink: couldn't read preview for ${file.path}`, e);
		}

		this.previewCache.set(file.path, previewUri);
		// The grid can have moved on (search, or the modal closing) by the time the read resolves.
		if (thumbEl.isConnected) this.setThumbnailContent(thumbEl, previewUri);
	}

	private setThumbnailContent(thumbEl: HTMLDivElement, previewUri: string | null) {
		const src = previewUri || placeholderSvgs[this.kind];

		if (src.slice(0, 4) === 'data') {
			thumbEl.empty();
			thumbEl.createEl('img', { attr: { src } });
		} else {
			// Trusted content: previews are SVGs this plugin exported from the file's own tldraw snapshot.
			thumbEl.innerHTML = src;
		}
	}
}

function formatFileDate(file: TFile): string {
	const date = new Date(file.stat.mtime);
	const datePart = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	return `${datePart} · ${timePart}`;
}

export default SelectInkFileModal;
