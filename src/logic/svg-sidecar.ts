import { TAbstractFile, TFile } from "obsidian";
import InkPlugin from "src/main";
import { DRAW_FILE_EXT, WRITE_FILE_EXT } from "src/constants";
import { InkFileData } from "src/utils/page-file";
import { warn } from "src/utils/log-to-console";

/////////
/////////

// An SVG copy of each writing and drawing file, kept beside it, so the ink can be seen, exported
// and published without this plugin. The ink file stays the source of truth; the copy is
// rewritten from it. Notebooks are left out: one SVG can't stand for several pages.
const SIDECAR_EXTS = [WRITE_FILE_EXT, DRAW_FILE_EXT];

// A copy is written once a file has gone this long without changing, so nothing runs while the
// user is still writing and saves are landing every half second.
const SETTLE_MS = 3000;

/**
 * `Note.inkcwriting` → `Note.inkcwriting.svg`: plainly paired with its ink file, and never the
 * same name as an SVG the user made themselves.
 */
export function getSidecarPath(inkFilePath: string): string {
	return `${inkFilePath}.svg`;
}

function isSidecarSource(file: TAbstractFile): file is TFile {
	return file instanceof TFile && SIDECAR_EXTS.includes(file.extension);
}

export function registerSvgSidecars(plugin: InkPlugin) {
	const { vault } = plugin.app;
	const timers = new Map<string, number>();

	plugin.registerEvent(vault.on('modify', (file) => {
		if (!plugin.settings.saveSvgSidecar || !isSidecarSource(file)) return;
		window.clearTimeout(timers.get(file.path));
		timers.set(file.path, window.setTimeout(() => {
			timers.delete(file.path);
			writeSvgSidecar(plugin, file).catch((e) => warn(['Could not save SVG copy', file.path, e]));
		}, SETTLE_MS));
	}));

	// A copy follows its ink file whether or not new copies are still being made, so turning the
	// setting off never leaves orphans behind.
	plugin.registerEvent(vault.on('rename', async (file, oldPath) => {
		if (!isSidecarSource(file)) return;
		const sidecar = vault.getAbstractFileByPath(getSidecarPath(oldPath));
		if (!(sidecar instanceof TFile)) return;
		try {
			await plugin.app.fileManager.renameFile(sidecar, getSidecarPath(file.path));
		} catch (e) {
			warn(['Could not rename SVG copy', sidecar.path, e]);
		}
	}));

	plugin.registerEvent(vault.on('delete', async (file) => {
		if (!isSidecarSource(file)) return;
		const sidecar = vault.getAbstractFileByPath(getSidecarPath(file.path));
		if (!(sidecar instanceof TFile)) return;
		try {
			await plugin.app.fileManager.trashFile(sidecar);
		} catch (e) {
			warn(['Could not delete SVG copy', sidecar.path, e]);
		}
	}));

	plugin.register(() => timers.forEach((timer) => window.clearTimeout(timer)));
}

/** Writes copies for every writing and drawing file with an up-to-date preview. Returns how many. */
export async function writeAllSvgSidecars(plugin: InkPlugin): Promise<number> {
	let written = 0;
	for (const file of plugin.app.vault.getFiles()) {
		if (!isSidecarSource(file)) continue;
		try {
			if (await writeSvgSidecar(plugin, file)) written++;
		} catch (e) {
			warn(['Could not save SVG copy', file.path, e]);
		}
	}
	return written;
}

/**
 * Brings `file`'s copy up to date. Skipped while its preview is outdated — mid-session saves on
 * e-ink don't regenerate it — since the copy would show stale ink; the next full save catches up.
 */
async function writeSvgSidecar(plugin: InkPlugin, file: TFile): Promise<boolean> {
	const { vault } = plugin.app;
	// Deleted or renamed while waiting to settle.
	if (vault.getAbstractFileByPath(file.path) !== file) return false;

	let pageData: InkFileData;
	try {
		pageData = JSON.parse(await vault.read(file));
	} catch {
		return false;
	}
	if (!pageData.previewUri || pageData.meta?.previewIsOutdated) return false;

	const svg = toStandaloneSvg(pageData.previewUri);
	const path = getSidecarPath(file.path);
	const existing = vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		if (await vault.read(existing) === svg) return false;
		await vault.modify(existing, svg);
	} else if (!existing) {
		await vault.create(path, svg);
	} else {
		return false;
	}
	return true;
}

// A preview keeps the colours of the theme it was saved in, so black ink saved in dark mode is
// near-white — invisible on the light pages most viewers and exports use. It's put back to black.
// Coloured inks are the same in both themes and left alone.
function toStandaloneSvg(previewSvg: string): string {
	return previewSvg.replace(/#f2f2f2/gi, '#1d1d1d');
}
