import { TFile, TextFileView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { NOTEBOOK_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { TldrawNotebookEditor } from "src/tldraw/notebook/tldraw-notebook-editor";
import { InkFileData, stringifyPageData } from "src/utils/page-file";

////////
////////

export const NOTEBOOK_VIEW_TYPE = "inkc_notebook-view";

////////

export function registerNotebookView (plugin: InkPlugin) {
    plugin.registerView(
        NOTEBOOK_VIEW_TYPE,
        (leaf) => new NotebookView(leaf, plugin)
    );
    plugin.registerExtensions([NOTEBOOK_FILE_EXT], NOTEBOOK_VIEW_TYPE);
}

export class NotebookView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    pageData: InkFileData;
    focusModeActive: boolean = false;
    // Whether focus mode should be on, as the user last left it. Outlives the re-render that a
    // change to the file on disk causes, which clears (and so exits) focus mode.
    focusModeWanted: boolean = true;
    tldrawControls: {
        resize?: Function,
    } = {}

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return NOTEBOOK_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Notebook";
    }

    setViewData = (fileContents: string, clear: boolean) => {
        if(!this.file) return;

        const pageData = JSON.parse(fileContents) as InkFileData;
        this.pageData = pageData;

        const viewContent = this.containerEl.children[1];
        viewContent.setAttr('style', 'padding: 0;');

        if(this.root) this.clear();
        // Applied after clearing, which turns it off. The other way round, any change to the file on
        // disk (a sync from another device) dropped out of focus mode and took its button with it.
        if(this.focusModeWanted) this.enableFocusMode();

        this.root = createRoot(viewContent);
		this.root.render(
            <TldrawNotebookEditor
                plugin = {this.plugin}
                notebookFile = {this.file}
                save = {this.saveFile}
                saveControlsReference = {(controls: any) => {
                    this.tldrawControls.resize = controls.resize;
                }}
                focusMode = {this.plugin.settings.fullscreenFocusMode ? { initiallyOn: this.focusModeActive, onToggle: this.setFocusMode } : undefined}
			/>
        );
    }

    saveFile = (pageData: InkFileData) => {
        this.pageData = pageData;
        this.save(false);
    }

    getViewData = (): string => {
        return stringifyPageData(this.pageData);
    }

    clear = (): void => {
        this.root?.unmount();
        this.disableFocusMode();
    }

    onunload(): void {
        this.disableFocusMode();
    }

    setFocusMode = (on: boolean) => {
        this.focusModeWanted = on;
        if(on) this.enableFocusMode();
        else this.disableFocusMode();
    }

    enableFocusMode(): void {
        if(this.plugin.settings.fullscreenFocusMode && !this.focusModeActive) {
            this.focusModeActive = true;
            document.body.classList.add('inkc_focus-mode');
        }
    }

    disableFocusMode(): void {
        if(this.focusModeActive) {
            this.focusModeActive = false;
            document.body.classList.remove('inkc_focus-mode');
        }
    }

    onResize = () => {
    }

}
