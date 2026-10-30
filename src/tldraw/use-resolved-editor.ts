import * as React from "react";
import { Editor } from "@tldraw/tldraw";

//////////
//////////

/**
 * Resolves the tldraw editor for components rendered alongside it — the menus sit next to
 * <TldrawEditor>, so on their first render the editor usually hasn't mounted yet and the
 * getter returns undefined. Rather than guessing with a fixed delay, this checks once per
 * frame until the editor exists, then re-renders with it so the caller can subscribe to its
 * reactive state with `useValue`.
 *
 * tldraw disposes its editor and builds a new one whenever <TldrawEditor>'s creation inputs
 * change, so a resolved editor is let go again once disposed and its successor is looked up the
 * same way. Holding on would leave the caller rendering against a dead instance.
 */
export function useResolvedEditor(getTlEditor: () => Editor | undefined): Editor | undefined {
	const [editor, setEditor] = React.useState<Editor | undefined>(() => getTlEditor());

	React.useEffect(() => {
		if (editor) {
			if (editor.isDisposed) {
				setEditor(undefined);
				return;
			}
			const release = () => setEditor(undefined);
			editor.disposables.add(release);
			return () => { editor.disposables.delete(release); };
		}

		let frame = 0;
		const poll = () => {
			const resolved = getTlEditor();
			if (resolved) {
				setEditor(resolved);
			} else {
				frame = requestAnimationFrame(poll);
			}
		};
		frame = requestAnimationFrame(poll);
		return () => cancelAnimationFrame(frame);
	}, [editor]);

	return editor;
}
