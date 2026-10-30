import { Box, SelectTool, StateNode, TLPointerEventInfo, TLShape, TLShapeId, Vec, VecModel } from "@tldraw/tldraw";
import { isEreader } from "src/utils/isEreader";
import { fractionOfShapeInPolygon } from "src/utils/ink-geometry";

//////////
//////////

// The writing templates (ruled lines and their container) are locked page furniture, not ink.
const TEMPLATE_SHAPE_TYPES = new Set(['writing-container', 'writing-lines']);

// How much of a stroke has to fall inside the lasso for it to be picked up. Generous enough that
// a loop drawn a little tight around a word still takes all of it.
const ENCLOSED_FRACTION = 0.5;

const BasePointingCanvas = SelectTool.children().find(child => child.id === 'pointing_canvas') as unknown as typeof StateNode;
const BasePointingShape = SelectTool.children().find(child => child.id === 'pointing_shape') as unknown as typeof StateNode;

/** Dragging from empty canvas draws a lasso rather than a rectangle. Everything else is unchanged. */
class LassoPointingCanvas extends BasePointingCanvas {
	static override id = 'pointing_canvas';

	override onPointerMove = (info: TLPointerEventInfo) => {
		if (this.editor.inputs.isDragging) {
			this.parent.transition('lassoing', info);
		}
	};
}

/**
 * Handwriting is dense, so a loop often starts on top of a stroke. Dragging from ink that wasn't
 * already selected draws a lasso too; dragging the current selection still moves it, and a tap on
 * a stroke still selects just that stroke.
 */
class LassoPointingShape extends BasePointingShape {
	static override id = 'pointing_shape';

	constructor(...args: ConstructorParameters<typeof StateNode>) {
		super(...args);
		// tldraw defines its handlers as instance fields, so the original is wrapped once it exists.
		const pointingShapeMove = this.onPointerMove;
		this.onPointerMove = (info: TLPointerEventInfo) => {
			// Set by tldraw's PointingShape when this press is what selected the shape.
			const pressedUnselectedInk = (this as unknown as { didSelectOnEnter: boolean }).didSelectOnEnter;
			if (this.editor.inputs.isDragging && pressedUnselectedInk) {
				this.parent.transition('lassoing', info);
				return;
			}
			pointingShapeMove?.(info);
		};
	}
}

/**
 * Freehand selection: whatever ink the loop encloses is selected when the pen lifts. The natural
 * way to pick up handwriting, which rarely sits in neat rectangles.
 */
class Lassoing extends StateNode {
	static override id = 'lassoing';

	private points: Vec[] = [];
	private scribbleId = '';

	override onEnter = () => {
		const { originPagePoint, currentPagePoint } = this.editor.inputs;
		// A loop that started on a stroke selected it on the way in; the lasso decides afresh.
		this.editor.selectNone();
		this.points = [];
		const scribble = this.editor.scribbles.addScribble({
			color: 'selection-stroke',
			opacity: 0.8,
			size: 2,
			taper: false,
			// The whole loop stays visible while it's drawn; by default a scribble eats its own tail.
			shrink: 0,
		});
		this.scribbleId = scribble.id;
		this.addPoint(originPagePoint);
		this.addPoint(currentPagePoint);
	};

	override onPointerMove = () => {
		this.addPoint(this.editor.inputs.currentPagePoint);
	};

	override onPointerUp = () => {
		this.complete();
	};

	override onComplete = () => {
		this.complete();
	};

	override onCancel = () => {
		this.parent.transition('idle');
	};

	override onExit = () => {
		// A scribble normally shrinks away over a few frames, each one a panel refresh on e-ink.
		if (isEreader()) {
			this.editor.scribbles.reset();
		} else {
			this.editor.scribbles.stop(this.scribbleId);
		}
	};

	private addPoint(point: VecModel) {
		this.points.push(new Vec(point.x, point.y));
		this.editor.scribbles.addPoint(this.scribbleId, point.x, point.y);
	}

	private complete() {
		this.editor.setSelectedShapes(this.getEnclosedShapeIds());
		this.parent.transition('idle');
	}

	private getEnclosedShapeIds(): TLShapeId[] {
		const polygon = this.points;
		if (polygon.length < 3) return [];
		const lassoBounds = Box.FromPoints(polygon);

		return this.editor.getCurrentPageShapes()
			.filter((shape) => this.isSelectable(shape))
			.filter((shape) => {
				const bounds = this.editor.getShapePageBounds(shape);
				if (!bounds || !lassoBounds.collides(bounds)) return false;
				return fractionOfShapeInPolygon(this.editor, shape, polygon) >= ENCLOSED_FRACTION;
			})
			.map((shape) => shape.id);
	}

	private isSelectable(shape: TLShape): boolean {
		return !shape.isLocked && !TEMPLATE_SHAPE_TYPES.has(shape.type);
	}
}

/**
 * The writing editors' select tool: tldraw's own, so selection outlines, dragging a selection and
 * its handles behave exactly as before, with a lasso in place of the rectangle drawn from empty
 * canvas. Keeps the id `select`, so everything that refers to the select tool still finds it.
 */
export class InkSelectTool extends SelectTool {
	static override children = () => [
		...SelectTool.children().filter(child => child.id !== 'pointing_canvas' && child.id !== 'pointing_shape'),
		LassoPointingCanvas,
		LassoPointingShape,
		Lassoing,
	];
}
