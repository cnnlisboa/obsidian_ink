import { Editor, MarkdownFileInfo, MarkdownView, Notice } from "obsidian";
import InkPlugin from "src/main";
import { closeOpenEmbed } from "src/logic/open-embed";
import { TranscriptionError, canTranscribe, describeTranscriptionError, getSearchableTranscript, transcribeWritingFile } from "src/logic/transcription";
import { findInkEmbedsInNote, setWritingEmbedTranscripts } from "src/utils/embed-usage";

////////
////////

/**
 * Transcribes every handwriting section in the note being edited and writes the text into their
 * codeblocks — for writing that predates transcription, or after changing its language. Ink that
 * was already read, and hasn't changed since, isn't read again.
 */
export async function transcribeNoteHandwriting(plugin: InkPlugin, editor: Editor, view: MarkdownView | MarkdownFileInfo) {
	const notePath = view.file?.path;
	if (!notePath) return;

	if (!canTranscribe(plugin)) {
		new Notice("Ink: transcription is done by the companion app. Turn on the companion bridge in Ink's settings and run the app.");
		return;
	}

	// Rewriting a codeblock rebuilds its embed, which mustn't close an editor out from under the
	// user, so the open one (if any) is saved and closed first.
	await closeOpenEmbed();

	const writings = findInkEmbedsInNote(plugin, editor.getValue(), notePath).filter(embed => embed.filetype === 'writing');
	if (!writings.length) {
		new Notice('Ink: there are no handwriting sections in this note.');
		return;
	}

	const progress = new Notice(`Ink: transcribing ${writings.length} handwriting ${writings.length === 1 ? 'section' : 'sections'}…`, 0);
	const transcripts = new Map<string, string>();
	let failure: unknown;
	let downloadNoticeShown = false;
	for (const { inkFile } of writings) {
		try {
			transcripts.set(inkFile.path, getSearchableTranscript(await transcribeWritingFile(plugin, inkFile, {
				onDownloadingModel: () => {
					if (downloadNoticeShown) return;
					downloadNoticeShown = true;
					new Notice('Ink: downloading the handwriting model. This happens once and can take a minute.');
				},
			})));
		} catch (e) {
			failure = e;
			// Every other section would fail the same way.
			if (e instanceof TranscriptionError && (e.reason === 'unavailable' || e.reason === 'noAnswer')) break;
		}
	}

	setWritingEmbedTranscripts(plugin, editor, notePath, transcripts);
	progress.hide();

	if (failure && !transcripts.size) {
		new Notice(`Ink: couldn't transcribe. ${describeTranscriptionError(failure)}`);
	} else if (failure) {
		new Notice(`Ink: transcribed ${transcripts.size} of ${writings.length} sections. ${describeTranscriptionError(failure)}`);
	} else {
		new Notice(`Ink: transcribed ${transcripts.size} handwriting ${transcripts.size === 1 ? 'section' : 'sections'}.`);
	}
}
