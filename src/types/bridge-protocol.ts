////////
//////// Message schema for the Boox companion-app bridge.
//////// See COMPANION_APP_RESEARCH.md for the design this implements.
////////

export interface BridgeRect {
	left: number,
	top: number,
	width: number,
	height: number,
}

export interface BridgeStyle {
	color: string,
	width: number,
}

// plugin -> companion app: sent when a writing session starts, and again on
// every camera change while active, so the overlay's activation region and
// style stay in sync with the live tldraw viewport.
export interface SetWritingModeMessage {
	type: 'setWritingMode',
	sessionId: string,
	canvasId: string,
	active: boolean,
	rect: BridgeRect,
	style: BridgeStyle,
	// Where the WebView's viewport origin (CSS px) sits on the physical screen — i.e. a real
	// pen PointerEvent's (screenX - clientX, screenY - clientY). Lets the companion app convert
	// its own physical-pixel touch coordinates into the same CSS/viewport-relative space `rect`
	// and every point in StrokePointsMessage are already in. {0,0} means "not yet calibrated"
	// (e.g. desktop/mock testing, where points are already fabricated in the right space).
	screenOrigin: { x: number, y: number },
	// The WebView's own physical-px -> CSS-px ratio. Kotlin used to assume its
	// resources.displayMetrics.density matched this, but devicePixelRatio is deviceScaleFactor *
	// page zoom, so Obsidian's zoom setting can make them diverge — and any divergence shows up as
	// a scale error that grows with distance from the viewport origin. Authoritative here, because
	// clientX/clientY (what tldraw reads) are defined in exactly these units.
	devicePixelRatio: number,
	// Regions inside `rect` that must NOT capture the pen — the embed's own menu bar and scroll
	// buttons, any popup or modal open over it, and the on-screen keyboard's inset. Same
	// viewport-relative CSS px space as `rect`.
	//
	// This is a blocklist, deliberately: capture stays on everywhere by default and we subtract the
	// UI we know about. The failure mode is stray ink over something we forgot, which is exactly
	// today's behaviour — as opposed to an allowlist, where anything we forget to declare goes dead
	// to the pen with no indication why.
	excludeRects: BridgeRect[],
}

export interface BridgeStrokePoint {
	x: number,
	y: number,
	pressure: number,
	tilt?: number,
	isPen: boolean,
	phase: 'down' | 'move' | 'up',
	t: number,
}

// companion app -> plugin: streamed continuously while the pen is down.
export interface StrokePointsMessage {
	type: 'strokePoints',
	sessionId: string,
	canvasId: string,
	points: BridgeStrokePoint[],
}

// plugin -> companion app: ack once tldraw has rendered the corresponding
// points, so the native overlay knows it can clear its instant preview.
export interface StrokeDrawnMessage {
	type: 'strokeDrawn',
	sessionId: string,
	canvasId: string,
	upToT: number,
}

export type BridgeMessage = SetWritingModeMessage | StrokePointsMessage | StrokeDrawnMessage;

export function isStrokePointsMessage(msg: BridgeMessage): msg is StrokePointsMessage {
	return msg.type === 'strokePoints';
}

////////
//////// Transcription. Separate from the pen messages above: the plugin opens a connection just
//////// for one request, and the companion app answers it on that connection. See InkRecognizer.kt.
////////

/** One line of handwriting, each stroke a flat [x0, y0, x1, y1, ...] array in the line's own coordinates. */
export interface RecognitionInkLine {
	strokes: number[][],
	width: number,
	height: number,
}

// plugin -> companion app
export interface RecognizeInkMessage {
	type: 'recognizeInk',
	requestId: string,
	/** BCP-47 tag naming the handwriting model, e.g. 'en-US'. */
	language: string,
	lines: RecognitionInkLine[],
}

// companion app -> plugin: the language's model is downloading, which happens once and can take a while.
export interface InkRecognitionStatusMessage {
	type: 'inkRecognitionStatus',
	requestId: string,
	status: 'downloadingModel',
}

// companion app -> plugin: one text per line sent, '' for a line with nothing recognisable.
export interface InkRecognizedMessage {
	type: 'inkRecognized',
	requestId: string,
	lines: string[],
}

export type InkRecognitionFailureReason = 'unsupportedLanguage' | 'modelUnavailable' | 'timeout' | 'error';

// companion app -> plugin
export interface InkRecognitionFailedMessage {
	type: 'inkRecognitionFailed',
	requestId: string,
	reason: InkRecognitionFailureReason,
	message: string,
}

export type InkRecognitionReply = InkRecognitionStatusMessage | InkRecognizedMessage | InkRecognitionFailedMessage;
