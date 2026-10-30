import "./drawing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawDrawingEditor, TldrawDrawingEditorWrapper } from "./tldraw-drawing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { rememberDrawingFile } from "src/utils/rememberDrawingFile";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch, useSelector } from "react-redux";
import { DrawingEmbedPreview, DrawingEmbedPreviewWrapper } from "./drawing-embed-preview/drawing-embed-preview";
import { openInkFile } from "src/utils/open-file";
import { nanoid } from "nanoid";
import { DrawingEmbedData } from "src/utils/embed";
import classNames from "classnames";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { DRAWING_INITIAL_WIDTH, DRAWING_INITIAL_ASPECT_RATIO, DRAW_EMBED_KEY } from "src/constants";
import { copyEmbedToClipboard } from "src/utils/embed-clipboard";
import { getFullPageWidth } from "src/utils/getFullPageWidth";
import { verbose } from "src/utils/log-to-console";
import { CollapseIcon } from "src/graphics/icons/collapse-icon";
import { ExpandIcon } from "src/graphics/icons/expand-icon";
import { FullscreenIcon } from "src/graphics/icons/fullscreen-icon";
import { EmbedTitle } from "src/components/jsx-components/embed-title/embed-title";
import { useEmbedEditor } from "../use-embed-editor";
const emptyDrawingSvgStr = require('../../placeholders/empty-drawing-embed.svg');

///////
///////


export enum DrawingEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom = atom(DrawingEmbedState.preview)
export const previewActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== DrawingEmbedState.editor
})
export const editorActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== DrawingEmbedState.preview
})

///////

export type DrawingEditorControls = {
	save: () => Promise<void>,
	saveAndHalt: () => Promise<void>,
}

export function DrawingEmbed (props: {
	plugin: InkPlugin,
	drawingFileRef: TFile,
	pageData: InkFileData,
	embedData?: DrawingEmbedData,
	saveSrcFile: (pageData: InkFileData) => {},
	setEmbedProps: (width: number, height: number) => void,
	remove: Function,
	width?: number,
	aspectRatio?: number,
	onCollapsedChange?: (collapsed: boolean) => void,
	onFrameChange?: (frame: { x: number, y: number, w: number, h: number } | undefined) => void,
	onTitleChange?: (title: string) => void,
	onShowTitleChange?: (showTitle: boolean) => void,
}) {
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const embedWidthRef = useRef<number>(props.width || DRAWING_INITIAL_WIDTH);
	const embedAspectRatioRef = useRef<number>(props.aspectRatio || DRAWING_INITIAL_ASPECT_RATIO);

	const setEmbedState = useSetAtom(embedStateAtom);
	const embedEditor = useEmbedEditor<DrawingEditorControls>({
		containerElRef: embedContainerElRef,
		showEditor: () => {
			verbose('Set DrawingEmbedState: loadingEditor');
			applyEmbedHeight();
			setEmbedState(DrawingEmbedState.loadingEditor);
		},
		showPreview: () => {
			verbose('Set DrawingEmbedState: loadingPreview');
			setEmbedState(DrawingEmbedState.loadingPreview);
			props.setEmbedProps(embedWidthRef.current, embedAspectRatioRef.current);
		},
	});
	const [collapsed, setCollapsed] = useState(props.embedData?.collapsed ?? false);
	const [title, setTitle] = useState(props.drawingFileRef.basename);
	const showTitle = props.embedData?.showTitle ?? false;
	const editorActive = useAtomValue(editorActiveAtom);

	function handleCollapsedChange(value: boolean) {
		setCollapsed(value);
		props.onCollapsedChange?.(value);
	}

	function handleTitleCommit(newTitle: string) {
		const trimmed = newTitle.trim() || props.drawingFileRef.basename;
		setTitle(trimmed);
		props.onTitleChange?.(trimmed);
	}

	// On first mount
	React.useEffect( () => {
		window.addEventListener('resize', handleResize);
		handleResize();

        return () => {
			window.removeEventListener('resize', handleResize);
		}
	}, [])

	const commonExtendedOptions = [
		{
			text: 'Copy drawing',
			icon: 'copy',
			section: 'inkc-file',
			action: async () => {
				await rememberDrawingFile(props.plugin, props.drawingFileRef);
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
				await copyEmbedToClipboard(DRAW_EMBED_KEY, props.embedData);
			}
		},
		...(props.embedData?.frame ? [{
			text: 'Reset framing',
			icon: 'maximize-2',
			section: 'inkc-display',
			editsNote: true,
			action: () => {
				props.onFrameChange?.(undefined);
			},
		}] : []),
		{
			text: showTitle ? 'Hide title' : 'Show title',
			icon: 'heading',
			section: 'inkc-display',
			editsNote: true,
			action: () => props.onShowTitleChange?.(!showTitle),
		},
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

	////////////

	const openFullscreen = () => openInkFile(
		props.plugin,
		props.drawingFileRef,
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

	return <>
		<div
			ref = {embedContainerElRef}
			className = {classNames([
				'inkc_embed',
				'inkc_drawing-embed',
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
								openInkFile(
									props.plugin,
									props.drawingFileRef,
									props.plugin.settings.closeNoteOnFullscreen ? props.plugin.app.workspace.activeLeaf : null
								);
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
					className = 'inkc_resize-container'
					ref = {resizeContainerElRef}
					style = {{
						width: embedWidthRef.current + 'px',
						height: embedWidthRef.current / embedAspectRatioRef.current + 'px',
						position: 'relative', // For absolute positioning inside
						left: '50%',
						translate: '-50%',
					}}
				>

					<DrawingEmbedPreviewWrapper
						plugin = {props.plugin}
						onReady = {() => {}}
						drawingFile = {props.drawingFileRef}
						onCollapseClick = {() => handleCollapsedChange(true)}
						onFullscreenClick = {openFullscreen}
						onClick = {() => embedEditor.open()}
						menuOptions = {previewMenuOptions}
						frame = {props.embedData?.frame}
					/>

					<TldrawDrawingEditorWrapper
						onReady = {() => {}}
						plugin = {props.plugin}
						drawingFile = {props.drawingFileRef}
						save = {props.saveSrcFile}
						embedded
						saveControlsReference = {embedEditor.registerEditorControls}
						closeEditor = {embedEditor.close}
						onOpenClick = {async () => {
							// Saved and closed first, so the full screen editor opens on everything
							// drawn here and the two never edit the same file at once.
							await embedEditor.close();
							openFullscreen();
						}}
						frame = {props.embedData?.frame}
						onSaveFrame = {props.onFrameChange && ((frame) => props.onFrameChange?.(frame))}
						extendedMenu = {commonExtendedOptions}
						resizeEmbed = {resizeEmbed}
					/>

				</div>
			</>}

		</div>
	</>;

	//// Helper functions
	/////////////////////

	function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
		if(!resizeContainerElRef.current) return;
		const maxWidth = getFullPageWidth(embedContainerElRef.current)
		if(!maxWidth) return;

		let destWidth = embedWidthRef.current + pxWidthDiff;
		if(destWidth < 350) destWidth = 350;
		if(destWidth > maxWidth) destWidth = maxWidth;

		const curHeight = resizeContainerElRef.current.getBoundingClientRect().height;
		let destHeight = curHeight + pxHeightDiff;
		if(destHeight < 150) destHeight = 150;

		embedWidthRef.current = destWidth;
		embedAspectRatioRef.current = destWidth / destHeight;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		resizeContainerElRef.current.style.height = destHeight + 'px';
	}
	function applyEmbedHeight() {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
		resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
	}

	function handleResize() {
		const maxWidth = getFullPageWidth(embedContainerElRef.current);
		if (resizeContainerElRef.current) {
			resizeContainerElRef.current.style.maxWidth = maxWidth + 'px';
			const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
			resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
		}
	};
};


export default DrawingEmbed;

////////
////////

async function refreshPageData(plugin: InkPlugin, file: TFile): Promise<InkFileData> {
	const v = plugin.app.vault;
	const pageDataStr = await v.read(file);
	const pageData = JSON.parse(pageDataStr) as InkFileData;
	return pageData;
}
