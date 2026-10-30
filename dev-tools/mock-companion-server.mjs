// Mock companion-app server for developing the plugin-side bridge client
// (src/utils/companion-bridge.ts) without needing the real Boox companion app.
// See COMPANION_APP_RESEARCH.md.
//
// Usage: node dev-tools/mock-companion-server.mjs [port]
//
// On receiving `setWritingMode { active: true, rect }`, it waits briefly then
// streams a simulated pen gesture (a sine wave, like a lazy cursive line)
// across the middle of that rect, as a sequence of strokePoints messages —
// mimicking what a real companion app would forward from raw stylus input.

import { WebSocketServer } from 'ws';

const port = parseInt(process.argv[2]) || 8765;
const wss = new WebSocketServer({ host: '127.0.0.1', port });

console.log(`Mock companion server listening on ws://127.0.0.1:${port}`);

wss.on('connection', (socket) => {
	console.log('Plugin connected.');
	let sessionId = null;
	let canvasId = null;

	socket.on('message', (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}

		if (msg.type === 'setWritingMode') {
			sessionId = msg.sessionId;
			canvasId = msg.canvasId;
			console.log(`setWritingMode: active=${msg.active} rect=${JSON.stringify(msg.rect)}`);
			if (msg.active) {
				setTimeout(() => sendSimulatedGesture(socket, sessionId, canvasId, msg.rect), 600);
			}
			return;
		}

		if (msg.type === 'strokeDrawn') {
			console.log(`strokeDrawn ack received, upToT=${msg.upToT}`);
			return;
		}

		if (msg.type === 'recognizeInk') {
			answerRecognition(socket, msg);
			return;
		}
	});

	socket.on('close', () => console.log('Plugin disconnected.'));
});

// Stands in for the companion app's handwriting recognition (InkRecognizer.kt). There's no real
// reading here: each line comes back described by its stroke count, which is enough to exercise
// the plugin's transcript plumbing. The first request in each language pretends to download its
// model, as the real app does once.
const downloadedLanguages = new Set();

function answerRecognition(socket, msg) {
	const reply = (body) => {
		if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ requestId: msg.requestId, ...body }));
	};
	console.log(`recognizeInk: ${msg.lines.length} lines in ${msg.language}`);

	if (msg.language === 'xx-XX') {
		reply({ type: 'inkRecognitionFailed', reason: 'unsupportedLanguage', message: `There's no handwriting model for '${msg.language}'` });
		return;
	}

	const downloading = !downloadedLanguages.has(msg.language);
	if (downloading) {
		downloadedLanguages.add(msg.language);
		reply({ type: 'inkRecognitionStatus', status: 'downloadingModel' });
	}
	setTimeout(() => {
		reply({
			type: 'inkRecognized',
			lines: msg.lines.map((line, i) => `line ${i + 1} with ${line.strokes.length} strokes`),
		});
	}, downloading ? 800 : 150);
}

function sendSimulatedGesture(socket, sessionId, canvasId, rect) {
	if (socket.readyState !== socket.OPEN) return;

	const startX = rect.left + rect.width * 0.2;
	const endX = rect.left + rect.width * 0.7;
	const centerY = rect.top + rect.height * 0.5;
	const amplitude = Math.min(40, rect.height * 0.2);
	const durationMs = 900;
	const stepMs = 15;
	const steps = Math.floor(durationMs / stepMs);

	console.log(`Sending simulated gesture (${steps} points)...`);

	let i = 0;
	const interval = setInterval(() => {
		if (i > steps || socket.readyState !== socket.OPEN) {
			clearInterval(interval);
			return;
		}

		const progress = i / steps;
		const x = startX + (endX - startX) * progress;
		const y = centerY + Math.sin(progress * Math.PI * 3) * amplitude;
		const phase = i === 0 ? 'down' : i === steps ? 'up' : 'move';
		const pressure = 0.4 + 0.3 * Math.sin(progress * Math.PI);

		socket.send(JSON.stringify({
			type: 'strokePoints',
			sessionId,
			canvasId,
			points: [{ x, y, pressure, tilt: 0, isPen: true, phase, t: Date.now() }],
		}));

		i++;
	}, stepMs);
}
