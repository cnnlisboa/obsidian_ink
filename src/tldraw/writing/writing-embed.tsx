import "./writing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawWritingEditorWrapper } from "./tldraw-writing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { Notice, TFile } from "obsidian";
import { duplicateWritingFile, rememberDrawingFile, rememberWritingFile } from "src/utils/rememberDrawingFile";
import { isEmptyWritingFile } from "src/utils/tldraw-helpers";
import { useSelector } from "react-redux";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch } from 'react-redux';
import { WritingEmbedPreviewWrapper } from "./writing-embed-preview/writing-embed-preview";
import { openInkFile } from "src/utils/open-file";
import { WritingEmbedData } from "src/utils/embed";
import { nanoid } from "nanoid";
import classNames from "classnames";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { getInkFileData } from "src/utils/getInkFileData";
import { verbose, warn } from "src/utils/log-to-console";
import { CollapseIcon } from "src/graphics/icons/collapse-icon";
import { ExpandIcon } from "src/graphics/icons/expand-icon";
import { FullscreenIcon } from "src/graphics/icons/fullscreen-icon";
import { EmbedTitle } from "src/components/jsx-components/embed-title/embed-title";
import { EmbedHeightModal } from "src/modals/embed-height-modal/embed-height-modal";
import { copyEmbedToClipboard } from "src/utils/embed-clipboard";
import { WRITE_EMBED_KEY } from "src/constants";
import { useEmbedEditor } from "../use-embed-editor";
import { canTranscribe, describeTranscriptionError, getSearchableTranscript, readTranscript, transcribeWritingFile } from "src/logic/transcription";

///////
///////


export enum WritingEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom = atom(WritingEmbedState.preview)
export const previewActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== WritingEmbedState.editor
})
export const editorActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== WritingEmbedState.preview
})

///////

export type WritingEditorControls = {
	saveAndHalt: () => Promise<void>,
	resize: () => void,
}

export function WritingEmbed (props: {
	plugin: InkPlugin,
	writingFileRef: TFile,
	pageData: InkFileData,
	embedData?: WritingEmbedData,
	save: (pageData: InkFileData) => void,
	remove: Function,
	onCollapsedChange?: (collapsed: boolean) => void,
	onDisplayChange?: (display: { maxHeight: number | undefined, scale: number | undefined }) => void,
	onTitleChange?: (title: string) => void,
	onShowTitleChange?: (showTitle: boolean) => void,
	onTranscriptChange?: (transcript: string) => void,
	onInsertText?: (text: string) => void,
}) {
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)
	// const [embedId] = useState<string>(nanoid());
	// const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	// const dispatch = useDispatch();

	const setEmbedState = useSetAtom(embedStateAtom);
	const embedEditor = useEmbedEditor<WritingEditorControls>({
		containerElRef: embedContainerElRef,
		showEditor: () => {
			verbose('Set WritingEmbedState: loadingEditor');
			setEmbedState(WritingEmbedState.loadingEditor);
		},
		showPreview: () => {
			verbose('Set WritingEmbedState: loadingPreview');
			setEmbedState(WritingEmbedState.loadingPreview);
		},
		onClosed: () => {
			if (props.plugin.settings.transcribeWriting || transcriptPendingRef.current) {
				updateTranscript({ notify: false });
			}
		},
	});
	// Set when a transcript arrived while the editor was open, so the codeblock catches up once it
	// closes. See updateTranscript.
	const transcriptPendingRef = useRef(false);
	const transcript = props.embedData?.transcript;
	const [collapsed, setCollapsed] = useState(props.embedData?.collapsed ?? false);
	const [title, setTitle] = useState(props.writingFileRef.basename);
	const showTitle = props.embedData?.showTitle ?? false;
	const editorActive = useAtomValue(editorActiveAtom);

	function handleCollapsedChange(value: boolean) {
		setCollapsed(value);
		props.onCollapsedChange?.(value);
	}

	function handleTitleCommit(newTitle: string) {
		const trimmed = newTitle.trim() || props.writingFileRef.basename;
		setTitle(trimmed);
		props.onTitleChange?.(trimmed);
	}

	// Whenever switching between readonly and edit mode
	// React.useEffect( () => {
	// 	if(embedState === EmbedState.preview) {
	// 		fetchTranscriptIfNeeded(props.plugin, props.fileRef, curPageData.current);
	// 	}
	// }, [embedState])

	// let isActive = (embedId === activeEmbedId);
	// if(!isActive && state === 'edit'){
	// 	saveAndSwitchToPreviewMode();
	// }

	const commonExtendedOptions = [
		{
			text: 'Copy writing',
			icon: 'copy',
			section: 'inkc-file',
			action: async () => {
				await rememberWritingFile(props.plugin, props.writingFileRef);
			}
		},
		{
			text: 'Copy embed',
			icon: 'clipboard-copy',
			section: 'inkc-file',
			action: async () => {
				if (!props.embedData) return;
				// Copies the embed itself, not the file — pasting then asks whether it should point
				// at the same ink file or a copy of it. See src/utils/embed-clipboard.ts.
				await copyEmbedToClipboard(WRITE_EMBED_KEY, props.embedData);
			}
		},
		{
			text: 'Embed display',
			icon: 'unfold-vertical',
			section: 'inkc-display',
			editsNote: true,
			action: () => {
				new EmbedHeightModal({
					plugin: props.plugin,
					currentHeight: props.embedData?.maxHeight,
					currentScale: props.embedData?.scale,
					onSubmit: (display) => props.onDisplayChange?.(display),
				}).open();
			},
		},
		{
			text: showTitle ? 'Hide title' : 'Show title',
			icon: 'heading',
			section: 'inkc-display',
			editsNote: true,
			action: () => props.onShowTitleChange?.(!showTitle),
		},
		...(canTranscribe(props.plugin) ? [{
			text: 'Transcribe handwriting',
			icon: 'scan-text',
			section: 'inkc-text',
			editsNote: true,
			action: () => updateTranscript({ force: true, notify: true }),
		}] : []),
		...(transcript ? [
			// The codeblock's copy is flattened for search; these use the file's, with its line breaks.
			{
				text: 'Copy transcription',
				icon: 'clipboard-type',
				section: 'inkc-text',
				action: async () => {
					await navigator.clipboard.writeText(await readTranscript(props.plugin, props.writingFileRef) ?? transcript);
					new Notice('Ink: transcription copied');
				},
			},
			{
				text: 'Insert transcription below',
				icon: 'text-cursor-input',
				section: 'inkc-text',
				editsNote: true,
				action: async () => props.onInsertText?.(await readTranscript(props.plugin, props.writingFileRef) ?? transcript),
			},
		] : []),
		{
			text: 'Remove embed',
			icon: 'trash-2',
			section: 'inkc-danger',
			editsNote: true,
			action: () => {
				props.remove()
			},
		},
	]

	const openFullscreen = () => openInkFile(
		props.plugin,
		props.writingFileRef,
		props.plugin.settings.closeNoteOnFullscreen ? props.plugin.app.workspace.activeLeaf : null
	);

	// The preview's right-click / long-press menu leads with what its buttons and a tap do, so
	// everything an embed can do is reachable from one place.
	const previewMenuOptions = [
		{ text: 'Edit', icon: 'pencil', section: 'inkc-open', editsNote: true, action: () => embedEditor.open() },
		{ text: 'Open full screen', icon: 'maximize', section: 'inkc-open', action: openFullscreen },
		{ text: 'Collapse', icon: 'chevrons-down-up', section: 'inkc-open', editsNote: true, action: () => handleCollapsedChange(true) },
		...commonExtendedOptions,
	];

	////////////

	return <>
		<div
			ref = {embedContainerElRef}
			className = {classNames([
				'inkc_embed',
				'inkc_writing-embed',
				collapsed && 'inkc_collapsed',
			])}
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: '1em',
				paddingBottom: '0.5em',
			}}
		>
			{collapsed && (
				<div className="inkc_collapsed-bar" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
					<EmbedTitle title={title} onCommit={handleTitleCommit} />
					<div className="inkc_collapsed-bar-buttons">
						<button
							className="inkc_collapse-btn"
							onPointerDown={(e) => {
								e.stopPropagation();
								openFullscreen();
							}}
							onMouseDown={(e) => e.stopPropagation()}
							onClick={(e) => e.stopPropagation()}
							aria-label="Open fullscreen"
						>
							<FullscreenIcon />
						</button>
						<button
							className="inkc_collapse-btn"
							onPointerDown={(e) => { e.stopPropagation(); handleCollapsedChange(false); }}
							onMouseDown={(e) => e.stopPropagation()}
							onClick={(e) => e.stopPropagation()}
							aria-label="Expand embed"
						>
							<ExpandIcon />
						</button>
					</div>
				</div>
			)}

			{!collapsed && <>
				{showTitle && (
					<div
						className = {classNames([
							'inkc_embed-title',
							// Hidden rather than removed while editing, so the embed doesn't jump
							// when the toolbar takes the title's place.
							editorActive && 'inkc_hidden',
						])}
						onMouseDown = {(e) => e.stopPropagation()}
						onClick = {(e) => e.stopPropagation()}
					>
						<EmbedTitle title={title} onCommit={handleTitleCommit} />
					</div>
				)}
				{/* Include another container so that it's height isn't affected by the padding of the outer container */}
				<div
					className = {classNames([
						'inkc_resize-container',
						props.embedData?.maxHeight && 'inkc_height-capped',
					])}
					ref = {resizeContainerElRef}
					style = {{
						// The preview inside is absolutely positioned, so this has to be its
						// containing block. Without it, Live Preview resolves the preview against
						// CodeMirror's positioned .cm-content (right by accident), while reading
						// mode resolves it against the page sizer and the preview renders at full
						// page width, overflowing the note. See drawing-embed.tsx, which has
						// always set this.
						position: 'relative',
					}}
				>

					<WritingEmbedPreviewWrapper
						plugin = {props.plugin}
						scale = {props.embedData?.scale}
						onResize = {(height: number) => resizeContainer(height)}
						writingFile = {props.writingFileRef}
						onCollapseClick = {() => handleCollapsedChange(true)}
						onFullscreenClick = {openFullscreen}
						onClick = {() => embedEditor.open()}
						menuOptions = {previewMenuOptions}
					/>

					<TldrawWritingEditorWrapper
						plugin = {props.plugin} // TODO: Try and remove this
						onResize = {(height: number) => resizeContainer(height)}
						writingFile = {props.writingFileRef}
						save = {props.save}
						embedded
						saveControlsReference = {embedEditor.registerEditorControls}
						closeEditor = {embedEditor.close}
						maxHeight = {props.embedData?.maxHeight}
						scale = {props.embedData?.scale}
						onOpenClick = {async () => {
							// Saved and closed first, so the full screen editor opens on everything
							// written here and the two never edit the same file at once.
							await embedEditor.close();
							openFullscreen();
						}}
						extendedMenu = {commonExtendedOptions}
					/>

				</div>
			</>}

		</div>
	</>;
	
	// Helper functions
	///////////////////

	/**
	 * Brings the transcript up to date: the companion app reads the handwriting if it has changed
	 * (or `force` is set), and the result goes into this embed's codeblock for search to find.
	 */
	async function updateTranscript(options: { force?: boolean, notify: boolean }) {
		if (!canTranscribe(props.plugin)) {
			if (options.notify) new Notice("Ink: transcription is done by the companion app. Turn on the companion bridge in Ink's settings and run the app.");
			return;
		}
		const progress = options.notify ? new Notice('Ink: transcribing…', 0) : undefined;
		try {
			const text = await transcribeWritingFile(props.plugin, props.writingFileRef, {
				force: options.force,
				onDownloadingModel: () => new Notice('Ink: downloading the handwriting model. This happens once and can take a minute.'),
			});
			// Rewriting the codeblock rebuilds the embed, which would close an editor opened since.
			if (embedEditor.isOpen()) {
				transcriptPendingRef.current = true;
			} else {
				transcriptPendingRef.current = false;
				const searchable = getSearchableTranscript(text);
				if ((props.embedData?.transcript ?? '') !== searchable) props.onTranscriptChange?.(searchable);
			}
			progress?.hide();
			if (options.notify) {
				new Notice(text ? `Ink: transcribed “${truncate(text, 80)}”` : 'Ink: there was no handwriting to transcribe.');
			}
		} catch (e) {
			progress?.hide();
			if (options.notify) {
				new Notice(`Ink: couldn't transcribe. ${describeTranscriptionError(e)}`);
			} else {
				warn(['Transcription failed', describeTranscriptionError(e)]);
			}
		}
	}

	function resizeContainer(height: number) {
		if(!resizeContainerElRef.current) return;
		// A capped embed stops growing at its limit and scrolls instead - in preview the container
		// itself scrolls over the taller SVG, and in the editor the tldraw camera does the moving.
		const maxHeight = props.embedData?.maxHeight;
		const appliedHeight = maxHeight ? Math.min(height, maxHeight) : height;
		resizeContainerElRef.current.style.height = appliedHeight + 'px';
		setTimeout( () => {
			// Applies after slight delay so it doesn't affect the first resize
			if(!resizeContainerElRef.current) return;
			resizeContainerElRef.current.classList.add('inkc_smooth-transition');
		}, 100)
	}

};

function truncate(text: string, length: number): string {
	const oneLine = text.replace(/\s+/g, ' ');
	return oneLine.length > length ? oneLine.slice(0, length - 1) + '…' : oneLine;
}

export default WritingEmbed;
