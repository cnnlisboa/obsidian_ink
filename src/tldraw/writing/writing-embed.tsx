import "./writing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawWritingEditorWrapper } from "./tldraw-writing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
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
import { atom, useSetAtom } from "jotai";
import { getInkFileData } from "src/utils/getInkFileData";
import { verbose } from "src/utils/log-to-console";
import { CollapseIcon } from "src/graphics/icons/collapse-icon";
import { ExpandIcon } from "src/graphics/icons/expand-icon";
import { FullscreenIcon } from "src/graphics/icons/fullscreen-icon";
import { hasCoarsePointer } from "src/utils/device-classes";
import { EmbedHeightModal } from "src/modals/embed-height-modal/embed-height-modal";
import { copyEmbedToClipboard } from "src/utils/embed-clipboard";
import { WRITE_EMBED_KEY } from "src/constants";
import { useEmbedEditor } from "../use-embed-editor";

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
	});
	const [collapsed, setCollapsed] = useState(props.embedData?.collapsed ?? false);
	const [title, setTitle] = useState(props.writingFileRef.basename);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const titleInputRef = useRef<HTMLInputElement>(null);

	function handleCollapsedChange(value: boolean) {
		setCollapsed(value);
		props.onCollapsedChange?.(value);
	}

	function handleTitleCommit(newTitle: string) {
		const trimmed = newTitle.trim() || props.writingFileRef.basename;
		setTitle(trimmed);
		setIsEditingTitle(false);
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
			section: 'inkc-file',
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
			text: 'Remove embed',
			icon: 'trash-2',
			section: 'inkc-danger',
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
		{ text: 'Edit', icon: 'pencil', section: 'inkc-open', action: () => embedEditor.open() },
		{ text: 'Open full screen', icon: 'maximize', section: 'inkc-open', action: openFullscreen },
		{ text: 'Collapse', icon: 'chevrons-down-up', section: 'inkc-open', action: () => handleCollapsedChange(true) },
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
					{isEditingTitle ? (
						<input
							ref={titleInputRef}
							className="inkc_collapsed-title-input"
							defaultValue={title}
							autoFocus
							onBlur={(e) => handleTitleCommit(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleTitleCommit((e.target as HTMLInputElement).value);
								if (e.key === 'Escape') setIsEditingTitle(false);
							}}
							onPointerDown={(e) => e.stopPropagation()}
						/>
					) : (
						<span
							className="inkc_collapsed-label"
							onDoubleClick={(e) => {
								e.stopPropagation();
								setIsEditingTitle(true);
							}}
							// A double-click is impractical with a stylus, so a single tap
							// starts the rename on touch and e-ink devices.
							onClick={(e) => {
								e.stopPropagation();
								if (hasCoarsePointer()) setIsEditingTitle(true);
							}}
							title={hasCoarsePointer() ? 'Tap to rename' : 'Double-click to rename'}
						>
							{title}
						</span>
					)}
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

export default WritingEmbed;
