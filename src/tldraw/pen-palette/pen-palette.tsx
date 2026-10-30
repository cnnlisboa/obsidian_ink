import "./pen-palette.scss";
import * as React from "react";
import { TLDefaultColorStyle, TLDefaultSizeStyle, getDefaultColorTheme } from "@tldraw/tldraw";
import { ToolButton } from "../tool-button/tool-button";

//////////
//////////

export const PEN_COLORS: { value: TLDefaultColorStyle, label: string }[] = [
	{ value: 'black', label: 'Black' },
	{ value: 'blue', label: 'Blue' },
	{ value: 'red', label: 'Red' },
	{ value: 'green', label: 'Green' },
];

export const PEN_SIZES: { value: TLDefaultSizeStyle, label: string }[] = [
	{ value: 's', label: 'Fine' },
	{ value: 'm', label: 'Medium' },
	{ value: 'l', label: 'Bold' },
];

export const HIGHLIGHTER_COLORS: { value: TLDefaultColorStyle, label: string }[] = [
	{ value: 'yellow', label: 'Yellow' },
	{ value: 'green', label: 'Green' },
	{ value: 'light-blue', label: 'Blue' },
	{ value: 'light-red', label: 'Pink' },
];

// Diameter of each size's sample dot, in px. Proportional rather than literal, so the three read
// as clearly different at a glance.
const SIZE_DOT_PX: Partial<Record<TLDefaultSizeStyle, number>> = { s: 4, m: 7, l: 11 };

interface PenPaletteProps {
	kind: 'pen' | 'highlighter',
	color: TLDefaultColorStyle,
	size?: TLDefaultSizeStyle,
	isDarkMode: boolean,
	onColorChange: (color: TLDefaultColorStyle) => void,
	onSizeChange?: (size: TLDefaultSizeStyle) => void,
	/** Called on a press anywhere outside the palette and `ignoreWithin`. */
	onDismiss: () => void,
	/** Presses in here leave the palette to whatever handles them — the toolbar that opened it. */
	ignoreWithin: React.RefObject<HTMLElement>,
}

/**
 * The choice of ink for the pen or the highlighter, opened by pressing the tool again once it's
 * already in hand.
 */
export const PenPalette = (props: PenPaletteProps) => {
	const paletteElRef = React.useRef<HTMLDivElement>(null);
	const theme = getDefaultColorTheme({ isDarkMode: props.isDarkMode });
	const colors = props.kind === 'pen' ? PEN_COLORS : HIGHLIGHTER_COLORS;

	// Kept in a ref so the listener, attached once, always calls the latest onDismiss.
	const propsRef = React.useRef(props);
	propsRef.current = props;

	React.useEffect(() => {
		const doc = paletteElRef.current?.ownerDocument ?? document;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node | null;
			if (!target) return;
			if (paletteElRef.current?.contains(target)) return;
			if (propsRef.current.ignoreWithin.current?.contains(target)) return;
			propsRef.current.onDismiss();
		};
		doc.addEventListener('pointerdown', onPointerDown, { capture: true });
		return () => doc.removeEventListener('pointerdown', onPointerDown, { capture: true });
	}, []);

	return <div
		ref = {paletteElRef}
		className = "inkc_pen-palette"
		role = "group"
		aria-label = {props.kind === 'pen' ? 'Pen' : 'Highlighter'}
	>
		<div className = "inkc_pen-palette-row">
			{colors.map(({ value, label }) => (
				<ToolButton
					key = {value}
					label = {label}
					pressed = {props.color === value}
					onPress = {() => props.onColorChange(value)}
				>
					<span
						className = "inkc_pen-palette-swatch"
						style = {{
							backgroundColor: props.kind === 'pen' ? theme[value].solid : theme[value].highlight.srgb,
						}}
					/>
				</ToolButton>
			))}
		</div>
		{props.kind === 'pen' && props.size && props.onSizeChange && (
			<div className = "inkc_pen-palette-row">
				{PEN_SIZES.map(({ value, label }) => (
					<ToolButton
						key = {value}
						label = {label}
						pressed = {props.size === value}
						onPress = {() => props.onSizeChange?.(value)}
					>
						<span
							className = "inkc_pen-palette-size"
							style = {{
								width: SIZE_DOT_PX[value],
								height: SIZE_DOT_PX[value],
							}}
						/>
					</ToolButton>
				))}
			</div>
		)}
	</div>;
};

export default PenPalette;
