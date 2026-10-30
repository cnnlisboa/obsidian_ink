import * as React from "react";
import { OpenEmbed, claimOpenEmbed, releaseOpenEmbed } from "src/logic/open-embed";
import { isInReadingMode } from "src/utils/embed";
import { embedShouldActivateImmediately } from "src/utils/storage";

//////////
//////////

interface EditorControls {
	saveAndHalt: () => Promise<void> | void,
}

/**
 * Opening and closing an embed's editor, shared by the writing, notebook and drawing embeds.
 *
 * - Opening an embed closes whichever other embed was open (see open-embed.ts).
 * - Closing saves first, and is safe to call at any point: twice, while already closing, or
 *   while the editor is still loading, in which case it closes the moment the editor mounts
 *   rather than racing it.
 * - A newly inserted embed opens straight into its editor once it's actually on the page.
 */
export function useEmbedEditor<C extends EditorControls>(props: {
	containerElRef: React.RefObject<HTMLElement>,
	/** Switches the embed to its loading-editor state. */
	showEditor: () => void,
	/** Switches the embed to its loading-preview state, once the editor has saved. */
	showPreview: () => void,
}) {
	// Everything below is reached through refs, because the close handle registered with
	// claimOpenEmbed is called long after the render that created it.
	const propsRef = React.useRef(props);
	propsRef.current = props;

	const controlsRef = React.useRef<C>();
	const isOpenRef = React.useRef(false);
	const closingRef = React.useRef(false);
	const closeRequestedRef = React.useRef(false);
	const handleRef = React.useRef<OpenEmbed>();

	function getHandle(): OpenEmbed | undefined {
		const containerEl = propsRef.current.containerElRef.current;
		if (!containerEl) return;
		if (handleRef.current?.containerEl !== containerEl) {
			handleRef.current = { containerEl, close: () => { void close(); } };
		}
		return handleRef.current;
	}

	function open() {
		const containerEl = propsRef.current.containerElRef.current;
		if (!containerEl) return;
		// Reading mode has no editor to switch into and no editor to write changes back
		// through, so the embed stays a static preview there. Checked live rather than at
		// mount because Obsidian renders preview sections detached before inserting them.
		if (isInReadingMode(containerEl)) return;
		// Already open, or still saving on its way closed.
		if (isOpenRef.current) return;

		const handle = getHandle();
		if (!handle) return;
		isOpenRef.current = true;
		closeRequestedRef.current = false;
		claimOpenEmbed(handle);
		propsRef.current.showEditor();
	}

	async function close(): Promise<void> {
		if (!isOpenRef.current || closingRef.current) return;

		const controls = controlsRef.current;
		if (!controls) {
			// Still loading. Switching back now would race the editor's mount, which sets the
			// embed's state itself, so this is picked up in registerEditorControls instead.
			closeRequestedRef.current = true;
			return;
		}

		closingRef.current = true;
		if (handleRef.current) releaseOpenEmbed(handleRef.current);
		try {
			await controls.saveAndHalt();
		} finally {
			// Cleared so a later close can't call into this editor once it has unmounted.
			controlsRef.current = undefined;
			closingRef.current = false;
			isOpenRef.current = false;
			propsRef.current.showPreview();
		}
	}

	function registerEditorControls(controls: C) {
		controlsRef.current = controls;
		if (closeRequestedRef.current) {
			closeRequestedRef.current = false;
			// Deferred out of the editor's onMount, which is still running when it registers.
			setTimeout(() => { void close(); }, 0);
		}
	}

	React.useEffect(() => {
		let frame = 0;
		if (embedShouldActivateImmediately()) {
			// A new embed is rendered before CodeMirror puts it on the page, and the editor sizes
			// its camera from the embed's width, so wait until there is one.
			let attempts = 0;
			const openWhenLaidOut = () => {
				const containerEl = propsRef.current.containerElRef.current;
				if (containerEl?.isConnected && containerEl.offsetWidth > 0) {
					open();
				} else if (++attempts < 120) {
					frame = requestAnimationFrame(openWhenLaidOut);
				}
			};
			frame = requestAnimationFrame(openWhenLaidOut);
		}

		return () => {
			cancelAnimationFrame(frame);
			if (handleRef.current) releaseOpenEmbed(handleRef.current);
		};
	}, []);

	return { open, close, registerEditorControls };
}
