import { Menu } from "obsidian";
import "./overflow-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";

//////////
//////////

export interface menuOption {
    text: string,
    action: Function,
    /** Any Obsidian or Lucide icon id. */
    icon?: string,
    /** Menu items sharing a section are grouped together with a separator. */
    section?: string,
    /**
     * Changes the note itself (its codeblock, or the embed's place in it), or needs the editor.
     * Left out where neither exists to act through, such as an embed shown in reading mode.
     */
    editsNote?: boolean,
    /** Shows a check mark, for options that pick one of several. */
    checked?: boolean,
}

/** Builds a native Obsidian menu from a list of options. */
export function buildMenu(menuOptions: menuOption[]): Menu {
    const menu = new Menu();

    menuOptions.forEach(menuOption => {
        menu.addItem((item) => {
            item.setTitle(menuOption.text);
            if (menuOption.icon) item.setIcon(menuOption.icon);
            if (menuOption.section) item.setSection(menuOption.section);
            if (menuOption.checked !== undefined) item.setChecked(menuOption.checked);
            item.onClick(() => menuOption.action());
        });
    });

    return menu;
}

export const OverflowMenu: React.FC<{
    menuOptions: menuOption[]
}> = (props) => {

    // Built on demand rather than on every render — the menu only exists for as
    // long as it's open, and rebuilding it each render was throwing away a Menu
    // instance per frame while the editor was active.
    const openMenu = (e: React.MouseEvent) => {
        buildMenu(props.menuOptions).showAtMouseEvent(e.nativeEvent);
    };

    return <>
        <div className="inkc_overflow-button-and-menu">
            <button
                className="inkc_btn-slim"
                onClick={openMenu}
                aria-label="More options"
            >
                <OverflowIcon />
            </button>
        </div>
    </>

};

export default OverflowMenu;
