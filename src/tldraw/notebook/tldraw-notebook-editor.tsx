import './tldraw-notebook-editor.scss';
import { Box, DefaultDashStyle, DrawShapeUtil, Editor, HistoryEntry, StoreSnapshot, TLStoreSnapshot, TLRecord, TLShapeId, TLStore, TLUiOverrides, TLUnknownShape, Tldraw, getSnapshot, TLSerializedStore, TldrawOptions, TldrawEditor, defaultTools, SelectTool, defaultShapeTools, defaultShapeUtils, defaultBindingUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawSelectionBackground, TldrawHandles, TLEditorSnapshot } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, deleteObsoleteWritingTemplateShapes, focusChildTldrawEditor, getActivityType, getWritingContainerBounds, getWritingSvg, hideWritingContainer, hideWritingLines, hideWritingTemplate, initWritingCamera, initWritingCameraLimits, lockShape, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateInvitingly, addWritingLines, restrictWritingCamera, silentlyChangeStore, unhideWritingContainer, unhideWritingLines, unhideWritingTemplate, unlockShape, updateWritingStoreIfNeeded, useStash } from "../../utils/tldraw-helpers";
import { WritingContainer, WritingContainerUtil } from "../writing-shapes/writing-container"
import { WritingMenu } from "../writing-menu/writing-menu";
import { InkSelectTool } from "../ink-select-tool";
import { eraseScratchOuts } from "../scratch-out";
import InkPlugin from "../../main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_LONG_DELAY_MS_EREADER, WRITE_SHORT_DELAY_MS, NOTEBOOK_LINE_HEIGHT, NOTEBOOK_PAGE_WIDTH } from 'src/constants';
import { InkFileData, InkPreview, buildWritingFileData, getInkPreview } from 'src/utils/page-file';
import { TFile } from 'obsidian';
import { PrimaryMenuBar } from '../primary-menu-bar/primary-menu-bar';
import ExtendedWritingMenu from '../extended-writing-menu/extended-writing-menu';
import classNames from 'classnames';
import { WritingLines, WritingLinesUtil } from '../writing-shapes/writing-lines';
import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import {getAssetUrlsByImport} from '@tldraw/assets/imports';
import { NotebookEmbedState, notebookEmbedStateAtom, notebookEditorActiveAtom } from './notebook-embed';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { getInkFileData } from 'src/utils/getInkFileData';
import { verbose, warn } from 'src/utils/log-to-console';
import { isEreader } from 'src/utils/isEreader';
import { EreaderDrawShapeUtil, setEreaderStreamline } from '../ereader-draw-shape-util';
import { SecondaryMenuBar } from '../secondary-menu-bar/secondary-menu-bar';
import ModifyMenu from '../modify-menu/modify-menu';
import { PageNavigation } from '../page-navigation/page-navigation';
import { FocusModeButton, FocusModeControls } from '../focus-mode-button/focus-mode-button';
import { createWritingPage, deleteWritingPage, detectPageOverflow, getCurrentPageIndex, getPageCount, navigateToPage } from 'src/utils/writing-pages';

///////
///////

interface TldrawNotebookEditorProps {
	onResize?: Function,
	plugin: InkPlugin,
	notebookFile: TFile,
	save: (inkFileData: InkFileData) => void,
	extendedMenu?: any[],
	onOpenClick?: () => void,
	initialPage?: number,

	// For embeds
	embedded?: boolean,
	resizeEmbedContainer?: (pxHeight: number) => void,
	closeEditor?: Function,
	saveControlsReference?: Function,
	onPageChange?: (pageIndex: number) => void,

	// For fullscreen focus mode
	focusMode?: FocusModeControls,
}

// Wraps the component so that it can full unmount when inactive
export const TldrawNotebookEditorWrapper: React.FC<TldrawNotebookEditorProps> = (props) => {
    const editorActive = useAtomValue(notebookEditorActiveAtom);

    if(editorActive) {
        return <TldrawNotebookEditor {...props} />
    } else {
        return <></>
    }
}

const myOverrides: TLUiOverrides = {}
const tlOptions: Partial<TldrawOptions> = {
	defaultSvgPadding: 0,
}
// Module-level so it's the same array on every render. <TldrawEditor> rebuilds its editor whenever
// `tools` changes identity, which used to happen on every re-render here — throwing away undo
// history and re-running onMount each time, e.g. whenever the finger-writing toggle was pressed.
// The select tool is swapped for one that lassos instead of drawing a rectangle. See InkSelectTool.
const tlTools = [...defaultTools.filter(tool => tool !== SelectTool), InkSelectTool, ...defaultShapeTools];

function getShapeUtils(useEreaderRenderer: boolean) {
	const baseUtils = useEreaderRenderer
		? [...defaultShapeUtils.filter(u => u !== DrawShapeUtil), EreaderDrawShapeUtil]
		: [...defaultShapeUtils];
	return [...baseUtils, WritingContainerUtil, WritingLinesUtil];
}

export function TldrawNotebookEditor(props: TldrawNotebookEditorProps) {

	const useEreaderRenderer = !props.plugin.settings.writingDynamicStrokeThickness || isEreader();
	const shapeUtils = React.useMemo(() => getShapeUtils(useEreaderRenderer), [useEreaderRenderer]);

	const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>()
	const setEmbedState = useSetAtom(notebookEmbedStateAtom);
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const { stashStaleContent, unstashStaleContent } = useStash(props.plugin);
	const cameraLimitsRef = useRef<WritingCameraLimits>();
	// The last preview generated for this file, carried forward by saves that don't regenerate it.
	// See InkPreview.
	const lastPreviewRef = useRef<InkPreview>({});
	// True from the moment a stroke schedules a save until one is written. See the onMount teardown.
	const savePendingRef = useRef<boolean>(false);
	const [preventTransitions, setPreventTransitions] = React.useState<boolean>(true);

	const linesPerPage = props.plugin.settings.notebookLinesPerPage;
	const pageHeight = linesPerPage * NOTEBOOK_LINE_HEIGHT;

	const initialStylusOnly = props.plugin.settings.stylusOnlyInput || isEreader();
	const stylusOnlyRef = useRef<boolean>(initialStylusOnly);
	const [stylusOnly, setStylusOnly] = React.useState<boolean>(initialStylusOnly);

	const toggleStylusOnly = () => {
		const next = !stylusOnlyRef.current;
		stylusOnlyRef.current = next;
		setStylusOnly(next);
	};

	// On mount
	React.useEffect( ()=> {
		verbose('NOTEBOOK EDITOR mounted');
		fetchFileData();
		return () => {
			verbose('NOTEBOOK EDITOR unmounting');
		}
	}, [])

	if(!tlEditorSnapshot) return <></>
	verbose('NOTEBOOK EDITOR snapshot loaded')

	////////

	const defaultComponents = {
		Scribble: TldrawScribble,
		ShapeIndicators: TldrawShapeIndicators,
		CollaboratorScribble: TldrawScribble,
		SelectionForeground: TldrawSelectionForeground,
		SelectionBackground: TldrawSelectionBackground,
		Handles: TldrawHandles,
	}

	const handleMount = (_editor: Editor) => {
		const editor = tlEditorRef.current = _editor;
		setEmbedState(NotebookEmbedState.editor);
		focusChildTldrawEditor(editorWrapperRefEl.current);

		// Navigate to persisted page if specified
		if (props.initialPage !== undefined && props.initialPage > 0) {
			const pageCount = getPageCount(editor);
			if (props.initialPage < pageCount) {
				navigateToPage(editor, props.initialPage, props.embedded ? 0 : MENUBAR_HEIGHT_PX);
			}
		}

		const ereader = isEreader();
		const fingerSwipeScroll = props.plugin.settings.fingerSwipeScroll;
		// Pass a getter so the event listeners can check the live value when toggled at runtime
		preventTldrawCanvasesCausingObsidianGestures(editor, { stylusOnly: () => stylusOnlyRef.current, fingerSwipeScroll });

		setEreaderStreamline(props.plugin.settings.writingStreamline);

		const useSimpleStrokes = !props.plugin.settings.writingDynamicStrokeThickness || ereader;
		if (useSimpleStrokes) {
			editor.setStyleForNextShapes(DefaultDashStyle, 'solid');
		}

		if (ereader && editorWrapperRefEl.current) {
			editorWrapperRefEl.current.classList.add('inkc_ereader-mode');
		}

		resizeContainerIfEmbed(tlEditorRef.current);

		// Notebook pages don't need updateWritingStoreIfNeeded — shapes are created per-page
		adaptTldrawToObsidianThemeMode(editor);
		resizeContainerIfEmbed(editor);

		// Camera setup
		if(props.embedded) {
			initWritingCamera(editor);
			editor.setCameraOptions({
				isLocked: true,
			})
		} else {
			initWritingCamera(editor, MENUBAR_HEIGHT_PX);
			cameraLimitsRef.current = initWritingCameraLimits(editor);
		}

		if(editorWrapperRefEl.current) {
			editorWrapperRefEl.current.style.opacity = '1';
		}

		// Re-init camera after layout settles
		requestAnimationFrame(() => {
			if(props.embedded) {
				initWritingCamera(editor);
				editor.setCameraOptions({ isLocked: true });
			} else {
				initWritingCamera(editor, MENUBAR_HEIGHT_PX);
				cameraLimitsRef.current = initWritingCameraLimits(editor);
			}
		});

		const removeUserActionListener = editor.store.listen((entry) => {
			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					break;

				case Activity.CameraMovedAutomatically:
				case Activity.CameraMovedManually:
					if(cameraLimitsRef.current) restrictWritingCamera(editor, cameraLimitsRef.current);
					unstashStaleContent(editor);
					break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimers();
					stashStaleContent(editor);
					break;

				case Activity.DrawingContinued:
					resetInputPostProcessTimers();
					break;

				case Activity.DrawingCompleted:
					if (props.plugin.settings.writingScratchOut) eraseScratchOuts(editor, entry);
					queueOrRunStorePostProcesses(editor);
					// Auto-create next page on overflow
					if (detectPageOverflow(editor, pageHeight)) {
						const pageCount = getPageCount(editor);
						createWritingPage(editor, pageCount, linesPerPage);
						navigateToPage(editor, pageCount, props.embedded ? 0 : MENUBAR_HEIGHT_PX);
					}
					break;

				case Activity.DrawingErased:
					queueOrRunStorePostProcesses(editor);
					break;

				default:
					verbose('Activity not recognised.');
					verbose(['entry', entry], {freeze: true});
			}

		}, {
			source: 'user',
			scope: 'all'
		})

		const unmountActions = () => {
			resetInputPostProcessTimers();
			removeUserActionListener();
		}

		if(props.saveControlsReference) {
			props.saveControlsReference({
				saveAndHalt: async (): Promise<void> => {
					await completeSave(editor, /* forceSvg */ true);
					unmountActions();
				},
				resize: () => {
					const camera = editor.getCamera()
					const cameraY = camera.y;
					initWritingCamera(editor);
					editor.setCamera({x: camera.x, y: cameraY})
				}
			})
		}

		return () => {
			// An embed's save is bound to its own file, so a stroke still waiting on the short save
			// timer is written now rather than dropped — this is what runs when the note is switched
			// away from with the editor still open. A view's save follows whichever file it shows
			// next, so there it's still dropped, as unmountActions has always done.
			if (props.embedded && savePendingRef.current) {
				incrementalSave(editor).catch((e) => warn(['Could not save on close', e]));
			}
			unmountActions();
		};
	}

	///////////////

	function resizeContainerIfEmbed (editor: Editor) {
		if (!props.embedded || !props.onResize) return;

		const embedBounds = editor.getViewportScreenBounds();
		const contentBounds = getWritingContainerBounds(editor);

		if (contentBounds) {
			const contentRatio = contentBounds.w / contentBounds.h;
			const newEmbedHeight = embedBounds.w / contentRatio;
			props.onResize(newEmbedHeight);

			requestAnimationFrame(() => {
				initWritingCamera(editor);
				editor.setCameraOptions({ isLocked: true });
			});
		}

	}

	const queueOrRunStorePostProcesses = (editor: Editor) => {
		instantInputPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}

	const instantInputPostProcess = (editor: Editor) => {
		// Notebook pages have fixed height — no template resizing needed
		resizeContainerIfEmbed(editor);
	};

	const smallDelayInputPostProcess = (editor: Editor) => {
		resetShortPostProcessTimer();
		savePendingRef.current = true;
		shortDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				incrementalSave(editor);
			},
			WRITE_SHORT_DELAY_MS
		)
	};

	const longDelayInputPostProcess = (editor: Editor) => {
		resetLongPostProcessTimer();
		longDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				completeSave(editor);
			},
			isEreader() ? WRITE_LONG_DELAY_MS_EREADER : WRITE_LONG_DELAY_MS
		)
	};

	const resetShortPostProcessTimer = () => {
		clearTimeout(shortDelayPostProcessTimeoutRef.current);
	}
	const resetLongPostProcessTimer = () => {
		clearTimeout(longDelayPostProcessTimeoutRef.current);
	}
	const resetInputPostProcessTimers = () => {
		resetShortPostProcessTimer();
		resetLongPostProcessTimer();
	}

	// Every save goes through here, so the teardown flush knows whether one is still owed.
	const saveFileData = (pageData: InkFileData) => {
		savePendingRef.current = false;
		props.save(pageData);
	}

	const incrementalSave = async (editor: Editor) => {
		verbose('notebook incrementalSave');
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		stashStaleContent(editor);

		const pageData = buildWritingFileData({
			tlEditorSnapshot: tlEditorSnapshot,
			previewUri: lastPreviewRef.current.previewUri,
			pagePreviewUris: lastPreviewRef.current.pagePreviewUris,
			previewIsOutdated: true,
		})
		saveFileData(pageData);
	}

	const completeSave = async (editor: Editor, forceSvg: boolean = false): Promise<void> => {
		verbose('notebook completeSave');

		// On e-readers during active writing, skip preview generation. A notebook renders
		// one SVG per page and page-switches between each, so it's the heaviest thing this
		// editor does — and the previews are only read back when the file is shown as an
		// embed, never while the user is writing. saveAndHalt passes forceSvg so the
		// closing snapshot still gets its previews.
		if (isEreader() && !forceSvg) {
			unstashStaleContent(editor);
			const snapshot = getSnapshot(editor.store);
			stashStaleContent(editor);
			saveFileData(buildWritingFileData({
				tlEditorSnapshot: snapshot,
				previewUri: lastPreviewRef.current.previewUri,
				pagePreviewUris: lastPreviewRef.current.pagePreviewUris,
				previewIsOutdated: true,
			}));
			return;
		}

		unstashStaleContent(editor);

		const currentPageId = editor.getCurrentPageId();
		const pages = editor.getPages();
		const pagePreviewUris: string[] = [];

		// Generate preview for each page
		for (let i = 0; i < pages.length; i++) {
			silentlyChangeStore(editor, () => {
				editor.setCurrentPage(pages[i].id);
			});
			const svgObj = await getWritingSvg(editor);
			pagePreviewUris.push(svgObj?.svg ?? '');
		}

		// Restore current page
		silentlyChangeStore(editor, () => {
			editor.setCurrentPage(currentPageId);
		});

		const tlEditorSnapshot = getSnapshot(editor.store);
		stashStaleContent(editor);

		// Use first page as the main preview for backwards compat
		const previewUri = pagePreviewUris[0] || undefined;
		const savedPagePreviewUris = pagePreviewUris.length > 1 ? pagePreviewUris : undefined;
		lastPreviewRef.current = { previewUri, pagePreviewUris: savedPagePreviewUris };

		const pageData = buildWritingFileData({
			tlEditorSnapshot,
			previewUri,
			pagePreviewUris: savedPagePreviewUris,
		});
		saveFileData(pageData);

		return;
	}

	const getTlEditor = (): Editor | undefined => {
		return tlEditorRef.current;
	};

	//////////////

	return <>
		<div
			ref = {editorWrapperRefEl}
			className = {classNames([
				"inkc_notebook-editor",
			])}
			style={{
				height: '100%',
				position: 'relative',
				opacity: 0,
			}}
		>
			<TldrawEditor
				options = {tlOptions}
				shapeUtils = {shapeUtils}
				tools = {tlTools}
				initialState = "draw"
				snapshot = {tlEditorSnapshot}

				components = {defaultComponents}

				onMount = {handleMount}

				autoFocus = {false}
			/>

			<PrimaryMenuBar>
				<WritingMenu
					plugin = {props.plugin}
					getTlEditor = {getTlEditor}
					stylusOnly = {stylusOnly}
					onToggleStylusOnly = {toggleStylusOnly}
				/>
				{props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu
						onLockClick = { async () => {
							if(props.closeEditor) props.closeEditor();
						}}
						onOpenClick = {props.onOpenClick}
						menuOptions = {[
							...(props.extendedMenu || []),
							{
								text: 'Delete page',
								action: () => {
									const editor = tlEditorRef.current;
									if (!editor) return;
									const pageCount = getPageCount(editor);
									if (pageCount <= 1) return;
									const currentIndex = getCurrentPageIndex(editor);
									deleteWritingPage(editor, currentIndex, props.embedded ? 0 : MENUBAR_HEIGHT_PX);
									queueOrRunStorePostProcesses(editor);
									props.onPageChange?.(getCurrentPageIndex(editor));
								},
							},
						]}
					/>
				)}
				{!props.embedded && props.focusMode && <FocusModeButton {...props.focusMode} />}
			</PrimaryMenuBar>

			<SecondaryMenuBar>
				<ModifyMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				/>
				<PageNavigation
					getTlEditor = {getTlEditor}
					linesPerPage = {linesPerPage}
					topMarginPx = {props.embedded ? 0 : MENUBAR_HEIGHT_PX}
					onPageChange = {(pageIndex: number) => {
						const editor = tlEditorRef.current;
						if (editor) {
							unstashStaleContent(editor);
							resizeContainerIfEmbed(editor);
						}
						props.onPageChange?.(pageIndex);
					}}
				/>
			</SecondaryMenuBar>

		</div>
	</>;


	// Helper functions
	///////////////////

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.plugin, props.notebookFile)
        lastPreviewRef.current = getInkPreview(inkFileData);
        if(inkFileData.tldraw) {
            const snapshot = prepareWritingSnapshot(inkFileData.tldraw as TLEditorSnapshot);
            setTlEditorSnapshot(snapshot);
        }
    }

};
