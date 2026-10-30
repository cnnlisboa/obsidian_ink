import { SerializedStore, TLRecord, TLUiOverrides, Editor } from "@tldraw/tldraw";
import { Menu, TFile, TextFileView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { WRITE_FILE_EXT, WRITING_VIEW_TYPE } from "src/constants";
import InkPlugin from "src/main";
import { TldrawWritingEditor } from "src/tldraw/writing/tldraw-writing-editor";
import { convertWriteFileToDraw } from "src/utils/convertWriteFileToDraw";
import { openInkFile } from "src/utils/open-file";
import { InkFileData, stringifyPageData } from "src/utils/page-file";

////////
////////

export { WRITING_VIEW_TYPE };

////////

export function registerWritingView (plugin: InkPlugin) {
    plugin.registerView(
        WRITING_VIEW_TYPE,
        (leaf) => new WritingView(leaf, plugin)
    );
    plugin.registerExtensions([WRITE_FILE_EXT], WRITING_VIEW_TYPE);
}

export class WritingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    pageData: InkFileData;
    focusModeActive: boolean = false;
    // Whether focus mode should be on, as the user last left it. Outlives the re-render that a
    // change to the file on disk causes, which clears (and so exits) focus mode.
    focusModeWanted: boolean = true;
    tldrawControls: {
        resize?: Function,
        goToPage?: (page: number) => void,
    } = {}
    // A page asked for by whatever opened this view (an embed of one page), held until the editor
    // has mounted to take it.
    pendingPage: number | undefined;

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return WRITING_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Handwritten note";
    }
    
    // This provides the data from the file for placing into the view (Called by Obsidian when file is opening)
    setViewData = (fileContents: string, clear: boolean) => {
        if(!this.file) return;

        const pageData = JSON.parse(fileContents) as InkFileData;
        this.pageData = pageData;

        const viewContent = this.containerEl.children[1];
        viewContent.setAttr('style', 'padding: 0;');

        // If a new file is opening in the same leaf, then clear the old one instead of creating a new one
        if(this.root) this.clear();
        // Applied after clearing, which turns it off. The other way round, any change to the file on
        // disk (a sync from another device) dropped out of focus mode and took its button with it.
        if(this.focusModeWanted) this.enableFocusMode();

        this.root = createRoot(viewContent);
		this.root.render(
            <TldrawWritingEditor
                plugin = {this.plugin}
                writingFile = {this.file}
                save = {this.saveFile}
                saveControlsReference = {(controls: any) => {
                    this.tldrawControls.resize = controls.resize;
                    this.tldrawControls.goToPage = controls.goToPage;
                }}
                getOpenIntent = {() => {
                    const page = this.pendingPage;
                    this.pendingPage = undefined;
                    return page !== undefined ? { page } : undefined;
                }}
                focusMode = {this.plugin.settings.fullscreenFocusMode ? { initiallyOn: this.focusModeActive, onToggle: this.setFocusMode } : undefined}
			/>
        );
    }

    saveFile = (pageData: InkFileData) => {
        this.pageData = pageData;
        this.save(false);   // Obsidian will call getViewData during this method
    }
    
    // This allows you to return the data you want Obsidian to save (Called by Obsidian when file is closing)
    getViewData = (): string => {
        return stringifyPageData(this.pageData);
    }

    // Obsidian passes on the ephemeral state a file was opened with. Usually arrives after
    // setViewData, but before the editor (which loads asynchronously) has mounted.
    setEphemeralState(state: any): void {
        super.setEphemeralState(state);
        const page = state?.inkcPage;
        if (typeof page !== 'number') return;
        if (this.tldrawControls.goToPage) this.tldrawControls.goToPage(page);
        else this.pendingPage = page;
    }

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that, old files can save data over new files)
        this.root?.unmount();
        this.tldrawControls = {};
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
        // TODO: Currently this doesn't refresh the width stored in the camera limits, so removed it for now
        // if(this.tldrawControls.resize) this.tldrawControls.resize();
    }

    // TODO: Consider converting between drawings and writing files in future

    // onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string): void {
    //     menu.addItem((item) => {
    //         item.setTitle('Convert to Drawing');
    //         item.setSection('action');
    //         item.onClick( async () => {
    //             if(!this.file) return;
    //             await convertWriteFileToDraw(this.plugin, this.file);
    //             openInkFile(this.plugin, this.file);
    //         })
    //     })
    //     super.onPaneMenu(menu, source);
    // }

}











