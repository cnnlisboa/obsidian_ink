import { Platform } from "obsidian";
import InkPlugin from "src/main";
import { recordAllScrollerMargins } from "./embed";

/////////
/////////

export const FULL_WIDTH_WRITING_BODY_CLASS = 'inkc_full-width-writing';

/**
 * Tags the body while writing embeds should be full width: square, unframed, and out to the
 * edges of the text column, like a page in a note-taking app. The stylesheet does the rest (see
 * writing-embed.scss), so notes already open switch over without being reopened.
 *
 * Run again whenever the setting changes.
 */
export function applyWritingEmbedStyle(plugin: InkPlugin) {
	const style = plugin.settings.writingEmbedStyle;
	const fullWidth = style === 'fullWidth' || (style === 'fullWidthOnMobile' && Platform.isMobile);
	document.body.toggleClass(FULL_WIDTH_WRITING_BODY_CLASS, fullWidth);
}

/**
 * Applies the writing embed style now, and removes it again when the plugin unloads. Embeds are
 * measured again as panes change width, so they keep reaching the edges only where that's right.
 * The workspace's resize also fires on switching tabs, which is when a background note is first
 * laid out to measure.
 */
export function registerWritingEmbedStyle(plugin: InkPlugin) {
	applyWritingEmbedStyle(plugin);
	plugin.register(() => document.body.removeClass(FULL_WIDTH_WRITING_BODY_CLASS));
	plugin.registerEvent(plugin.app.workspace.on('resize', recordAllScrollerMargins));
}
