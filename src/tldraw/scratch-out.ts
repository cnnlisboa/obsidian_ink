import { Box, Editor, HistoryEntry, TLDrawShape, TLRecord, TLShapeId, VecModel } from "@tldraw/tldraw";
import { WRITING_LINE_HEIGHT } from "src/constants";
import { convexHull, fractionOfShapeInPolygon, getInkPagePoints } from "src/utils/ink-geometry";
import { isInkShapeType } from "src/utils/tldraw-helpers";

//////////
//////////

// Scratching out: scribbling back and forth over ink deletes it, the way it's crossed out on
// paper. Recognised conservatively, because a false positive deletes someone's writing:
//
// - the stroke doubles back on itself along its long axis at least MIN_REVERSALS times, which
//   joined-up letters moving along a line don't do;
// - it covers its own length several times over (MIN_PATH_TO_EXTENT);
// - and there's existing ink at least COVERED_FRACTION inside the area it covers. A zigzag over
//   empty space stays on the page as writing.

const MIN_POINTS = 12;
const MIN_REVERSALS = 3;
const MIN_PATH_TO_EXTENT = 2.5;
// A change of direction only counts once it has travelled this share of the stroke's length back
// the other way, so the wobble in a straight line isn't read as back-and-forth.
const REVERSAL_SHARE_OF_EXTENT = 0.15;
// Anything smaller than a third of a ruled line is a mark, not a scratch-out.
const MIN_EXTENT = WRITING_LINE_HEIGHT / 3;
const COVERED_FRACTION = 0.5;

// The ruled-line template is page furniture, never something to erase.
const TEMPLATE_SHAPE_TYPES = new Set(['writing-container', 'writing-lines']);

/**
 * Deletes any pen strokes just finished in `entry` that scratch out existing ink, along with the
 * ink they cover. Undoing restores both.
 */
export function eraseScratchOuts(editor: Editor, entry: HistoryEntry<TLRecord>) {
	for (const stroke of getNewlyCompletedPenStrokes(entry)) {
		// Already gone, e.g. undone in the same tick.
		if (!editor.getShape(stroke.id)) continue;
		const scratchedOut = findScratchedOutShapes(editor, stroke);
		if (!scratchedOut.length) continue;
		editor.mark('scratch out');
		editor.deleteShapes([stroke.id, ...scratchedOut]);
	}
}

// Strokes from the pen (not the highlighter, which is meant to go over ink) that finished in this
// change. A pen stroke always starts incomplete, so only that transition counts: a finished stroke
// arriving whole — an undo putting a scratch-out back — must not be erased all over again, and
// one that was only moved isn't being drawn.
function getNewlyCompletedPenStrokes(entry: HistoryEntry<TLRecord>): TLDrawShape[] {
	const strokes: TLDrawShape[] = [];
	for (const [before, after] of Object.values(entry.changes.updated)) {
		if (after.typeName !== 'shape' || after.type !== 'draw') continue;
		if ((after as TLDrawShape).props.isComplete && !(before as TLDrawShape).props.isComplete) {
			strokes.push(after as TLDrawShape);
		}
	}
	return strokes;
}

export function findScratchedOutShapes(editor: Editor, stroke: TLDrawShape): TLShapeId[] {
	const points = getInkPagePoints(editor, stroke);
	if (points.length < MIN_POINTS || !isBackAndForth(points)) return [];

	const hull = convexHull(points);
	if (hull.length < 3) return [];
	const hullBounds = Box.FromPoints(hull);

	return editor.getCurrentPageShapes()
		.filter((shape) => shape.id !== stroke.id
			&& isInkShapeType(shape.type)
			&& !shape.isLocked
			&& !TEMPLATE_SHAPE_TYPES.has(shape.type))
		.filter((shape) => {
			const bounds = editor.getShapePageBounds(shape);
			if (!bounds || !hullBounds.collides(bounds)) return false;
			return fractionOfShapeInPolygon(editor, shape, hull) >= COVERED_FRACTION;
		})
		.map((shape) => shape.id);
}

function isBackAndForth(points: VecModel[]): boolean {
	const bounds = Box.FromPoints(points);
	const axis: 'x' | 'y' = bounds.w >= bounds.h ? 'x' : 'y';
	const extent = Math.max(bounds.w, bounds.h);
	if (extent < MIN_EXTENT) return false;

	let pathLength = 0;
	for (let i = 1; i < points.length; i++) {
		pathLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
	}
	if (pathLength < extent * MIN_PATH_TO_EXTENT) return false;

	return countReversals(points.map(p => p[axis]), extent * REVERSAL_SHARE_OF_EXTENT) >= MIN_REVERSALS;
}

// How many times a sequence turns back, ignoring turns smaller than `threshold`.
function countReversals(values: number[], threshold: number): number {
	let reversals = 0;
	let direction = 0;
	let extreme = values[0];
	for (const value of values) {
		if (direction === 0) {
			if (Math.abs(value - extreme) > threshold) {
				direction = Math.sign(value - extreme);
				extreme = value;
			}
		} else if ((value - extreme) * direction > 0) {
			extreme = value;
		} else if (Math.abs(value - extreme) > threshold) {
			reversals++;
			direction = -direction;
			extreme = value;
		}
	}
	return reversals;
}
