import type { TLDefaultColorStyle, TLDefaultSizeStyle } from "@tldraw/tldraw";
import { WRITING_LINE_HEIGHT } from "src/constants";
////////
////////

export interface PluginSettings {
	// Helpers
    onboardingTips: {
		welcomeTipRead: boolean,
		strokeLimitTipRead: boolean,
		lastVersionTipRead: string,
	},
	// General
	createCompanionNote: boolean,
	nameFilesAfterNote: boolean,
	// Save and close an open embed editor when tapping anywhere outside it.
	closeEditorOnTapOutside: boolean,
	customAttachmentFolders: boolean,
    noteAttachmentFolderLocation: 'obsidian' | 'root' | 'note',
    notelessAttachmentFolderLocation: 'obsidian' | 'root',
	writingSubfolder: string,
	drawingSubfolder: string,
	notebookSubfolder: string,
	// Writing specific
	writingEnabled: boolean,
	writingStrokeLimit: number,
	// Ruling height for NEW writing files, in page units. Stored on each file as it's created, so
	// changing this never re-rules existing writing out from under ink that's already there.
	writingLineHeight: number,
	writingDynamicStrokeThickness: boolean,
	writingSmoothing: boolean,
	writingStreamline: number,
	stylusOnlyInput: boolean,
	// The pen and highlighter last picked in a writing toolbar. Shared by every writing and
	// notebook editor, so a pen chosen in one note is still in hand in the next.
	writingPenColor: TLDefaultColorStyle,
	writingPenSize: TLDefaultSizeStyle,
	writingHighlighterColor: TLDefaultColorStyle,
	companionBridgeEnabled: boolean,
	companionBridgePort: number,
	fingerSwipeScroll: boolean,
	showScrollButtons: boolean,
	fullscreenFocusMode: boolean,
	closeNoteOnFullscreen: boolean,
	writingManualLineAdd: boolean,
	writingManualLineAddCount: number,
	writingLinesWhenLocked: boolean,
	writingBackgroundWhenLocked: boolean,
	// Notebook specific
	notebookEnabled: boolean,
	notebookLinesPerPage: number,
	notebookStrokeLimit: number,
	notebookLinesWhenLocked: boolean,
	notebookBackgroundWhenLocked: boolean,
	// Drawing specific
	drawingEnabled: boolean,
	drawingFrameWhenLocked: boolean,
	drawingBackgroundWhenLocked: boolean,
}

export const DEFAULT_SETTINGS: PluginSettings = {
	// Helpers
    onboardingTips: {
		welcomeTipRead: false,
		strokeLimitTipRead: false,
		lastVersionTipRead: '',
	},
	// General
	createCompanionNote: true,
	nameFilesAfterNote: true,
	closeEditorOnTapOutside: true,
	customAttachmentFolders: false,
    noteAttachmentFolderLocation: 'obsidian',
	notelessAttachmentFolderLocation: 'obsidian',
	writingSubfolder: 'Ink/Writing',
	drawingSubfolder: 'Ink/Drawing',
	notebookSubfolder: 'Ink/Notebook',
	// Writing specific
	writingEnabled: true,
	writingStrokeLimit: 200,
	writingLineHeight: WRITING_LINE_HEIGHT,
	writingDynamicStrokeThickness: true,
	writingSmoothing: false,
	writingStreamline: 0.1,
	stylusOnlyInput: false,
	writingPenColor: 'black',
	writingPenSize: 'm',
	writingHighlighterColor: 'yellow',
	companionBridgeEnabled: false,
	companionBridgePort: 8765,
	fingerSwipeScroll: false,
	showScrollButtons: true,
	fullscreenFocusMode: false,
	closeNoteOnFullscreen: false,
	writingManualLineAdd: false,
	writingManualLineAddCount: 5,
	writingLinesWhenLocked: true,
	writingBackgroundWhenLocked: true,
	// Notebook specific
	notebookEnabled: true,
	notebookLinesPerPage: 10,
	notebookStrokeLimit: 200,
	notebookLinesWhenLocked: true,
	notebookBackgroundWhenLocked: true,
	// Drawing specific
	drawingEnabled: true,
	drawingFrameWhenLocked: false,
	drawingBackgroundWhenLocked: false,
}
