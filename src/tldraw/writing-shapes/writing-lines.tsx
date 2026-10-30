import { Rectangle2d, SVGContainer, SvgExportContext, TLBaseShape, TLOnResizeHandler, TLOnTranslateHandler, TLShapeUtilCanBindOpts, resizeBox } from '@tldraw/tldraw';
import { ShapeUtil } from '@tldraw/tldraw';
import * as React from 'react';
import { WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { PageBand, getDisplayedPage, getExportBand, getPageBand, getPageLayout } from 'src/logic/writing-pages';

//////////
//////////

/** The paper a page of writing is on. Ink is never affected by changing it. */
export type WritingPaper = 'lines' | 'dots' | 'grid' | 'blank';

export const WRITING_PAPERS: { value: WritingPaper, label: string }[] = [
	{ value: 'lines', label: 'Lined' },
	{ value: 'dots', label: 'Dotted' },
	{ value: 'grid', label: 'Squared' },
	{ value: 'blank', label: 'Blank' },
];

// `lineHeight` and `paper` are optional: files written before they existed simply don't carry
// them, and fall back to the WRITING_LINE_HEIGHT ruling they were made with.
//
// `pageHeight` and `pageCount` are set once a writing is split into pages, and `lastPage` is the
// page it was last open on. See src/logic/writing-pages.ts.
export type WritingLines = TLBaseShape<'writing-lines', {
	x: number,
	y: number,
	w: number,
	h: number,
	lineHeight?: number,
	paper?: WritingPaper,
	pageHeight?: number,
	pageCount?: number,
	lastPage?: number,
}>

export class WritingLinesUtil extends ShapeUtil<WritingLines> {
	static override type = 'writing-lines' as const

	getDefaultProps(): WritingLines['props'] {
		return {
			x: 0,
			y: 0,
			w: WRITING_PAGE_WIDTH,
			h: WRITING_MIN_PAGE_HEIGHT,
			lineHeight: WRITING_LINE_HEIGHT,
		}
	}

	getGeometry(shape: WritingLines) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: false,	// Controls whether you can select the shape by clicking the inside (Not whether it's visibly filled)
		})
	}

	// Don't let arrows lor lines bind one of their ends to it
	override canBind = (opts: TLShapeUtilCanBindOpts<WritingLines>) => false

	// Prevent rotating the container
	override hideRotateHandle = (shape: WritingLines) => true
	
	// Prevent moving the container
	onTranslate: TLOnTranslateHandler<WritingLines> = (initShape, newShape) => {
		return initShape;
	}
	
	// Prevent resizing horizontally
	onResize: TLOnResizeHandler<WritingLines> = (shape, info) => {
		return resizeBox(shape, info, {
			minWidth: WRITING_PAGE_WIDTH,
			maxWidth: WRITING_PAGE_WIDTH,
			minHeight: WRITING_MIN_PAGE_HEIGHT,
			maxHeight: 50000
		});
	}

	indicator(shape: WritingLines) {
		return <>
			<rect
				width = {shape.props.w}
				height = {shape.props.h}
				rx = {20}
				ry = {20}
			/>
		</>
	}

	component(shape: WritingLines) {
		// A paged writing shows one page at a time: a sheet with that page's ruling, and nothing
		// of the pages around it, which are off the canvas.
		const layout = getPageLayout(shape.props);
		const page = layout ? getDisplayedPage(this.editor) : undefined;
		if (layout && page !== undefined) {
			const band = getPageBand(layout, page);
			return <SVGContainer>
				<rect
					className = "inkc_page-sheet"
					x = {0}
					y = {band.top}
					width = {shape.props.w}
					height = {band.bottom - band.top}
					rx = {40}
					ry = {40}
				/>
				{this.createSvg(shape, band)}
			</SVGContainer>
		}

		return <SVGContainer>
			{this.createSvg(shape)}
		</SVGContainer>
	}

	toSvg(shape: WritingLines, ctx: SvgExportContext): React.JSX.Element {
		return this.createSvg(shape, getExportBand());
	}

	// Custom functions
	//////////////

	// Everything is drawn with <line> elements, so the stylesheets that colour and hide ruled lines —
	// in the editor, in previews, and the "show when not editing" settings — cover every paper.
	//
	// `band` limits it to one page. A page has no rule on its bottom edge, so its last line has room
	// below for descenders without them running into the next page.
	createSvg(shape: WritingLines, band?: PageBand): React.JSX.Element {
		const lineHeight = shape.props.lineHeight || WRITING_LINE_HEIGHT;
		const { w } = shape.props;
		const top = band?.top ?? 0;
		const h = band ? band.bottom - band.top : shape.props.h;
		const paper = shape.props.paper ?? 'lines';
		this.isAspectRatioLocked(shape);

		// How many rows of `step` fit: all the way down a sheet, or short of a page's bottom edge.
		const countRows = (step: number) => band ? Math.round(h / step) - 1 : Math.floor(h / step);

		if (paper === 'blank') return <></>;

		if (paper === 'lines') {
			const numberOfLines = countRows(lineHeight);
			return <>
				{Array.from({ length: numberOfLines }, (_, index) => (
					<line
						key = {index}
						x1 = {0}
						y1 = {top + (index+1) * lineHeight}
						x2 = {w}
						y2 = {top + (index+1) * lineHeight}
						// NOTE: Styling is done through CSS
					/>
				))}
			</>
		}

		// Dots and squares sit at half the ruling, so handwriting sized for the lines still fits.
		const spacing = lineHeight / 2;
		const rows = countRows(spacing);

		if (paper === 'dots') {
			// One dashed line per row, with dashes of zero length and round caps, draws the row's
			// dots as a single element rather than one per dot. Rows start one step in, so there's
			// no half-clipped dot on the page's edge.
			return <>
				{Array.from({ length: rows }, (_, index) => (
					<line
						key = {index}
						className = "inkc_paper-dots"
						x1 = {spacing}
						y1 = {top + (index+1) * spacing}
						x2 = {w}
						y2 = {top + (index+1) * spacing}
						strokeDasharray = {`0 ${spacing}`}
						strokeLinecap = "round"
					/>
				))}
			</>
		}

		const columns = Math.floor(w / spacing);
		return <>
			{Array.from({ length: rows }, (_, index) => (
				<line
					key = {`row-${index}`}
					className = "inkc_paper-grid"
					x1 = {0}
					y1 = {top + (index+1) * spacing}
					x2 = {w}
					y2 = {top + (index+1) * spacing}
				/>
			))}
			{Array.from({ length: columns }, (_, index) => (
				<line
					key = {`column-${index}`}
					className = "inkc_paper-grid"
					x1 = {(index+1) * spacing}
					y1 = {top}
					x2 = {(index+1) * spacing}
					y2 = {top + h}
				/>
			))}
		</>
	}

	

}