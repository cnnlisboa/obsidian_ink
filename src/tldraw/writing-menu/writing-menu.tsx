import "./writing-menu.scss";
import * as React from "react";
import { WriteIcon } from "src/graphics/icons/write-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { LassoIcon } from "src/graphics/icons/lasso-icon";
import { DeleteIcon } from "src/graphics/icons/delete-icon";
import { TouchIcon } from "src/graphics/icons/touch-icon";
import { HighlighterIcon } from "src/graphics/icons/highlighter-icon";
import { DefaultColorStyle, DefaultSizeStyle, Editor, TLDefaultColorStyle, TLDefaultSizeStyle, getDefaultColorTheme, useValue } from "@tldraw/tldraw";
import classNames from "classnames";
import InkPlugin from "src/main";
import { useResolvedEditor } from "../use-resolved-editor";
import { ToolButton } from "../tool-button/tool-button";
import { PenPalette } from "../pen-palette/pen-palette";

//////////
//////////

// One size for every highlighter stroke: wide enough to cover a line of handwriting, which is
// the only thing it's for here.
const HIGHLIGHTER_SIZE: TLDefaultSizeStyle = 'l';

type Palette = 'pen' | 'highlighter';

interface WritingMenuProps {
    plugin: InkPlugin,
    getTlEditor: () => Editor | undefined,
    stylusOnly: boolean,
    onToggleStylusOnly: () => void,
    /** Called when the menu's own footprint changes, e.g. a palette opening over the canvas. */
    onChromeChange?: () => void,
}

export const WritingMenu = (props: WritingMenuProps) => {

    const menuElRef = React.useRef<HTMLDivElement>(null);
    const editor = useResolvedEditor(props.getTlEditor);
    // Read from the editor rather than remembered here, so the highlight follows the tool whatever
    // changed it — including the pen's eraser button, which swaps tools for the length of a stroke.
    const curToolId = useValue('current tool', () => editor?.getCurrentToolId(), [editor]);
    const isDarkMode = useValue('dark mode', () => editor?.user.getIsDarkMode() ?? false, [editor]);
    const hasSelection = useValue('has selection', () => (editor?.getSelectedShapeIds().length ?? 0) > 0, [editor]);
    const theme = getDefaultColorTheme({ isDarkMode });

    const settings = props.plugin.settings;
    const [penColor, setPenColor] = React.useState<TLDefaultColorStyle>(settings.writingPenColor);
    const [penSize, setPenSize] = React.useState<TLDefaultSizeStyle>(settings.writingPenSize);
    const [highlighterColor, setHighlighterColor] = React.useState<TLDefaultColorStyle>(settings.writingHighlighterColor);
    const [openPalette, setOpenPalette] = React.useState<Palette | null>(null);

    // The editor starts on the pen, so it takes the pen's ink as soon as there is an editor.
    React.useEffect(() => {
        if (editor) applyInk(editor, editor.getCurrentToolId());
    }, [editor]);

    React.useEffect(() => {
        props.onChromeChange?.();
    }, [openPalette]);

    ///////////

    // Pen and highlighter share tldraw's one set of next-shape styles, so each tool's own ink is
    // put back whenever it's picked up.
    function applyInk(editor: Editor, toolId: string, ink?: { color: TLDefaultColorStyle, size: TLDefaultSizeStyle }) {
        let style = ink;
        if (!style && toolId === 'draw') style = { color: penColor, size: penSize };
        if (!style && toolId === 'highlight') style = { color: highlighterColor, size: HIGHLIGHTER_SIZE };
        if (!style) return;
        const { color, size } = style;
        editor.run(() => {
            editor.setStyleForNextShapes(DefaultColorStyle, color);
            editor.setStyleForNextShapes(DefaultSizeStyle, size);
        }, { history: 'ignore' });
    }

    function activateTool(toolId: string) {
        const editor = props.getTlEditor();
        if (!editor) return;
        setOpenPalette(null);
        editor.setCurrentTool(toolId);
        applyInk(editor, toolId);
    }

    // Pressing the pen or highlighter once picks it up; pressing it again, already in hand, opens
    // its palette.
    function pressInkTool(toolId: 'draw' | 'highlight', palette: Palette) {
        if (curToolId === toolId) {
            setOpenPalette(openPalette === palette ? null : palette);
        } else {
            activateTool(toolId);
        }
    }

    // There's no keyboard to press Delete on a tablet, so a selection brings its own button.
    function deleteSelection() {
        const editor = props.getTlEditor();
        if (!editor) return;
        const ids = editor.getSelectedShapeIds();
        if (!ids.length) return;
        editor.mark('deleting selection');
        editor.deleteShapes(ids);
    }

    function choosePenColor(color: TLDefaultColorStyle) {
        setPenColor(color);
        settings.writingPenColor = color;
        props.plugin.saveSettings();
        const editor = props.getTlEditor();
        if (editor) applyInk(editor, 'draw', { color, size: penSize });
    }

    function choosePenSize(size: TLDefaultSizeStyle) {
        setPenSize(size);
        settings.writingPenSize = size;
        props.plugin.saveSettings();
        const editor = props.getTlEditor();
        if (editor) applyInk(editor, 'draw', { color: penColor, size });
    }

    function chooseHighlighterColor(color: TLDefaultColorStyle) {
        setHighlighterColor(color);
        settings.writingHighlighterColor = color;
        props.plugin.saveSettings();
        const editor = props.getTlEditor();
        if (editor) applyInk(editor, 'highlight', { color, size: HIGHLIGHTER_SIZE });
    }

    ///////////
    ///////////

    return <>
        <div
            ref = {menuElRef}
            className = {classNames([
                'ink_menu-bar',
                'ink_menu-bar_full',
            ])}
        >
            <div
                className='ink_tool-menu'
            >
                <ToolButton
                    label = "Lasso select"
                    pressed = {curToolId === 'select'}
                    onPress = {() => activateTool('select')}
                >
                    <LassoIcon/>
                </ToolButton>
                <ToolButton
                    label = {curToolId === 'draw' ? "Pen — press again for ink" : "Pen"}
                    pressed = {curToolId === 'draw'}
                    onPress = {() => pressInkTool('draw', 'pen')}
                >
                    <WriteIcon/>
                    <span className="inkc_tool-ink-dot" style={{ backgroundColor: theme[penColor].solid }}/>
                </ToolButton>
                <ToolButton
                    label = {curToolId === 'highlight' ? "Highlighter — press again for colour" : "Highlighter"}
                    pressed = {curToolId === 'highlight'}
                    onPress = {() => pressInkTool('highlight', 'highlighter')}
                >
                    <HighlighterIcon/>
                    <span className="inkc_tool-ink-dot" style={{ backgroundColor: theme[highlighterColor].highlight.srgb }}/>
                </ToolButton>
                <ToolButton
                    label = "Eraser"
                    pressed = {curToolId === 'eraser'}
                    onPress = {() => activateTool('eraser')}
                >
                    <EraseIcon/>
                </ToolButton>
                {hasSelection && (
                    <ToolButton
                        label = "Delete selection"
                        onPress = {deleteSelection}
                    >
                        <DeleteIcon/>
                    </ToolButton>
                )}
                <ToolButton
                    label = {props.stylusOnly ? "Finger writing off — tap to allow" : "Finger writing on — tap for stylus only"}
                    pressed = {!props.stylusOnly}
                    onPress = {props.onToggleStylusOnly}
                >
                    <TouchIcon/>
                </ToolButton>

                {openPalette === 'pen' && (
                    <PenPalette
                        kind = "pen"
                        color = {penColor}
                        size = {penSize}
                        isDarkMode = {isDarkMode}
                        onColorChange = {choosePenColor}
                        onSizeChange = {choosePenSize}
                        onDismiss = {() => setOpenPalette(null)}
                        ignoreWithin = {menuElRef}
                    />
                )}
                {openPalette === 'highlighter' && (
                    <PenPalette
                        kind = "highlighter"
                        color = {highlighterColor}
                        isDarkMode = {isDarkMode}
                        onColorChange = {chooseHighlighterColor}
                        onDismiss = {() => setOpenPalette(null)}
                        ignoreWithin = {menuElRef}
                    />
                )}
            </div>
        </div>
    </>;

};

export default WritingMenu;
