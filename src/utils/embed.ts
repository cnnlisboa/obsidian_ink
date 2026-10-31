
///////
///////

import { EditorPosition, MarkdownPostProcessorContext, MarkdownViewModeType } from "obsidian";
import { EditorView } from "@codemirror/view";
import { DRAW_EMBED_KEY, DRAWING_INITIAL_ASPECT_RATIO, DRAWING_INITIAL_HEIGHT, DRAWING_INITIAL_WIDTH, PLUGIN_VERSION, WRITE_EMBED_KEY } from "src/constants";
import InkPlugin from "src/main";

export type WritingEmbedData = {
	versionAtEmbed: string;
	link?: string;
	filepath?: string; // legacy — kept for backward compat with old embeds
	/**
	 * The handwriting as text, kept in the codeblock so Obsidian's search finds it in this note.
	 * On one line; the writing file holds it with its line breaks. See src/logic/transcription.ts.
	 */
	transcript?: string;
	collapsed?: boolean;
	title?: string;
	/**
	 * Shows the file's name above the embed while it's open, as a caption for finding your way
	 * around a long note. Collapsed embeds always show it.
	 */
	showTitle?: boolean;
	/**
	 * Caps the embed's rendered height in px, turning it into a scrollable window so a long
	 * writing takes a small, fixed slot in the note. Undefined means "grow to fit", the original
	 * behaviour. Per-embed rather than per-file because it describes this view of the writing.
	 */
	maxHeight?: number;
	/**
	 * Renders the writing smaller within the embed, so more of it fits in the same space.
	 * 1 (or undefined) is full size. Combines with maxHeight: scaling shows more of the writing
	 * inside the capped window, rather than cropping more of it away.
	 */
	scale?: number;
	/**
	 * Shows only this page of a paged writing, counted from 1, so one writing can be embedded a
	 * page at a time across different notes. Undefined shows the whole writing, a page at a time,
	 * opening on the page last used. See src/logic/writing-pages.ts.
	 */
	page?: number;
};


// Primary functions
///////

export const buildWritingEmbed = (filepath: string, transcript?: string) => {
	const basename = filepath.split('/').pop() ?? filepath;
	let embedContent: WritingEmbedData = {
		versionAtEmbed: PLUGIN_VERSION,
		link: `[[${basename}]]`,
		// transcript,
	}

	let embedStr = "";
    embedStr += "\n```" + WRITE_EMBED_KEY;
    embedStr += "\n" + formatEmbedJson(embedContent as Record<string, unknown>);
    embedStr += "\n```";
	
	// Adds a blank line at the end so it's easy to place the cursor after
    embedStr += "\n";

	return embedStr;
};

//////////
//////////

export type DrawingEmbedData = {
	versionAtEmbed: string;
	link?: string;
	filepath?: string; // legacy — kept for backward compat with old embeds
	width?: number,
	aspectRatio?: number,
	collapsed?: boolean,
	title?: string,
	/**
	 * Shows the file's name above the embed while it's open, as a caption for finding your way
	 * around a long note. Collapsed embeds always show it.
	 */
	showTitle?: boolean,
	/**
	 * Which part of the drawing this embed shows, in page coordinates. Undefined means "fit the
	 * whole drawing", the original behaviour. Per-embed so one drawing can appear several times,
	 * framed differently in each.
	 */
	frame?: { x: number, y: number, w: number, h: number },
};

export const buildDrawingEmbed = (filepath: string) => {
	const basename = filepath.split('/').pop() ?? filepath;
	let embedContent: DrawingEmbedData = {
		versionAtEmbed: PLUGIN_VERSION,
		link: `[[${basename}]]`,
		width: DRAWING_INITIAL_WIDTH,
		aspectRatio: DRAWING_INITIAL_ASPECT_RATIO,
	}

	let embedStr = "";
    embedStr += "\n```" + DRAW_EMBED_KEY;
    embedStr += "\n" + formatEmbedJson(embedContent as Record<string, unknown>);
    embedStr += "\n```";

	// Adds a blank line at the end so it's easy to place the cursor after
    embedStr += "\n";

	return embedStr;
};

/**
 * Resolves a TFile from embed data, supporting both new `link` (wikilink) and legacy `filepath` formats.
 */
export function resolveInkFileFromEmbed(
	plugin: InkPlugin,
	embedData: { link?: string; filepath?: string },
	sourcePath: string
): import('obsidian').TFile | null {
	if (embedData.link) {
		const linktext = embedData.link.replace(/^\[\[|\]\]$/g, '');
		return plugin.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath) as import('obsidian').TFile | null;
	}
	if (embedData.filepath) {
		return plugin.app.vault.getAbstractFileByPath(embedData.filepath) as import('obsidian').TFile | null;
	}
	return null;
}

/**
 * When an ink file is renamed, scans all markdown files and updates the [[wikilink]] inside embed code blocks.
 */
export async function updateInkEmbedLinksInVault(plugin: InkPlugin, newPath: string, oldPath: string) {
	const oldBasename = oldPath.split('/').pop();
	const newBasename = newPath.split('/').pop();
	if (!oldBasename || !newBasename || oldBasename === newBasename) return;

	const oldLink = `[[${oldBasename}]]`;
	const newLink = `[[${newBasename}]]`;

	const markdownFiles = plugin.app.vault.getMarkdownFiles();
	for (const mdFile of markdownFiles) {
		const content = await plugin.app.vault.read(mdFile);
		if (!content.includes(oldLink)) continue;
		await plugin.app.vault.modify(mdFile, content.split(oldLink).join(newLink));
	}
}

/** Produces a compact single-line JSON string with spaces after : and , for readability. */
export function formatEmbedJson(obj: Record<string, unknown>): string {
	const pairs = Object.entries(obj)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => `"${k}": ${JSON.stringify(v)}`);
	return '{' + pairs.join(', ') + '}';
}

export function stringifyEmbedData(embedData: DrawingEmbedData): string {
	return formatEmbedJson(embedData as Record<string, unknown>);
}
export const rebuildDrawingEmbed = (embedData: DrawingEmbedData) => {
	let embedStr = "";
    embedStr += "\n```" + DRAW_EMBED_KEY;
    embedStr += "\n" + stringifyEmbedData(embedData);
    embedStr += "\n```";
	return embedStr;
};

/**
 * Updates the JSON content of a writing embed code block without changing its boundaries.
 */
export function updateWritingEmbedData(plugin: InkPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement, embedData: WritingEmbedData) {
	const cmEditor = getEditorForEmbedSource(plugin, ctx);
	if(!cmEditor) return;

	const sectionInfo = ctx.getSectionInfo(el);
	if(sectionInfo?.lineStart === undefined || sectionInfo.lineEnd === undefined) return;

	// Replace only the JSON content lines (between the opening ``` and closing ```)
	const editorStart: EditorPosition = {
		line: sectionInfo.lineStart + 1,
		ch: 0,
	}
	const editorEnd: EditorPosition = {
		line: sectionInfo.lineEnd,
		ch: 0,
	}

	cmEditor.replaceRange(formatEmbedJson(embedData as Record<string, unknown>) + '\n', editorStart, editorEnd);
}

/**
 * Inserts `text` as its own paragraph straight after the embed's code block.
 */
export function insertTextAfterEmbed(plugin: InkPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement, text: string) {
	const cmEditor = getEditorForEmbedSource(plugin, ctx);
	if(!cmEditor) return;

	const sectionInfo = ctx.getSectionInfo(el);
	if(sectionInfo?.lineEnd === undefined) return;

	// After the closing fence, separated by a blank line so it reads as a paragraph of its own.
	const fenceEnd: EditorPosition = {
		line: sectionInfo.lineEnd,
		ch: cmEditor.getLine(sectionInfo.lineEnd).length,
	}
	cmEditor.replaceRange('\n\n' + text, fenceEnd);
}

/**
 * The editor for the note this embed lives in, or null when there isn't one to write through.
 *
 * `workspace.activeEditor` is whichever note the user is currently editing - not necessarily
 * the note being rendered. An embed can be rendered from a note that isn't active: in a split
 * pane, in a hover preview, or in reading mode while a different note holds the editor. Writing
 * a codeblock update through the active editor in those cases edits the wrong file, so the
 * source path has to match before anything is written.
 */
export function getEditorForEmbedSource(plugin: InkPlugin, ctx: MarkdownPostProcessorContext) {
	const activeEditor = plugin.app.workspace.activeEditor;
	if(!activeEditor?.editor) return null;
	if(activeEditor.file?.path !== ctx.sourcePath) return null;
	return activeEditor.editor;
}

/**
 * Whether this embed was rendered into reading mode rather than Live Preview.
 * Reading mode has none of the `.cm-*` scaffolding, so every ancestor lookup and every
 * stylesheet rule scoped to CodeMirror silently does nothing there.
 */
export function isInReadingMode(el: HTMLElement): boolean {
	return !el.closest('.cm-embed-block') && !!el.closest('.markdown-preview-view');
}

// This function came from Notion like tables code
export const getViewMode = (el: HTMLElement): MarkdownViewModeType | null => {
	const parent = el.parentElement;
	if (parent) {
		return parent.className.includes("cm-preview-code-block")
			? "source"
			: "preview";
	}
	return null;
};

export function applyCommonAncestorStyling(embedEl: HTMLElement, filetype: 'writing' | 'drawing') {
	// Reading mode renders the block into `.markdown-preview-sizer`, the reading column, with none
	// of Live Preview's scaffolding - so it's marked for its own rules in plugin-polish.scss, and
	// its margins are those of the reading view rather than CodeMirror's scroller.
	if(isInReadingMode(embedEl)) {
		const readingBlockEl = (embedEl.closest('[class*="block-language-"]') ?? embedEl) as HTMLElement;
		readingBlockEl.classList.add('inkc_embed-block', `inkc_${filetype}-embed-block`, 'inkc_reading-embed-block');
		recordScrollerMargins(readingBlockEl);
		return;
	}

	const parentEmbedBlockEl = embedEl.closest('.cm-embed-block') as HTMLElement;
	if(!parentEmbedBlockEl) return;

	parentEmbedBlockEl.classList.add('inkc_embed-block', `inkc_${filetype}-embed-block`);
	recordScrollerMargins(parentEmbedBlockEl);
}

/**
 * Measures every embed block's margins again. Whether a note's column fills its pane changes
 * with the pane's width: a phone or tablet turned on its side, a sidebar opened.
 */
export function recordAllScrollerMargins() {
	document.querySelectorAll<HTMLElement>('.inkc_embed-block').forEach(recordScrollerMargins);
}

/**
 * Lets an embed block reach out into the margins that hold a note's text in from the pane's edges.
 * The distance to each edge is recorded on the block as --inkc-bleed-start and --inkc-bleed-end,
 * and the stylesheet decides how much of it to take (see --inkc-bleed-margin-* in
 * writing-embed.scss), so how far an embed goes follows Readable Line Length and the writing
 * embed style as they change.
 */
function recordScrollerMargins(blockEl: HTMLElement) {
	const reading = blockEl.classList.contains('inkc_reading-embed-block');
	const scrollerEl = blockEl.closest(reading ? '.markdown-preview-view' : '.cm-scroller');
	const columnEl = blockEl.closest(reading ? '.markdown-preview-sizer' : '.cm-sizer');
	// What the block sits in, which its own margins don't move, so this can be measured again.
	const contentEl = blockEl.parentElement;
	// An embed block without a note scroller around it (a note embedded in another, a hover
	// preview) has no padding to negate.
	if(!scrollerEl || !columnEl || !contentEl) return;
	const scrollerRect = scrollerEl.getBoundingClientRect();
	// A note in a background tab isn't laid out, so there's nothing to measure. Switching to it
	// fires the workspace's resize, which measures it then. See registerWritingEmbedStyle.
	if(!scrollerRect.width) return;
	const scrollerStyle = window.getComputedStyle(scrollerEl);

	const startMarginValue = parseFloat(scrollerStyle.paddingInlineStart) || 0;
	const endMarginValue = parseFloat(scrollerStyle.paddingInlineEnd) || 0;

	// Verify the column's offset from the scroller closely matches the scroller padding.
	// In the default theme, and with Readable Line Length on in a pane no wider than the column
	// (a phone), the column starts at the padding edge, so the embed can go out to the scroller edge.
	// Readable Line Length in a wider pane, and themes like Minimal, use .cm-sizer width constraints
	// + auto margins to center content, so the column's offset from the scroller is much larger than
	// the padding. In that case, applying a negative margin would push the embed off-screen to the left.
	// The column is measured rather than the embed because line numbers sit in the column, beside
	// the text: the embed starts past them, and goes out over them.
	const columnRect = columnEl.getBoundingClientRect();
	const contentRect = contentEl.getBoundingClientRect();

	// Only negate padding if the column's offset closely matches the scroller padding
	// (tolerance of 20px to account for sub-pixel rounding and minor theme adjustments)
	const fillsStart = startMarginValue > 0 && Math.abs(columnRect.left - scrollerRect.left - startMarginValue) < 20;
	const fillsEnd = endMarginValue > 0 && Math.abs(scrollerRect.right - columnRect.right - endMarginValue) < 20;

	setBleed(blockEl, 'start', fillsStart ? contentRect.left - scrollerRect.left : undefined);
	setBleed(blockEl, 'end', fillsEnd ? scrollerRect.right - contentRect.right : undefined);

	// The stylesheet holds embeds to their column's width, which turned negative margins into
	// shifting the embed sideways rather than widening it.
	if(fillsStart || fillsEnd) {
		blockEl.style.setProperty('max-width', 'none', 'important');
	} else {
		blockEl.style.removeProperty('max-width');
	}
}

function setBleed(blockEl: HTMLElement, side: 'start' | 'end', distancePx: number | undefined) {
	if(distancePx === undefined) {
		blockEl.style.removeProperty(`--inkc-bleed-${side}`);
		blockEl.style.removeProperty(`margin-inline-${side}`);
		return;
	}
	blockEl.style.setProperty(`--inkc-bleed-${side}`, `${Math.round(distancePx)}px`);
	blockEl.style.setProperty(`margin-inline-${side}`, `var(--inkc-bleed-margin-${side}, 0px)`, 'important');
}

/**
 * Tells the note's editor that an embed in it has changed height. CodeMirror notices an embed
 * growing but not shrinking: everything below keeps its old position, so line numbers sit beside
 * the wrong lines and taps there land on the wrong line until the next edit.
 */
export function remeasureNoteAroundEmbed(el: HTMLElement) {
	const editorEl = el.closest('.cm-editor') as HTMLElement | null;
	const view = editorEl && EditorView.findFromDOM(editorEl);
	if(!view) return;
	// Not public API: makes the measure read heights again rather than keep the ones it has. If
	// CodeMirror drops it, this is an ordinary measure.
	const viewState = (view as any).viewState;
	if(viewState && 'mustMeasureContent' in viewState) viewState.mustMeasureContent = true;
	view.requestMeasure();
}

/**
 * Removes an element from a markdown in the active editor.
 * Pass in the context and el used when creating the embed.
 * @param plugin 
 * @param ctx 
 * @param el 
 * @returns 
 */
export function removeEmbed(plugin: InkPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement) {
	const cmEditor = getEditorForEmbedSource(plugin, ctx);
	if(!cmEditor) return;

	const sectionInfo = ctx.getSectionInfo(el);

	if(sectionInfo?.lineStart === undefined || sectionInfo.lineEnd === undefined) return;

	const editorStart: EditorPosition = {
		line: sectionInfo.lineStart,
		ch: 0,
	}
	const editorEnd: EditorPosition = {
		line: sectionInfo.lineEnd + 1,
		ch: 0,
	}

	cmEditor.replaceRange( '', editorStart, editorEnd );

	// NOTE: The page scroll position can jump significantly off when an embed is removed.
	// This puts it back where the user expects.
	cmEditor.setCursor(editorStart);
}