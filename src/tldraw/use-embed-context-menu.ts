import * as React from "react";
import { Platform } from "obsidian";
import { buildMenu, menuOption } from "./overflow-menu/overflow-menu";
import { isInReadingMode } from "src/utils/embed";

//////////
//////////

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

/**
 * A native context menu for an embed's preview: right-click on desktop, long-press on touch and
 * stylus devices. Lets an embed be copied, resized or removed without opening its editor first,
 * which on e-ink is a full refresh in each direction.
 *
 * Android, and Chromium generally, turn a long press into a `contextmenu` event. iOS doesn't, so
 * there the press is timed here instead.
 */
export function useEmbedContextMenu(getMenuOptions: () => menuOption[], containerElRef: React.RefObject<HTMLElement>) {
	const pressRef = React.useRef<{ timer: number, x: number, y: number } | null>(null);
	const suppressClickRef = React.useRef(false);

	const cancelPress = () => {
		if (!pressRef.current) return;
		window.clearTimeout(pressRef.current.timer);
		pressRef.current = null;
	};

	React.useEffect(() => cancelPress, []);

	// Reading mode has no editor to open and no codeblock to write to.
	const buildEmbedMenu = () => {
		const containerEl = containerElRef.current;
		const options = getMenuOptions();
		return buildMenu(containerEl && isInReadingMode(containerEl) ? options.filter(o => !o.editsNote) : options);
	};

	return {
		handlers: {
			onContextMenu: (e: React.MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				cancelPress();
				buildEmbedMenu().showAtMouseEvent(e.nativeEvent);
			},
			onPointerDown: (e: React.PointerEvent) => {
				if (!Platform.isIosApp || e.pointerType === 'mouse') return;
				cancelPress();
				const x = e.clientX;
				const y = e.clientY;
				const timer = window.setTimeout(() => {
					pressRef.current = null;
					suppressClickRef.current = true;
					buildEmbedMenu().showAtPosition({ x, y });
				}, LONG_PRESS_MS);
				pressRef.current = { timer, x, y };
			},
			onPointerMove: (e: React.PointerEvent) => {
				const press = pressRef.current;
				if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP_PX) cancelPress();
			},
			onPointerUp: cancelPress,
			onPointerCancel: cancelPress,
		},
		/**
		 * True when the click being handled is the end of a long press that opened the menu, and
		 * so shouldn't also do what a tap does.
		 */
		consumeClick: (): boolean => {
			const suppressed = suppressClickRef.current;
			suppressClickRef.current = false;
			return suppressed;
		},
	};
}
