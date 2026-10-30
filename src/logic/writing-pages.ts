import { Atom, Box, Editor, TLEditorSnapshot, TLShape, TLShapeId, atom } from "@tldraw/tldraw";
import { TFile } from "obsidian";
import { WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH, WRITING_VIEW_TYPE } from "src/constants";
import type InkPlugin from "src/main";
import type { WritingLines } from "src/tldraw/writing-shapes/writing-lines";
import { InkFileData, InkPreview, stringifyPageData } from "src/utils/page-file";
import { applyFrameToSvg } from "src/utils/svg-framing";
import { getWritingContainerShape, getWritingLinesId, getWritingLinesShape, isInkShapeType, silentlyChangeStore } from "src/utils/tldraw-helpers";
import { isEmbedEditorOpenOn } from "./open-embed";

//////////
//////////

// Pages in a writing file. A paged writing is still one continuous sheet, the same as any other,
// with page breaks at fixed intervals down it. Strokes are never moved to make pages, so a sheet
// can be split into pages at any time and every feature that works on a sheet — saving, the
// stroke stash, scratch-out, transcription, the companion bridge — works on pages unchanged.
//
// Each page is shown on its own: the editor keeps only the page in view on the canvas and bounds
// its camera to it, and previews are stored per page. Page numbers never change once given out,
// since embeds of a single page refer to them by number, so pages are only added at the end.
//
// Stored on the writing-lines shape, which has no prop validators, so a copy of the plugin from
// before pages simply ignores them and shows the whole sheet.

/** How a paged writing's sheet is divided. One-sheet writings don't have one. */
export type PageLayout = {
	pageHeight: number,
	pageCount: number,
};

/** A page's top and bottom edges on the sheet, in page coordinates. */
export type PageBand = {
	top: number,
	bottom: number,
};

/** What an editor showing a paged writing reports to whatever holds it. */
export type WritingPagesState = {
	layout: PageLayout,
	/** The page in view. */
	page: number,
};

/** Where an editor opens and what it does first, for opens that aren't just "carry on". */
export type WritingOpenIntent = {
	page?: number,
	addPage?: boolean,
	removeLastPage?: boolean,
};

/**
 * A4's proportions across the writing's width, rounded down to whole lines so every page has the
 * same ruling and its last line isn't cut short. 23 lines at a 120 ruling, 18 at the older 150.
 */
export function getA4PageHeight(lineHeight: number): number {
	const lines = Math.max(2, Math.floor(WRITING_PAGE_WIDTH * Math.SQRT2 / lineHeight));
	return lines * lineHeight;
}

export function getPageLayout(linesProps: WritingLines['props'] | undefined): PageLayout | undefined {
	if (!linesProps?.pageHeight || !linesProps.pageCount) return undefined;
	return { pageHeight: linesProps.pageHeight, pageCount: linesProps.pageCount };
}

export function getEditorPageLayout(editor: Editor): PageLayout | undefined {
	return getPageLayout(getWritingLinesShape(editor)?.props);
}

function getSnapshotLinesProps(snapshot: TLEditorSnapshot | undefined): WritingLines['props'] | undefined {
	const store = snapshot?.document?.store as Record<string, any> | undefined;
	return store?.[getWritingLinesId()]?.props;
}

/** The page layout of a writing file's saved data, without loading it into an editor. */
export function getSnapshotPageLayout(snapshot: TLEditorSnapshot | undefined): PageLayout | undefined {
	return getPageLayout(getSnapshotLinesProps(snapshot));
}

/** The page last shown in a full view of the writing (its embed, or full screen). */
export function getSnapshotLastPage(snapshot: TLEditorSnapshot | undefined): number {
	const layout = getSnapshotPageLayout(snapshot);
	return layout ? clampPage(layout, getSnapshotLinesProps(snapshot)?.lastPage ?? 0) : 0;
}

export function getPageBand(layout: PageLayout, page: number): PageBand {
	return { top: page * layout.pageHeight, bottom: (page + 1) * layout.pageHeight };
}

export function clampPage(layout: PageLayout, page: number): number {
	return Math.max(0, Math.min(layout.pageCount - 1, Math.round(page)));
}

/**
 * The page a stroke belongs to: the one its pen touched down on. A descender or a long tail that
 * hangs over a page's edge stays with the page it was written on, rather than leaving marks on the
 * next one.
 */
export function getStrokePage(layout: PageLayout, shape: { x: number, y: number, rotation?: number, props: any }): number {
	const first = shape.props?.segments?.[0]?.points?.[0] ?? { x: 0, y: 0 };
	const rotation = shape.rotation ?? 0;
	const y = shape.y + first.x * Math.sin(rotation) + first.y * Math.cos(rotation);
	return Math.max(0, Math.min(layout.pageCount - 1, Math.floor(y / layout.pageHeight)));
}

//////////
//////////

// The page in view in each editor. Not part of the document: two editors can show different pages
// of the same file. The paper shape draws only this page's ruling, so it's a signal it can track.
const displayedPages = new WeakMap<Editor, Atom<number | undefined>>();

function getDisplayedPageAtom(editor: Editor): Atom<number | undefined> {
	let pageAtom = displayedPages.get(editor);
	if (!pageAtom) {
		pageAtom = atom<number | undefined>('displayed writing page', undefined);
		displayedPages.set(editor, pageAtom);
	}
	return pageAtom;
}

/** The page in view, or undefined when the writing isn't paged. */
export function getDisplayedPage(editor: Editor): number | undefined {
	const page = getDisplayedPageAtom(editor).get();
	const layout = getEditorPageLayout(editor);
	if (page === undefined || !layout) return undefined;
	return clampPage(layout, page);
}

export function setDisplayedPage(editor: Editor, page: number | undefined) {
	getDisplayedPageAtom(editor).set(page);
}

/** The band of the page in view, or undefined when the whole sheet is in view. */
export function getDisplayedPageBand(editor: Editor): PageBand | undefined {
	const layout = getEditorPageLayout(editor);
	const page = getDisplayedPage(editor);
	if (!layout || page === undefined) return undefined;
	return getPageBand(layout, page);
}

//////////
//////////

function setTemplateProps(editor: Editor, props: Partial<WritingLines['props']>, height?: number) {
	const lines = getWritingLinesShape(editor);
	const container = getWritingContainerShape(editor);
	if (!lines) return;
	// Straight into the store, as unlockShape does, because both shapes are locked.
	silentlyChangeStore(editor, () => {
		editor.store.update(lines.id, (record: any) => ({
			...record,
			props: { ...record.props, ...props, ...(height !== undefined ? { h: height } : {}) },
		}));
		if (container && height !== undefined) {
			editor.store.update(container.id, (record: any) => ({ ...record, props: { ...record.props, h: height } }));
		}
	});
}

/**
 * Splits a one-sheet writing into A4 pages, enough to hold everything written so far. Nothing on
 * the page moves. Returns the new layout, or the existing one if it was already paged.
 */
export function splitIntoPages(editor: Editor, contentBottom: number): PageLayout {
	const existing = getEditorPageLayout(editor);
	if (existing) return existing;

	const lineHeight = getWritingLinesShape(editor)?.props.lineHeight || WRITING_LINE_HEIGHT;
	const pageHeight = getA4PageHeight(lineHeight);
	const pageCount = Math.max(1, Math.ceil(contentBottom / pageHeight));
	setTemplateProps(editor, { pageHeight, pageCount, lastPage: pageCount - 1 }, pageCount * pageHeight);
	return { pageHeight, pageCount };
}

/** Adds a blank page at the end. Returns its index. */
export function appendPage(editor: Editor): number {
	const layout = getEditorPageLayout(editor);
	if (!layout) return 0;
	const pageCount = layout.pageCount + 1;
	setTemplateProps(editor, { pageCount }, pageCount * layout.pageHeight);
	return pageCount - 1;
}

/** Removes the last page. The caller checks it's empty first; strokes on it would be orphaned. */
export function removeLastPage(editor: Editor) {
	const layout = getEditorPageLayout(editor);
	if (!layout || layout.pageCount <= 1) return;
	const pageCount = layout.pageCount - 1;
	const lastPage = Math.min(getWritingLinesShape(editor)?.props.lastPage ?? 0, pageCount - 1);
	setTemplateProps(editor, { pageCount, lastPage }, pageCount * layout.pageHeight);
}

/** Records the page shown in a full view of the writing, so it opens there next time. */
export function setLastPage(editor: Editor, page: number) {
	if (getWritingLinesShape(editor)?.props.lastPage === page) return;
	setTemplateProps(editor, { lastPage: page });
}

//////////
//////////

// The paper shape draws all of a sheet's ruling, but a page's preview should only carry that
// page's. getSvgString gives toSvg no way to know the area being exported, so it's set here for
// the length of each export, and exports are run one at a time so they can't see each other's.
let exportBand: PageBand | undefined;
let exportQueue: Promise<unknown> = Promise.resolve();

/** The page being exported, if a page export is running. Read by the paper shape's toSvg. */
export function getExportBand(): PageBand | undefined {
	return exportBand;
}

/**
 * One page's preview SVG: its ruling and the strokes that belong to it, cropped to the page. The
 * page's strokes have to be on the canvas (not stashed) to be drawn.
 */
export function getWritingPageSvg(editor: Editor, layout: PageLayout, page: number): Promise<string | undefined> {
	const band = getPageBand(layout, page);
	const ids: TLShapeId[] = [getWritingLinesId()];
	for (const shape of editor.getCurrentPageShapes() as TLShape[]) {
		if (isInkShapeType(shape.type) && getStrokePage(layout, shape) === page) ids.push(shape.id);
	}

	const run = exportQueue.then(async () => {
		exportBand = band;
		try {
			const result = await editor.getSvgString(ids, {
				bounds: new Box(0, band.top, WRITING_PAGE_WIDTH, layout.pageHeight),
				padding: 0,
			});
			return result?.svg;
		} finally {
			exportBand = undefined;
		}
	});
	exportQueue = run.catch(() => undefined);
	return run;
}

/**
 * The whole sheet as one SVG, built by stacking the page previews rather than exporting the sheet
 * again, which on a long writing is the slowest thing the editor does. Kept as the file's main
 * preview for everything that reads one: the SVG copy beside the file, and copies of the plugin
 * from before pages, which show the whole sheet.
 */
export function assembleSheetSvg(layout: PageLayout, pageSvgs: (string | undefined)[]): string {
	const height = layout.pageCount * layout.pageHeight;
	const pages = pageSvgs.map((svg, page) => {
		if (!svg) return '';
		// Each page keeps its own viewBox; x/y/width/height place that box on the sheet.
		const top = page * layout.pageHeight;
		return svg.replace(/<svg\b[^>]*>/, (rootTag) => rootTag
			.replace(/\s(?:x|y|width|height)\s*=\s*"[^"]*"/g, '')
			.replace(/^<svg/, `<svg x="0" y="${top}" width="${WRITING_PAGE_WIDTH}" height="${layout.pageHeight}"`));
	}).join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" direction="ltr" width="${WRITING_PAGE_WIDTH}" height="${height}" viewBox="0 0 ${WRITING_PAGE_WIDTH} ${height}" stroke-linecap="round" stroke-linejoin="round" style="background-color: transparent;">${pages}</svg>`;
}

//////////
//////////

/**
 * The preview of one page: its own, or failing that (a file split into pages but not yet saved
 * since, or last saved by a copy of the plugin from before pages) the sheet's, cropped to it.
 */
export function getPagePreviewSvg(preview: InkPreview, layout: PageLayout, page: number): string | undefined {
	const own = preview.pagePreviewUris?.[page];
	if (own) return own;
	if (!preview.previewUri) return undefined;
	const band = getPageBand(layout, page);
	return applyFrameToSvg(preview.previewUri, { x: 0, y: band.top, w: WRITING_PAGE_WIDTH, h: layout.pageHeight }, preview.previewBounds);
}

/** Whether `file` is open in an editor, as an embed or full screen. */
function isOpenInEditor(plugin: InkPlugin, file: TFile): boolean {
	if (isEmbedEditorOpenOn(file.path)) return true;
	return plugin.app.workspace.getLeavesOfType(WRITING_VIEW_TYPE).some((leaf) => (leaf.view as any).file === file);
}

/**
 * Records the page last turned to in an embed's preview, so the writing opens there next time.
 * Skipped while it's open in an editor, which records its own page as it saves and would otherwise
 * write over this, or be reloaded by it.
 */
export async function saveLastPage(plugin: InkPlugin, file: TFile, page: number) {
	if (isOpenInEditor(plugin, file)) return;
	await plugin.app.vault.process(file, (data) => {
		let pageData: InkFileData;
		try {
			pageData = JSON.parse(data);
		} catch {
			return data;
		}
		const lines = (pageData.tldraw?.document?.store as Record<string, any> | undefined)?.[getWritingLinesId()];
		if (!lines?.props?.pageCount || lines.props.lastPage === page) return data;
		lines.props.lastPage = page;
		return stringifyPageData(pageData);
	});
}
