import * as React from "react";
import { hasCoarsePointer } from "src/utils/device-classes";

//////////
//////////

/**
 * An embed's title, renameable in place: double-click on desktop, a single tap on touch and
 * e-ink devices, where a double-click isn't practical with a stylus.
 */
export const EmbedTitle = (props: {
	title: string,
	onCommit: (title: string) => void,
}) => {
	const [isEditing, setIsEditing] = React.useState(false);
	// Escape unmounts the input, and depending on the browser that blurs it too. Without this the
	// blur would commit the very edit Escape was meant to throw away.
	const cancelledRef = React.useRef(false);

	const startEditing = () => {
		cancelledRef.current = false;
		setIsEditing(true);
	};
	const commit = (value: string) => {
		if (cancelledRef.current) return;
		cancelledRef.current = true;
		setIsEditing(false);
		props.onCommit(value);
	};
	const cancel = () => {
		cancelledRef.current = true;
		setIsEditing(false);
	};

	if (isEditing) {
		return <input
			className = "inkc_collapsed-title-input"
			defaultValue = {props.title}
			autoFocus
			onFocus = {(e) => e.target.select()}
			onBlur = {(e) => commit(e.target.value)}
			onKeyDown = {(e) => {
				if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
				if (e.key === 'Escape') cancel();
			}}
			onPointerDown = {(e) => e.stopPropagation()}
			onClick = {(e) => e.stopPropagation()}
			aria-label = "Rename"
		/>;
	}

	return <span
		className = "inkc_collapsed-label"
		onDoubleClick = {(e) => {
			e.stopPropagation();
			startEditing();
		}}
		onClick = {(e) => {
			e.stopPropagation();
			if (hasCoarsePointer()) startEditing();
		}}
		title = {hasCoarsePointer() ? 'Tap to rename' : 'Double-click to rename'}
	>
		{props.title}
	</span>;
};

export default EmbedTitle;
