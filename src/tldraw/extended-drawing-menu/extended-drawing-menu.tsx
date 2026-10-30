import { LockIcon } from "src/graphics/icons/lock-icon";
import "./extended-drawing-menu.scss";
import * as React from "react";
import { FullscreenIcon } from "src/graphics/icons/fullscreen-icon";
import { ResizeDiagonalIcon } from "src/graphics/icons/resize-diagonal-icon";
import OverflowMenu from "../overflow-menu/overflow-menu";
import { ToolButton } from "../tool-button/tool-button";

//////////
//////////

export const ExtendedDrawingMenu: React.FC<{
	onLockClick?: Function,
	// See the note in ExtendedWritingMenu — full screen is promoted out of the overflow.
	onOpenClick?: Function,
	// Stores the current viewport as this embed's framing. Only offered when the embed can
	// actually persist it, so it stays hidden in the full-screen view.
	onSaveFrameClick?: Function,
	menuOptions: any[],
}> = (props) => {

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
            {props.onLockClick && (
                <ToolButton
                    label = "Done editing"
                    onPress = {() => props.onLockClick?.()}
                >
                    <LockIcon/>
                </ToolButton>
            )}
            {props.onOpenClick && (
                <ToolButton
                    label = "Open full screen"
                    onPress = {() => props.onOpenClick?.()}
                >
                    <FullscreenIcon/>
                </ToolButton>
            )}
            {props.onSaveFrameClick && (
                <ToolButton
                    label = "Save this framing"
                    onPress = {() => props.onSaveFrameClick?.()}
                >
                    <ResizeDiagonalIcon/>
                </ToolButton>
            )}
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default ExtendedDrawingMenu;