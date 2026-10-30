import InkPlugin from "src/main";

/////////
/////////

/**
 * An embed whose editor is open. Only one is open at a time, app-wide — the way Obsidian only
 * ever edits one table or code block at once — and it closes again when the user taps anywhere
 * else, saving on the way out.
 */
export interface OpenEmbed {
	/** The embed's outermost element. Taps inside it never close it. */
	containerEl: HTMLElement,
	/** Saves and returns the embed to its preview. Safe to call more than once. */
	close: () => void | Promise<void>,
}

let openEmbed: OpenEmbed | null = null;

/** Makes `embed` the open one, closing whichever embed was open before it. */
export function claimOpenEmbed(embed: OpenEmbed) {
	const previous = openEmbed;
	openEmbed = embed;
	if (previous && previous !== embed) previous.close();
}

export function releaseOpenEmbed(embed: OpenEmbed) {
	if (openEmbed === embed) openEmbed = null;
}

/** Saves and closes whichever embed is open, if any. */
export async function closeOpenEmbed(): Promise<void> {
	await openEmbed?.close();
}

//////////
//////////

// A tap is a contact that neither travels nor lingers. Anything else outside the embed is a
// scroll, a drag or a long-press, none of which should close it.
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 500;

// Writing near an embed's edge routinely lands a dot — the tittle of an i, a full stop — just
// past it. A pen tap that close is still writing, not a request to stop.
const PEN_OVERSHOOT_PX = 48;

// A hand resting on the screen while writing registers as touches. They're told apart from a
// deliberate finger tap by their size, or by arriving while the pen is in use.
const PALM_CONTACT_PX = 40;
const PEN_RECENT_MS = 1000;

// Everything Obsidian layers over the page — menus, modals, notices, suggestion lists. These are
// usually the open embed's own (its overflow menu, its display modal), so touching one mustn't
// close the embed that opened it.
const OVERLAY_SELECTOR = '.menu, .modal-container, .notice-container, .suggestion-container, .prompt';

/**
 * Closes the open embed when the user taps outside it. Watches pointer events in the capture
 * phase on every Obsidian window's document, so nothing inside the page can stop it seeing them.
 */
export function registerOpenEmbedDismissal(plugin: InkPlugin) {
	let lastPenAt = 0;
	let pending: { pointerId: number, target: EventTarget | null, x: number, y: number, at: number } | null = null;

	const onPointerDown = (e: PointerEvent) => {
		if (e.pointerType === 'pen') lastPenAt = Date.now();
		pending = openEmbed
			? { pointerId: e.pointerId, target: e.target, x: e.clientX, y: e.clientY, at: Date.now() }
			: null;
	};

	const onPointerMove = (e: PointerEvent) => {
		// Includes hovering, which on most styluses is reported before the pen touches down.
		if (e.pointerType === 'pen') lastPenAt = Date.now();
	};

	const onPointerCancel = () => {
		pending = null;
	};

	const onPointerUp = (e: PointerEvent) => {
		const down = pending;
		pending = null;
		if (e.pointerType === 'pen') lastPenAt = Date.now();

		const embed = openEmbed;
		if (!embed || !down || down.pointerId !== e.pointerId) return;
		if (!plugin.settings.closeEditorOnTapOutside) return;

		const travelled = Math.hypot(e.clientX - down.x, e.clientY - down.y);
		if (travelled > TAP_SLOP_PX || Date.now() - down.at > TAP_MAX_MS) return;

		const target = down.target;
		if (target instanceof Node && embed.containerEl.contains(target)) return;
		if (target instanceof Element && target.closest(OVERLAY_SELECTOR)) return;

		if (e.pointerType === 'pen' && isNear(embed.containerEl, e.clientX, e.clientY, PEN_OVERSHOOT_PX)) return;
		if (e.pointerType === 'touch') {
			const palmSized = e.width > PALM_CONTACT_PX || e.height > PALM_CONTACT_PX;
			const penInUse = down.at - lastPenAt < PEN_RECENT_MS;
			if (palmSized || penInUse) return;
		}

		embed.close();
	};

	const listen = (doc: Document) => {
		plugin.registerDomEvent(doc, 'pointerdown', onPointerDown, { capture: true });
		plugin.registerDomEvent(doc, 'pointermove', onPointerMove, { capture: true, passive: true });
		plugin.registerDomEvent(doc, 'pointerup', onPointerUp, { capture: true });
		plugin.registerDomEvent(doc, 'pointercancel', onPointerCancel, { capture: true });
	};

	listen(document);
	plugin.registerEvent(plugin.app.workspace.on('window-open', (win) => listen(win.doc)));
	plugin.register(() => { openEmbed = null; });
}

function isNear(el: HTMLElement, x: number, y: number, margin: number): boolean {
	const r = el.getBoundingClientRect();
	return x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin;
}
