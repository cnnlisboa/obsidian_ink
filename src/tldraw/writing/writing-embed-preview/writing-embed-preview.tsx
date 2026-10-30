import classNames from 'classnames';
import './writing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { PrimaryMenuBar } from 'src/tldraw/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/tldraw/transition-menu/transition-menu';
import InkPlugin from 'src/main';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { WritingEmbedState, embedStateAtom, previewActiveAtom } from '../writing-embed';
import { TFile } from 'obsidian';
import { getInkFileData } from 'src/utils/getInkFileData';
import { CollapseIcon } from 'src/graphics/icons/collapse-icon';
import { FullscreenIcon } from 'src/graphics/icons/fullscreen-icon';
import { menuOption } from 'src/tldraw/overflow-menu/overflow-menu';
import { useEmbedContextMenu } from 'src/tldraw/use-embed-context-menu';
import { InkPreview, getInkPreview } from 'src/utils/page-file';
import { PageLayout, getPagePreviewSvg } from 'src/logic/writing-pages';
import { AddPageIcon } from 'src/tldraw/page-controls/page-controls';
const emptyWritingSvg = require('../../../placeholders/empty-writing-embed.svg');

//////////
//////////

interface WritingEmbedPreviewProps {
    plugin: InkPlugin,
    onResize: Function,
    writingFile: TFile,
    onClick: React.MouseEventHandler,
    onCollapseClick?: () => void,
    onFullscreenClick?: () => void,
    /** Renders the writing smaller within the embed. See WritingEmbedData.scale. */
    scale?: number,
    /** Offered on right-click or long-press. See useEmbedContextMenu. */
    menuOptions?: menuOption[],
    /** In a paged writing, its layout and the page to show (from 0). See writing-pages.ts. */
    layout?: PageLayout,
    page?: number,
    /** Offered on a writing that's still one sheet. Adding a page splits it into pages. */
    onAddPageClick?: () => void,
}

// Wraps the component so that it can full unmount when inactive
export const WritingEmbedPreviewWrapper: React.FC<WritingEmbedPreviewProps> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom);
    //console.log('PREVIEW ACTIVE', previewActive)

    if (previewActive) {
        return <WritingEmbedPreview {...props} />
    } else {
        return <></>
    }
}

const WritingEmbedPreview: React.FC<WritingEmbedPreviewProps> = (props) => {
    //console.log('PREVIEW rendering');

    const containerElRef = React.useRef<HTMLDivElement>(null);
    const setEmbedState = useSetAtom(embedStateAtom);
    const [preview, setPreview] = React.useState<InkPreview>();
    const contextMenu = useEmbedContextMenu(() => props.menuOptions ?? [], containerElRef);

    // Read once: the preview is remounted each time the editor closes, which is when it changes.
    // It used to be reread on every render, which turning pages would make costly on a long file.
    React.useEffect(() => {
        fetchFileData();
    }, [])

    const fileSrc = (props.layout && props.page !== undefined
        ? preview && getPagePreviewSvg(preview, props.layout, props.page)
        : preview?.previewUri
    ) || emptyWritingSvg;

    // Check if src is a DataURI. If not, it's an SVG
    const isImg = fileSrc.slice(0, 4) === 'data';

    return <>
        <div
            ref={containerElRef}
            className={classNames([
                'inkc_writing-embed-preview',
                props.plugin.settings.writingLinesWhenLocked && 'inkc_visible-lines',
                props.plugin.settings.writingBackgroundWhenLocked && 'inkc_visible-background',
            ])}
            style={{
                position: 'absolute',
                // Narrowing the preview shrinks it proportionally, and the measured height that
                // drives the container's size shrinks with it - which is the point of scaling.
                width: `${Math.max(0.1, Math.min(1, props.scale ?? 1)) * 100}%`,
            }}
            onClick={(e) => {
                e.stopPropagation();
                if (contextMenu.consumeClick()) return;
                props.onClick(e);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            {...(props.menuOptions ? contextMenu.handlers : {})}

            // Not currently doing this cause it can mean users easily lose their undo history
            // onMouseUp = {props.onEditClick}
            // onMouseEnter = {props.onClick}
        >
            {isImg && (<>
                <img
                    src={fileSrc}
                    style={{
                        width: '100%',
                        cursor: 'pointer',
                        pointerEvents: 'all',
                    }}
                    onLoad={onLoad}
                />
            </>)}

            {!isImg && (<>
                <SVG
                    src={fileSrc}
                    style={{
                        width: '100%',
                        height: 'unset',
                        cursor: 'pointer'
                    }}
                    pointerEvents="visible"
                    onLoad={onLoad}
                />
            </>)}

            <div className="inkc_preview-buttons">
                {props.onAddPageClick && (
                    <button
                        className="inkc_collapse-btn"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            props.onAddPageClick?.();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Add page"
                    >
                        <AddPageIcon />
                    </button>
                )}
                {props.onFullscreenClick && (
                    <button
                        className="inkc_collapse-btn"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            props.onFullscreenClick?.();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Open fullscreen"
                    >
                        <FullscreenIcon />
                    </button>
                )}
                {props.onCollapseClick && (
                    <button
                        className="inkc_collapse-btn"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            props.onCollapseClick?.();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Collapse embed"
                    >
                        <CollapseIcon />
                    </button>
                )}
            </div>

        </div>
    </>;

    // Helper functions
    ///////////////////

    function onLoad() {
        recalcHeight();
        // Slight delay on transition because otherwise a flicker is sometimes seen
        setTimeout(() => {
            //console.log('--------------- SET EMBED STATE TO preview')
            // Only finishes a switch back from the editor. If the editor was opened while this image
            // was still loading, the editor wins; forcing preview here used to cancel it.
            setEmbedState((state) => state === WritingEmbedState.loadingPreview ? WritingEmbedState.preview : state);
        }, 100);
    }

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.plugin, props.writingFile)
        setPreview(getInkPreview(inkFileData));
    }

    function recalcHeight() {
        if (!containerElRef.current) return;
        
        // Only run when embed is first in view area and then stop.
        // This makes sure it has been rendered and has a height.
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.target !== containerElRef.current) return;
                if (!entry.isIntersecting) return;

                const rect = containerElRef.current.getBoundingClientRect();
                props.onResize(rect.height);
                observer.unobserve(containerElRef.current);
            });
        });
        observer.observe(containerElRef.current);

    }

};