import { Editor } from "obsidian";
import { DRAW_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { buildDrawingEmbed } from "src/utils/embed";
import { SelectInkFileModal } from "src/modals/select-ink-file-modal/select-ink-file-modal";

/////////
/////////

export const insertExistingDrawingFile = (plugin: InkPlugin, editor: Editor) => {
    new SelectInkFileModal({
        plugin,
        extension: DRAW_FILE_EXT,
        kind: 'drawing',
        onSubmit: (filepath) => {
            let embedStr = buildDrawingEmbed(filepath);
            editor.replaceRange(embedStr, editor.getCursor());
        },
    }).open();
}

export default insertExistingDrawingFile;
