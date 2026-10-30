import { LockIcon } from "src/graphics/icons/lock-icon";
import "./extended-writing-menu.scss";
import * as React from "react";
import { FullscreenIcon } from "src/graphics/icons/fullscreen-icon";
import OverflowMenu from "../overflow-menu/overflow-menu";
import { ToolButton } from "../tool-button/tool-button";

//////////
//////////

export const ExtendedWritingMenu: React.FC<{
	onLockClick: Function,
	// Opening the file full screen is the most-reached-for action in an embed, so it gets its own
	// button rather than living behind the overflow. On e-ink especially, every nested tap costs a
	// full screen refresh — flattening one level is a real latency win, not just tidier.
	onOpenClick?: Function,
	menuOptions: any[],
}> = (props) => {

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
            <ToolButton
                label = "Done editing"
                onPress = {() => props.onLockClick()}
            >
                <LockIcon/>
            </ToolButton>
            {props.onOpenClick && (
                <ToolButton
                    label = "Open full screen"
                    onPress = {() => props.onOpenClick?.()}
                >
                    <FullscreenIcon/>
                </ToolButton>
            )}
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default ExtendedWritingMenu;