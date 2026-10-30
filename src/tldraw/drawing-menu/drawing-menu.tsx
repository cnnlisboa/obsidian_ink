import "./drawing-menu.scss";
import * as React from "react";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { Editor, useValue } from "@tldraw/tldraw";
import { DrawIcon } from "src/graphics/icons/draw-icon";
import { HandIcon } from "src/graphics/icons/hand-icon";
import { TouchIcon } from "src/graphics/icons/touch-icon";
import classNames from "classnames";
import { useResolvedEditor } from "../use-resolved-editor";
import { ToolButton } from "../tool-button/tool-button";

//////////
//////////

interface DrawingMenuProps {
    getTlEditor: () => Editor | undefined,
    embedded?: boolean,
    stylusOnly: boolean,
    onToggleStylusOnly: () => void,
}

export const DrawingMenu = React.forwardRef<HTMLDivElement, DrawingMenuProps>((props, ref) => {

    const editor = useResolvedEditor(props.getTlEditor);
    // Read from the editor rather than remembered here, so the highlight follows the tool whatever
    // changed it — including the pen's eraser button, which swaps tools for the length of a stroke.
    const curToolId = useValue('current tool', () => editor?.getCurrentToolId(), [editor]);

    ///////////

    function activateTool(toolId: string) {
		const editor = props.getTlEditor();
		if (!editor) return;
		// An embedded drawing's camera stays put so the page can scroll past it, except while the
		// hand tool is out, which exists to pan it.
		if (props.embedded) {
			editor.setCameraOptions({ isLocked: toolId !== 'hand' });
		}
		editor.setCurrentTool(toolId);
	}

    ///////////
    ///////////

    return <>
        <div
            ref = {ref}
            className = {classNames([
                'ink_menu-bar',
                'ink_menu-bar_full',
            ])}
        >
            <div
                className='ink_tool-menu'
            >
                <ToolButton
                    label = "Select"
                    pressed = {curToolId === 'select'}
                    onPress = {() => activateTool('select')}
                >
                    <SelectIcon/>
                </ToolButton>
                <ToolButton
                    label = "Pen"
                    pressed = {curToolId === 'draw'}
                    onPress = {() => activateTool('draw')}
                >
                    <DrawIcon/>
                </ToolButton>
                <ToolButton
                    label = "Eraser"
                    pressed = {curToolId === 'eraser'}
                    onPress = {() => activateTool('eraser')}
                >
                    <EraseIcon/>
                </ToolButton>
                <ToolButton
                    label = "Pan"
                    pressed = {curToolId === 'hand'}
                    onPress = {() => activateTool('hand')}
                >
                    <HandIcon/>
                </ToolButton>
                <ToolButton
                    label = {props.stylusOnly ? "Finger drawing off — tap to allow" : "Finger drawing on — tap for stylus only"}
                    pressed = {!props.stylusOnly}
                    onPress = {props.onToggleStylusOnly}
                >
                    <TouchIcon/>
                </ToolButton>
            </div>
            <div
                className='ink_other-menu'
            >
            </div>
        </div>
    </>;

});

export default DrawingMenu;
