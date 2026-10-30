import { Editor, TLShape, VecModel } from "@tldraw/tldraw";

//////////
//////////

/** Even-odd ray casting. The polygon is closed implicitly between its last point and its first. */
export function isPointInPolygon(point: VecModel, polygon: VecModel[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i];
		const b = polygon[j];
		if ((a.y > point.y) !== (b.y > point.y)
			&& point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}

/**
 * Where a shape's ink actually runs, in page space. Pen and highlighter strokes are judged by the
 * path the nib took rather than their outline: a highlighter's outline is a wide band, most of
 * which lies outside any loop drawn around the line it marks.
 */
export function getInkPagePoints(editor: Editor, shape: TLShape): VecModel[] {
	const transform = editor.getShapePageTransform(shape);
	const segments = (shape.props as { segments?: { points: VecModel[] }[] }).segments;
	if (segments) return transform.applyToPoints(segments.flatMap(segment => segment.points));
	return transform.applyToPoints(editor.getShapeGeometry(shape).vertices);
}

/**
 * The share of a shape's ink that falls inside `polygon` — sampled at no more than `maxSamples`
 * points, which is plenty to tell a stroke inside from one only clipped.
 */
export function fractionOfShapeInPolygon(editor: Editor, shape: TLShape, polygon: VecModel[], maxSamples = 24): number {
	const vertices = getInkPagePoints(editor, shape);
	if (vertices.length === 0) return 0;
	const step = Math.max(1, Math.floor(vertices.length / maxSamples));
	let tested = 0;
	let inside = 0;
	for (let i = 0; i < vertices.length; i += step) {
		tested++;
		if (isPointInPolygon(vertices[i], polygon)) inside++;
	}
	return inside / tested;
}

/** Convex hull, counter-clockwise, by Andrew's monotone chain. */
export function convexHull(points: VecModel[]): VecModel[] {
	const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
	if (sorted.length < 3) return sorted;
	const cross = (o: VecModel, a: VecModel, b: VecModel) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: VecModel[] = [];
	for (const p of sorted) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper: VecModel[] = [];
	for (let i = sorted.length - 1; i >= 0; i--) {
		const p = sorted[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
