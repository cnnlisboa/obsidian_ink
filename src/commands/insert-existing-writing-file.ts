import { Editor } from "obsidian";
import { WRITE_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { buildWritingEmbed } from "src/utils/embed";
import { SelectInkFileModal } from "src/modals/select-ink-file-modal/select-ink-file-modal";

////////
////////

export const insertExistingWritingFile = (plugin: InkPlugin, editor: Editor) => {
    new SelectInkFileModal({
        plugin,
        extension: WRITE_FILE_EXT,
        kind: 'writing',
        onSubmit: (filepath) => {
            let embedStr = buildWritingEmbed(filepath);
            editor.replaceRange(embedStr, editor.getCursor());
        },
    }).open();
}

export default insertExistingWritingFile;
