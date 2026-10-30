import * as React from "react";
import { FullscreenIcon } from "src/graphics/icons/fullscreen-icon";

//////////
//////////

export interface FocusModeControls {
	/** Whether focus mode is on when the editor opens. */
	initiallyOn: boolean,
	onToggle: (on: boolean) => void,
}

/**
 * Turns a full screen view's focus mode off and back on. It used to only turn it off, and stayed
 * on screen afterwards looking the same, so pressing it again to go back did nothing.
 */
export const FocusModeButton = (props: FocusModeControls) => {
	const [on, setOn] = React.useState(props.initiallyOn);

	return (
		<button
			className = "ink_exit-focus-mode-button"
			onPointerDown = {(e) => {
				e.preventDefault();
				e.stopPropagation();
				setOn(!on);
				props.onToggle(!on);
			}}
			aria-label = {on ? "Exit focus mode" : "Enter focus mode"}
		>
			{on ? (
				// Fullscreen exit — Material Symbols Rounded
				<svg xmlns="http://www.w3.org/2000/svg" height={24} viewBox="0 -960 960 960" width={24}>
					<path d="M240-120v-120H120v-80h200v200h-80Zm400 0v-200h200v80H720v120h-80ZM120-640v-80h120v-120h80v200H120Zm520 0v-200h80v120h120v80H640Z" />
				</svg>
			) : (
				<FullscreenIcon/>
			)}
		</button>
	);
};
