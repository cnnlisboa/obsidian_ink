import "./writing-menu.scss";
import * as React from "react";
import { WriteIcon } from "src/graphics/icons/write-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { TouchIcon } from "src/graphics/icons/touch-icon";
import { Editor, useValue } from "@tldraw/tldraw";
import classNames from "classnames";
import { useResolvedEditor } from "../use-resolved-editor";
import { ToolButton } from "../tool-button/tool-button";

//////////
//////////

interface WritingMenuProps {
    getTlEditor: () => Editor | undefined,
    stylusOnly: boolean,
    onToggleStylusOnly: () => void,
}

export const WritingMenu = (props: WritingMenuProps) => {

    const editor = useResolvedEditor(props.getTlEditor);
    // Read from the editor rather than remembered here, so the highlight follows the tool whatever
    // changed it — including the pen's eraser button, which swaps tools for the length of a stroke.
    const curToolId = useValue('current tool', () => editor?.getCurrentToolId(), [editor]);

    function activateTool(toolId: string) {
        props.getTlEditor()?.setCurrentTool(toolId);
    }

    ///////////
    ///////////

    return <>
        <div
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
                    <WriteIcon/>
                </ToolButton>
                <ToolButton
                    label = "Eraser"
                    pressed = {curToolId === 'eraser'}
                    onPress = {() => activateTool('eraser')}
                >
                    <EraseIcon/>
                </ToolButton>
                <ToolButton
                    label = {props.stylusOnly ? "Finger writing off — tap to allow" : "Finger writing on — tap for stylus only"}
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

};

export default WritingMenu;
