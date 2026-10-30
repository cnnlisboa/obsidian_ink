import { TLEditorSnapshot } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

///////
///////

type Metadata = {
	pluginVersion: string;
	tldrawVersion: string;
	previewIsOutdated?: boolean;
	/**
	 * In a paged writing, the pages whose previews are behind their ink, so the next full save
	 * only redraws those. See src/logic/writing-pages.ts.
	 */
	outdatedPages?: number[];
	/** The handwriting as text. See src/logic/transcription.ts. */
	transcript?: string;
	/** Fingerprint of the ink `transcript` was read from, so unchanged writing isn't read again. */
	transcriptOf?: string;
	/** In a paged writing, each page's handwriting as text, which `transcript` joins. */
	pageTranscripts?: string[];
	/** The fingerprint each of `pageTranscripts` was read from, so only changed pages are reread. */
	pageTranscriptsOf?: string[];
	/** Page-coordinate bounds the preview SVG covers. See src/utils/svg-framing.ts. */
	previewBounds?: { x: number, y: number, w: number, h: number };
};

export type InkFileData = {
	meta: Metadata;
	tldraw: TLEditorSnapshot;
	previewUri?: string;
	pagePreviewUris?: string[];
};

/**
 * The rendered-preview parts of a file. Saves that skip regenerating the preview — the frequent
 * incremental ones, and every mid-session save on e-ink — carry the last one forward with
 * `previewIsOutdated` set, rather than writing the file with no preview at all. A file without
 * one shows as an empty embed, in reading mode and on any synced device, until the editor is
 * next opened and locked.
 */
export type InkPreview = {
	previewUri?: string,
	pagePreviewUris?: string[],
	previewBounds?: { x: number, y: number, w: number, h: number },
};

export const getInkPreview = (pageData: InkFileData): InkPreview => ({
	previewUri: pageData.previewUri,
	pagePreviewUris: pageData.pagePreviewUris,
	previewBounds: pageData.meta?.previewBounds,
});

// Primary functions
///////

export const buildWritingFileData = (props: {
	tlEditorSnapshot: TLEditorSnapshot,
	previewIsOutdated?: boolean;
	outdatedPages?: number[];
	transcript?: string;
	transcriptOf?: string;
	previewUri?: string,
	pagePreviewUris?: string[],
}): InkFileData => {

	return buildFileData(props);
}

export const buildDrawingFileData = (props: {
	tlEditorSnapshot: TLEditorSnapshot,
	previewIsOutdated?: boolean;
	previewUri?: string,
	previewBounds?: { x: number, y: number, w: number, h: number },
}): InkFileData => {

	return buildFileData(props);
}

const buildFileData = (props: {
	tlEditorSnapshot: TLEditorSnapshot,
	previewIsOutdated?: boolean;
	outdatedPages?: number[];
	transcript?: string;
	transcriptOf?: string;
	previewUri?: string,
	pagePreviewUris?: string[],
	previewBounds?: { x: number, y: number, w: number, h: number },
}): InkFileData => {

	const {
		tlEditorSnapshot: tlEditorSnapshot,
		previewUri,
		previewIsOutdated = false,
		outdatedPages,
		pagePreviewUris,
		previewBounds,
		transcript,
		transcriptOf,
	} = props;

	let pageData: InkFileData = {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
		},
		tldraw: tlEditorSnapshot,
	}

	if(previewIsOutdated) pageData.meta.previewIsOutdated = previewIsOutdated;
	if(previewIsOutdated && outdatedPages?.length) pageData.meta.outdatedPages = outdatedPages;
	if(previewBounds) pageData.meta.previewBounds = previewBounds;
	if(transcript !== undefined) pageData.meta.transcript = transcript;
	if(transcriptOf !== undefined) pageData.meta.transcriptOf = transcriptOf;
	if(previewUri) pageData.previewUri = previewUri;
	if(pagePreviewUris) pageData.pagePreviewUris = pagePreviewUris;

	return pageData;
};

export const stringifyPageData = (pageData: InkFileData): string => {
	return JSON.stringify(pageData, null, '\t');
}