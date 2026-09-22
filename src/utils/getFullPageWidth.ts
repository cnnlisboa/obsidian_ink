export function getFullPageWidth(childEl: HTMLElement | null): number {
	// When Readable Line Length is enabled, use the narrower content column width.
	// The default theme constrains via .cm-content, while themes like Minimal
	// constrain via .cm-sizer. Check both to find the tightest constraint.
	// .markdown-preview-sizer is the reading mode equivalent of .cm-sizer.
	if(document.body.classList.contains('is-readable-line-width')) {
		const sizerEl = childEl?.closest('.cm-sizer');
		const contentEl = childEl?.closest('.cm-content');
		const readingSizerEl = childEl?.closest('.markdown-preview-sizer');
		const sizerWidth = sizerEl ? (sizerEl as HTMLDivElement).getBoundingClientRect().width : Infinity;
		const contentWidth = contentEl ? (contentEl as HTMLDivElement).getBoundingClientRect().width : Infinity;
		const readingSizerWidth = readingSizerEl ? (readingSizerEl as HTMLDivElement).getBoundingClientRect().width : Infinity;
		const narrowest = Math.min(sizerWidth, contentWidth, readingSizerWidth);
		if(narrowest !== Infinity) return narrowest;
	}

	// .cm-scroller only exists in Live Preview. Reading mode scrolls .markdown-preview-view,
	// but its column is .markdown-preview-sizer, so that's what an embed has to fit inside —
	// measuring the scroller there would overshoot by the view's padding.
	const readingColumnEl = childEl?.closest('.markdown-preview-sizer');
	if(readingColumnEl) {
		const readingWidth = (readingColumnEl as HTMLDivElement).getBoundingClientRect().width;
		if(readingWidth > 0) return readingWidth;
	}

	const visiblePageAreaEl = childEl?.closest('.cm-scroller');
	if(!visiblePageAreaEl) return 500; // Average number for edge cases where the childEl might not be defined yet
	const maxWidth = (visiblePageAreaEl as HTMLDivElement).getBoundingClientRect().width;
	return maxWidth;
}
