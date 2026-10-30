import { StateNode, TLShape, TLShapeId, TLShapePartial } from "@tldraw/tldraw";
import { INSERT_SPACE_TOOL_ID } from "src/constants";
import { getWritingLineHeight } from "src/utils/tldraw-helpers";

//////////
//////////

// The writing templates (ruled lines and their container) are locked page furniture, not content.
const TEMPLATE_SHAPE_TYPES = new Set(['writing-container', 'writing-lines']);

class InsertSpaceIdle extends StateNode {
	static override id = 'idle';

	override onPointerDown = () => {
		this.parent.transition('dragging');
	};
}

/**
 * Everything below where the pen went down moves with it: drag down to open space for a thought
 * that belongs between two lines, drag up to close a gap.
 */
class InsertSpaceDragging extends StateNode {
	static override id = 'dragging';

	private markId = '';
	private pressY = 0;
	private lineHeight = 0;
	private startPositions = new Map<TLShapeId, number>();
	private moving: TLShape[] = [];
	// How far the content below can come up before it would land on the content above.
	private maxUpwardShift = 0;
	private appliedShift = 0;

	override onEnter = () => {
		const editor = this.editor;
		this.markId = `insert space ${Date.now()}`;
		editor.mark(this.markId);
		this.pressY = editor.inputs.originPagePoint.y;
		this.lineHeight = getWritingLineHeight(editor);
		this.appliedShift = 0;

		const content = editor.getCurrentPageShapes().filter(shape => !shape.isLocked && !TEMPLATE_SHAPE_TYPES.has(shape.type));
		// A stroke belongs to whichever side of the press its middle is on, so a descender from
		// the line above stays where it is rather than being torn off with the line below.
		const isBelow = (shape: TLShape) => (editor.getShapePageBounds(shape)?.center.y ?? -Infinity) >= this.pressY;
		this.moving = content.filter(isBelow);
		this.startPositions = new Map(this.moving.map(shape => [shape.id, shape.y]));

		const movingTop = Math.min(...this.moving.map(shape => editor.getShapePageBounds(shape)?.minY ?? Infinity));
		const stationaryBottom = Math.max(0, ...content.filter(shape => !isBelow(shape)).map(shape => editor.getShapePageBounds(shape)?.maxY ?? 0));
		this.maxUpwardShift = Number.isFinite(movingTop) ? Math.max(0, movingTop - stationaryBottom) : 0;
	};

	override onPointerMove = () => {
		if (!this.moving.length) return;
		const dragged = this.editor.inputs.currentPagePoint.y - this.pressY;
		// Whole lines only, so moved writing stays on the ruling — and on e-ink, it moves in a few
		// clean steps rather than a refresh per pixel.
		let shift = Math.round(dragged / this.lineHeight) * this.lineHeight;
		if (shift < -this.maxUpwardShift) {
			shift = -Math.floor(this.maxUpwardShift / this.lineHeight) * this.lineHeight;
		}
		if (shift === this.appliedShift) return;
		this.appliedShift = shift;

		const updates: TLShapePartial[] = this.moving.map(shape => ({
			id: shape.id,
			type: shape.type,
			y: (this.startPositions.get(shape.id) ?? shape.y) + shift,
		}));
		this.editor.updateShapes(updates);
	};

	override onPointerUp = () => {
		this.parent.transition('idle');
	};

	override onComplete = () => {
		this.parent.transition('idle');
	};

	override onCancel = () => {
		this.editor.bailToMark(this.markId);
		this.parent.transition('idle');
	};
}

/**
 * Opens or closes vertical space in a page of writing. Nothing is selected or drawn: press where
 * the space should go and drag.
 */
export class InsertSpaceTool extends StateNode {
	static override id = INSERT_SPACE_TOOL_ID;
	static override initial = 'idle';
	static override children = () => [InsertSpaceIdle, InsertSpaceDragging];

	override onEnter = () => {
		this.editor.setCursor({ type: 'ns-resize', rotation: 0 });
	};

	override onExit = () => {
		this.editor.setCursor({ type: 'default', rotation: 0 });
	};
}
