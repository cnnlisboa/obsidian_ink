import "./page-controls.scss";
import * as React from "react";
import classNames from "classnames";
import { ToolButton } from "../tool-button/tool-button";

//////////
//////////

// Material Symbols Rounded: chevron_left, chevron_right, note_add.
const PreviousIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height={24} viewBox="0 -960 960 960" width={24}>
		<path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z" />
	</svg>
);
const NextIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height={24} viewBox="0 -960 960 960" width={24}>
		<path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z" />
	</svg>
);
export const AddPageIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" height={24} viewBox="0 -960 960 960" width={24}>
		<path d="M440-240h80v-120h120v-80H520v-120h-80v120H320v80h120v120ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z" />
	</svg>
);

// Taps on these mustn't reach CodeMirror (which would move the cursor into the embed's codeblock)
// or the preview underneath (which would open the editor).
const stopPropagation = {
	onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
	onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
	onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
};

/** Turning pages in a paged writing, and adding one at the end. See src/logic/writing-pages.ts. */
export const PageControls = (props: {
	/** The page in view, from 0. */
	page: number,
	pageCount: number,
	onTurn: (page: number) => void,
	/** Left out where pages can't be added, such as an embed of a single page. */
	onAddPage?: () => void,
	className?: string,
}) => (
	<div className={classNames('inkc_page-controls', props.className)} {...stopPropagation}>
		<ToolButton
			label = "Previous page"
			disabled = {props.page <= 0}
			onPress = {() => props.onTurn(props.page - 1)}
		>
			<PreviousIcon/>
		</ToolButton>
		<span className="inkc_page-number" aria-live="polite">
			{props.page + 1} / {props.pageCount}
		</span>
		<ToolButton
			label = "Next page"
			disabled = {props.page >= props.pageCount - 1}
			onPress = {() => props.onTurn(props.page + 1)}
		>
			<NextIcon/>
		</ToolButton>
		{props.onAddPage && (
			<ToolButton
				label = "Add page"
				onPress = {props.onAddPage}
			>
				<AddPageIcon/>
			</ToolButton>
		)}
	</div>
);

/** For a writing that's still one sheet: adding a page splits it into pages first. */
export const AddPageButton = (props: { onAddPage: () => void, className?: string }) => (
	<div className={classNames('inkc_page-controls', props.className)} {...stopPropagation}>
		<ToolButton
			label = "Add page"
			onPress = {props.onAddPage}
		>
			<AddPageIcon/>
		</ToolButton>
	</div>
);

/** In place of the controls on an embed of a single page. */
export const PageLabel = (props: { page: number, className?: string }) => (
	<div className={classNames('inkc_page-controls', 'inkc_page-label', props.className)} {...stopPropagation}>
		<span className="inkc_page-number">Page {props.page + 1}</span>
	</div>
);
