import { TFile } from "obsidian";
import { TLEditorSnapshot } from "@tldraw/tldraw";
import InkPlugin from "src/main";
import { WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH } from "src/constants";
import { InkFileData, stringifyPageData } from "src/utils/page-file";
import { InkRecognitionFailureReason, InkRecognitionReply, RecognitionInkLine, RecognizeInkMessage } from "src/types/bridge-protocol";

/////////
/////////

// Handwriting turned into text, so it can be found with Obsidian's search. The companion app reads
// it (with Google ML Kit, on the device; see InkRecognizer.kt in companion-app), the text is kept
// in the writing file and in each embed's codeblock, and only ink that has changed is read again.

// The companion app is local, so it either answers at once or isn't running.
const CONNECT_TIMEOUT_MS = 3000;
// Each line takes well under a second; this allows for a long page on a slow device.
const BASE_RESPONSE_TIMEOUT_MS = 20000;
const PER_LINE_TIMEOUT_MS = 2000;
// A first request in a language downloads its model (~20 MB) before answering.
const MODEL_DOWNLOAD_TIMEOUT_MS = 6 * 60 * 1000;

// A stroke starts a new line when its middle is further than this share of the ruling below the
// middle of the line being gathered. Generous enough to keep descenders and the dots of i's with
// their line, small enough that writing on consecutive rules stays apart.
const NEW_LINE_SHARE_OF_RULING = 0.5;

export type TranscriptionFailureReason = InkRecognitionFailureReason | 'unavailable' | 'noAnswer';

export class TranscriptionError extends Error {
	constructor(public reason: TranscriptionFailureReason, message: string) {
		super(message);
	}
}

/** Whether transcription can be asked for at all: it's done by the companion app. */
export function canTranscribe(plugin: InkPlugin): boolean {
	return plugin.settings.companionBridgeEnabled;
}

//////////
//////////

type StrokeLayout = { points: number[], minX: number, minY: number, maxY: number, centerY: number };

/** The pen strokes in a writing file, gathered into lines and put in reading order. */
export function getInkLines(snapshot: TLEditorSnapshot): RecognitionInkLine[] {
	const store = (snapshot?.document?.store ?? {}) as Record<string, any>;
	const records = Object.values(store);
	const ruling: number = store['shape:writing-lines']?.props?.lineHeight || WRITING_LINE_HEIGHT;

	const strokes: StrokeLayout[] = [];
	for (const record of records) {
		// Highlighter marks go over text; they aren't text themselves.
		if (record?.typeName !== 'shape' || record.type !== 'draw') continue;
		const stroke = layOutStroke(record);
		if (stroke) strokes.push(stroke);
	}
	strokes.sort((a, b) => a.centerY - b.centerY);

	const lines: StrokeLayout[][] = [];
	let current: StrokeLayout[] = [];
	let currentCenter = 0;
	for (const stroke of strokes) {
		if (current.length && stroke.centerY - currentCenter > ruling * NEW_LINE_SHARE_OF_RULING) {
			lines.push(current);
			current = [];
		}
		current.push(stroke);
		currentCenter = current.reduce((sum, s) => sum + s.centerY, 0) / current.length;
	}
	if (current.length) lines.push(current);

	return lines.map((line) => {
		// Left to right, which also puts a crossbar or a dot drawn afterwards beside its letter.
		line.sort((a, b) => a.minX - b.minX);
		const top = Math.min(...line.map(s => s.minY));
		const bottom = Math.max(...line.map(s => s.maxY));
		return {
			strokes: line.map(s => s.points.map((value, i) => round(i % 2 === 0 ? value : value - top))),
			width: WRITING_PAGE_WIDTH,
			height: Math.max(1, round(bottom - top)),
		};
	});
}

function layOutStroke(record: any): StrokeLayout | null {
	const rotation: number = record.rotation ?? 0;
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const points: number[] = [];
	let minX = Infinity, minY = Infinity, maxY = -Infinity;
	for (const segment of record.props?.segments ?? []) {
		for (const point of segment.points ?? []) {
			const x = record.x + point.x * cos - point.y * sin;
			const y = record.y + point.x * sin + point.y * cos;
			points.push(x, y);
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	if (!points.length) return null;
	return { points, minX, minY, maxY, centerY: (minY + maxY) / 2 };
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

/** A short fingerprint of the ink, to tell whether it has changed since it was last read. */
export function getInkFingerprint(lines: RecognitionInkLine[]): string {
	// FNV-1a over the rounded coordinates. Collisions only cost a skipped re-read of edited ink.
	let hash = 0x811c9dc5;
	const text = JSON.stringify(lines);
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

//////////
//////////

/**
 * Asks the companion app to read `lines`. Resolves with one text per line, or rejects with a
 * TranscriptionError saying why not.
 */
export function recognizeHandwriting(
	plugin: InkPlugin,
	lines: RecognitionInkLine[],
	onDownloadingModel?: () => void,
): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const requestId = `recognize-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		let socket: WebSocket;
		let timer: number;
		let settled = false;

		const settle = (outcome: () => void) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timer);
			socket.onclose = null;
			socket.onerror = null;
			socket.onmessage = null;
			try { socket.close(); } catch { /* already closed */ }
			outcome();
		};
		const fail = (reason: TranscriptionFailureReason, message: string) => settle(() => reject(new TranscriptionError(reason, message)));
		const waitFor = (ms: number, reason: TranscriptionFailureReason, message: string) => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => fail(reason, message), ms);
		};

		try {
			socket = new WebSocket(`ws://127.0.0.1:${plugin.settings.companionBridgePort}`);
		} catch {
			reject(new TranscriptionError('unavailable', "Couldn't reach the companion app."));
			return;
		}

		waitFor(CONNECT_TIMEOUT_MS, 'unavailable', "The companion app isn't running.");
		socket.onerror = () => fail('unavailable', "The companion app isn't running.");
		socket.onclose = () => fail('unavailable', 'The companion app closed the connection.');

		socket.onopen = () => {
			// A companion app from before transcription existed ignores the request entirely.
			waitFor(BASE_RESPONSE_TIMEOUT_MS + PER_LINE_TIMEOUT_MS * lines.length, 'noAnswer', "The companion app didn't answer. It may need updating.");
			const request: RecognizeInkMessage = {
				type: 'recognizeInk',
				requestId,
				language: plugin.settings.transcriptionLanguage,
				lines,
			};
			socket.send(JSON.stringify(request));
		};

		socket.onmessage = (event) => {
			let reply: InkRecognitionReply;
			try {
				reply = JSON.parse(event.data);
			} catch {
				return;
			}
			// The connection also hears the pen points the app sends every client; they're not ours.
			if (reply.requestId !== requestId) return;

			switch (reply.type) {
				case 'inkRecognitionStatus':
					waitFor(MODEL_DOWNLOAD_TIMEOUT_MS, 'modelUnavailable', 'Downloading the handwriting model took too long.');
					onDownloadingModel?.();
					break;
				case 'inkRecognized':
					settle(() => resolve(reply.lines));
					break;
				case 'inkRecognitionFailed':
					fail(reply.reason, reply.message);
					break;
			}
		};
	});
}

/**
 * The transcript as it's kept in a codeblock: on one line. JSON writes a line break as the two
 * characters \n, which would fuse the first word of each handwritten line to that n in the note's
 * text and hide it from search. The file keeps the version with line breaks.
 */
export function getSearchableTranscript(transcript: string): string {
	return transcript.replace(/\s*\n\s*/g, ' ').trim();
}

/** A writing file's transcript, with its line breaks. Undefined if it has never been transcribed. */
export async function readTranscript(plugin: InkPlugin, file: TFile): Promise<string | undefined> {
	try {
		const pageData: InkFileData = JSON.parse(await plugin.app.vault.read(file));
		return pageData.meta?.transcript;
	} catch {
		return undefined;
	}
}

/** Line texts as one transcript: trimmed, with empty lines dropped. */
function joinLines(texts: string[]): string {
	return texts.map(text => text.trim()).filter(Boolean).join('\n');
}

//////////
//////////

// One transcription per file at a time. A second request for the same file waits for the first,
// then finds the ink already read and returns straight away.
const inFlight = new Map<string, Promise<string>>();

/**
 * The transcript of a writing file, read afresh only if its ink has changed since the last time
 * (or `force` is set), and saved back into the file.
 */
export function transcribeWritingFile(
	plugin: InkPlugin,
	file: TFile,
	options: { force?: boolean, onDownloadingModel?: () => void } = {},
): Promise<string> {
	const previous = inFlight.get(file.path) ?? Promise.resolve('');
	const next = previous
		.catch(() => '')
		.then(() => transcribe(plugin, file, options));
	inFlight.set(file.path, next);
	next.finally(() => {
		if (inFlight.get(file.path) === next) inFlight.delete(file.path);
	}).catch(() => { /* reported to the caller */ });
	return next;
}

async function transcribe(plugin: InkPlugin, file: TFile, options: { force?: boolean, onDownloadingModel?: () => void }): Promise<string> {
	const { vault } = plugin.app;
	const pageData: InkFileData = JSON.parse(await vault.read(file));
	const lines = getInkLines(pageData.tldraw);
	const fingerprint = getInkFingerprint(lines);

	if (!options.force && pageData.meta?.transcriptOf === fingerprint && pageData.meta.transcript !== undefined) {
		return pageData.meta.transcript;
	}

	const transcript = lines.length ? joinLines(await recognizeHandwriting(plugin, lines, options.onDownloadingModel)) : '';

	// Written into the file only if its ink is still what was read: it may have been edited while
	// the companion app was working, and that edit's transcript is the next one's job.
	await vault.process(file, (data) => {
		let latest: InkFileData;
		try {
			latest = JSON.parse(data);
		} catch {
			return data;
		}
		if (getInkFingerprint(getInkLines(latest.tldraw)) !== fingerprint) return data;
		latest.meta = { ...latest.meta, transcript, transcriptOf: fingerprint };
		return stringifyPageData(latest);
	});

	return transcript;
}

/** A failure as a sentence for a notice. */
export function describeTranscriptionError(error: unknown): string {
	if (error instanceof TranscriptionError) {
		switch (error.reason) {
			case 'unsupportedLanguage': return `${error.message}. Check the transcription language in Ink's settings.`;
			case 'modelUnavailable': return `${error.message}. The handwriting model downloads once, so the device needs to be online the first time.`;
			default: return error.message;
		}
	}
	return error instanceof Error ? error.message : String(error);
}
