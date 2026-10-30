import type { TLDefaultColorStyle, TLDefaultSizeStyle } from "@tldraw/tldraw";
import type { WritingPaper } from "src/tldraw/writing-shapes/writing-lines";
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
	// Keep an SVG copy beside each writing and drawing file. See svg-sidecar.ts.
	saveSvgSidecar: boolean,
	customAttachmentFolders: boolean,
    noteAttachmentFolderLocation: 'obsidian' | 'root' | 'note',
    notelessAttachmentFolderLocation: 'obsidian' | 'root',
	writingSubfolder: string,
	drawingSubfolder: string,
	// Writing specific
	writingEnabled: boolean,
	writingStrokeLimit: number,
	// Ruling height for NEW writing files, in page units. Stored on each file as it's created, so
	// changing this never re-rules existing writing out from under ink that's already there.
	writingLineHeight: number,
	// Paper for NEW writing files, stored on each as it's created, like the line height.
	writingPaper: WritingPaper,
	writingDynamicStrokeThickness: boolean,
	writingSmoothing: boolean,
	writingStreamline: number,
	stylusOnlyInput: boolean,
	// The pen and highlighter last picked in a writing toolbar. Shared by every writing editor,
	// so a pen chosen in one note is still in hand in the next.
	writingPenColor: TLDefaultColorStyle,
	writingPenSize: TLDefaultSizeStyle,
	writingHighlighterColor: TLDefaultColorStyle,
	// Scribbling back and forth over ink deletes it. See scratch-out.ts.
	writingScratchOut: boolean,
	// Turn handwriting into searchable text when a writing embed closes. See transcription.ts.
	transcribeWriting: boolean,
	// BCP-47 tag of the handwriting model the companion app reads with, e.g. 'en-US'.
	transcriptionLanguage: string,
	companionBridgeEnabled: boolean,
	companionBridgePort: number,
	fingerSwipeScroll: boolean,
	showScrollButtons: boolean,
	fullscreenFocusMode: boolean,
	closeNoteOnFullscreen: boolean,
	writingManualLineAdd: boolean,
	// Split a one-sheet writing longer than a page into pages when it's opened. See writing-pages.ts.
	writingAutoSplitPages: boolean,
	writingManualLineAddCount: number,
	writingLinesWhenLocked: boolean,
	writingBackgroundWhenLocked: boolean,
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
	saveSvgSidecar: false,
	customAttachmentFolders: false,
    noteAttachmentFolderLocation: 'obsidian',
	notelessAttachmentFolderLocation: 'obsidian',
	writingSubfolder: 'Ink/Writing',
	drawingSubfolder: 'Ink/Drawing',
	// Writing specific
	writingEnabled: true,
	writingStrokeLimit: 200,
	writingLineHeight: WRITING_LINE_HEIGHT,
	writingPaper: 'lines',
	writingDynamicStrokeThickness: true,
	writingSmoothing: false,
	writingStreamline: 0.1,
	stylusOnlyInput: false,
	writingPenColor: 'black',
	writingPenSize: 'm',
	writingHighlighterColor: 'yellow',
	writingScratchOut: true,
	transcribeWriting: true,
	transcriptionLanguage: 'en-US',
	companionBridgeEnabled: false,
	companionBridgePort: 8765,
	fingerSwipeScroll: false,
	showScrollButtons: true,
	fullscreenFocusMode: false,
	closeNoteOnFullscreen: false,
	writingManualLineAdd: false,
	writingAutoSplitPages: false,
	writingManualLineAddCount: 5,
	writingLinesWhenLocked: true,
	writingBackgroundWhenLocked: true,
	// Drawing specific
	drawingEnabled: true,
	drawingFrameWhenLocked: false,
	drawingBackgroundWhenLocked: false,
}
