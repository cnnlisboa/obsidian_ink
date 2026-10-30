import InkPlugin from "src/main";
import { buildWritingFileData, stringifyPageData } from "src/utils/page-file";
import { buildNewWritingSnapshot } from "src/defaults/default-tleditor-writing-snapshot";
import { getNewTimestampedWritingFilepath } from "src/utils/file-manipulation";
import { createFoldersForFilepath } from "src/utils/createFoldersForFilepath";
import { TFile } from "obsidian";

////////
////////

const createNewWritingFile = async (plugin: InkPlugin, instigatingFile?: TFile | null, basenameOverride?: string) => {
    const filepath = await getNewTimestampedWritingFilepath(plugin, instigatingFile, basenameOverride);
    const pageData = buildWritingFileData({
        tlEditorSnapshot: buildNewWritingSnapshot({
            lineHeight: plugin.settings.writingLineHeight,
            paper: plugin.settings.writingPaper,
        }),
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, stringifyPageData(pageData));
    return fileRef;
}


export default createNewWritingFile;