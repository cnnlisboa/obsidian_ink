import { TextFileView, TFile, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { DRAW_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { TldrawDrawingEditor, TldrawDrawingEditorWrapper } from "src/tldraw/drawing/tldraw-drawing-editor";
import { InkFileData, stringifyPageData } from "src/utils/page-file";
import { 
	Provider as JotaiProvider
} from "jotai";
import { rememberDrawingFile } from "src/utils/rememberDrawingFile";

////////
////////

export const DRAWING_VIEW_TYPE = "inkc_drawing-view";

function getExtendedOptions(plugin: InkPlugin, fileRef: TFile) {
    return [
        {
            text: 'Copy drawing',
            action: async () => {
                await rememberDrawingFile(plugin, fileRef);
            }
        },
    ]
}

////////

export function registerDrawingView (plugin: InkPlugin) {
    plugin.registerView(
        DRAWING_VIEW_TYPE,
        (leaf) => new DrawingView(leaf, plugin)
    );
    plugin.registerExtensions([DRAW_FILE_EXT], DRAWING_VIEW_TYPE);
}

export class DrawingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    pageData: InkFileData;
    focusModeActive: boolean = false;
    // Whether focus mode should be on, as the user last left it. Outlives the re-render that a
    // change to the file on disk causes, which clears (and so exits) focus mode.
    focusModeWanted: boolean = true;

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return DRAWING_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Drawing";
    }
    
    // This provides the data from the file for placing into the view (Called when file is opening)
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
            <JotaiProvider>
                <TldrawDrawingEditor
					onReady = {() => {}}
					plugin = {this.plugin}
					drawingFile = {this.file}
					save = {this.saveFile}
					extendedMenu = {getExtendedOptions(this.plugin, this.file)}
					focusMode = {this.plugin.settings.fullscreenFocusMode ? { initiallyOn: this.focusModeActive, onToggle: this.setFocusMode } : undefined}
				/>
            </JotaiProvider>
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

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that, old files can save data into new ones)
        this.root?.unmount();
        this.disableFocusMode();
    }

    // The editor is unmounted here too, not only in clear(). Closing the tab, or opening another
    // kind of file in it, unloads the view without clearing it, which used to leave the editor
    // running unseen: its timers, its listeners, and its companion-app session, which could still
    // receive pen input and save it to this file.
    onunload(): void {
        this.root?.unmount();
        this.root = null;
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

    // onResize()

    // TODO: Consider converting between drawings and writing files in future
    
    // onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string): void {
    //     menu.addItem((item) => {
    //         item.setTitle('Convert to Write file');
    //         item.setSection('action');
    //         item.onClick( () => {
    //             console.log('clicked');
    //         })
    //     })
    //     super.onPaneMenu(menu, source);
    // }

}











