import { TFile, WorkspaceLeaf } from "obsidian";
import InkPlugin from "src/main";

////////
////////

/** Opens an ink file full screen, at `options.page` if it's a paged writing. */
export async function openInkFile(plugin: InkPlugin, fileRef: TFile, closeSourceLeaf?: WorkspaceLeaf | null, options: { page?: number } = {}) {
    const leafToClose = closeSourceLeaf ?? null;
    await openInActiveView(plugin, fileRef, options);

    if (leafToClose) {
        // Only close if the writing file opened in a different leaf
        const newActiveLeaf = plugin.app.workspace.activeLeaf;
        if (newActiveLeaf !== leafToClose) {
            leafToClose.detach();
        }
    }
}

export async function openInActiveView(plugin: InkPlugin, fileRef: TFile, options: { page?: number } = {}) {
    let { workspace }  = plugin.app;
	let leaf = workspace.getLeaf();
    // The page goes as ephemeral state, which the writing view takes up. See WritingView.
    await leaf.openFile(fileRef, options.page !== undefined ? { eState: { inkcPage: options.page } } : undefined);
}

// NOTE: Future possible additions

// async function activateTabView(plugin: InkPlugin) {
//     let { workspace }  = plugin.app;
	
//     let leaf: WorkspaceLeaf | null = null;
// 	let leaves = workspace.getLeavesOfType(WRITING_VIEW_TYPE);

//     // This code finds if it alread existing in a tab and uses that first.
// 	// if (leaves.length > 0) {
// 	// 	// A leaf with our view already exists, use that
// 	// 	leaf = leaves[0];
// 	// } else {
// 		// Our view could not be found in the workspace
// 		leaf = workspace.getLeaf(true);
// 		await leaf.setViewState({ type: WRITING_VIEW_TYPE, active: true });
// 	// }

//     workspace.revealLeaf(leaf);
// }

// async function activateSplitView(plugin: InkPlugin, direction: 'horizontal' | 'vertical') {
//     let { workspace }  = plugin.app;
    
//     let leaf: null | WorkspaceLeaf;
//     direction == 'vertical' ?   leaf = workspace.getLeaf('split', 'vertical') : 
//                                 leaf = workspace.getLeaf('split', 'horizontal');

//     await leaf.setViewState({ type: WRITING_VIEW_TYPE, active: true });
//     workspace.revealLeaf(leaf);
// }
