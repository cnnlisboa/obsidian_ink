import * as React from "react";

//////////
//////////

interface ToolButtonProps {
	/** Read by screen readers, and shown by Obsidian as the hover tooltip on desktop. */
	label: string,
	onPress: () => void,
	/** Whether this tool or toggle is currently on. Leave undefined for plain action buttons. */
	pressed?: boolean,
	disabled?: boolean,
	className?: string,
	children: React.ReactNode,
}

/**
 * A button for the editor menus. Presses register on pointer down, as they always have here, so a
 * stylus tap takes effect before the pen lifts. A click with no pointer behind it (`detail === 0`)
 * is a keyboard activation and is handled too; any other click already ran on pointer down.
 */
export const ToolButton = (props: ToolButtonProps) => (
	<button
		className = {props.className}
		aria-label = {props.label}
		aria-pressed = {props.pressed}
		disabled = {props.disabled}
		onPointerDown = {(e) => {
			// Secondary mouse buttons and the pen's barrel button shouldn't trigger tools.
			if (e.button !== 0) return;
			props.onPress();
		}}
		onClick = {(e) => {
			if (e.detail === 0) props.onPress();
		}}
	>
		{props.children}
	</button>
);

export default ToolButton;
