import "./modify-menu.scss";
import * as React from "react";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { Editor, useValue } from "@tldraw/tldraw";
import { silentlyChangeStore } from "src/utils/tldraw-helpers";
import classNames from "classnames";
import { useResolvedEditor } from "../use-resolved-editor";
import { ToolButton } from "../tool-button/tool-button";

//////////
//////////

interface ModifyMenuProps {
    getTlEditor: () => Editor | undefined,
    onStoreChange: (elEditor: Editor) => void,
}

export const ModifyMenu = React.forwardRef<HTMLDivElement, ModifyMenuProps>((props, ref) => {

    const editor = useResolvedEditor(props.getTlEditor);
    // Both are reactive in tldraw, so these re-render exactly when undo/redo availability flips —
    // not on every store change, which during a stroke is every pen sample.
    const canUndo = useValue('can undo', () => editor?.getCanUndo() ?? false, [editor]);
    const canRedo = useValue('can redo', () => editor?.getCanRedo() ?? false, [editor]);

    ///////////

    function undo() {
		const editor = props.getTlEditor();
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.undo();
		});
		props.onStoreChange(editor)
	}
	function redo() {
		const editor = props.getTlEditor();
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.redo();
		});
		props.onStoreChange(editor)

	}

    ///////////
    ///////////

    return <>
        <div
            ref = {ref}
            className = {classNames([
                'ink_menu-bar',
                'ink_menu-bar_floating'
            ])}
        >
            <div
                className='ink_modify-menu'
            >
                <ToolButton
                    label = "Undo"
                    onPress = {undo}
                    disabled = {!canUndo}
                >
                    <UndoIcon/>
                </ToolButton>
                <ToolButton
                    label = "Redo"
                    onPress = {redo}
                    disabled = {!canRedo}
                >
                    <RedoIcon/>
                </ToolButton>
            </div>
        </div>
    </>;

});

export default ModifyMenu;
