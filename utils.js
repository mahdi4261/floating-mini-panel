/*
 * Floating-Mini-Panel for GNOME Shell 46+
 *
 * Copyright 2024, 2025 Gerhard Himmel
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PANELBOX = Main.layoutManager.panelBox;
const DISPLAY = global.display;

// Helper function for PanelBox Visibility
export function panelBoxHidden() {
    let priMonGeo = priMonitorGeometry();
    if (
        PANELBOX.y < priMonGeo.y ||
        Math.abs(PANELBOX.translation_y) === PANELBOX.height ||
        Math.abs(PANELBOX.translation_x) === PANELBOX.width
    )
        return true;
    return false;
}

// Helper function for Primary Monitor Geometry
export function priMonitorGeometry() {
    let priMon = DISPLAY.get_primary_monitor();
    return DISPLAY.get_monitor_geometry(priMon);
}

// Helper function to calculate correct popup arrow side based on screen position
export function getMenuArrowSide(actor) {
    let parent = actor._parent || actor;
    let isVertical = false;
    if (parent.orientStr) {
        isVertical = Boolean(parent[parent.orientStr]);
    } else if ('vertical' in parent) {
        isVertical = Boolean(parent.vertical);
    }

    let monitor = Main.layoutManager.findMonitorForActor(parent);
    if (!monitor) {
        let priMon = DISPLAY.get_primary_monitor();
        monitor = DISPLAY.get_monitor_geometry(priMon);
    }

    let [panelX, panelY] = parent.get_transformed_position
        ? parent.get_transformed_position()
        : [parent.x, parent.y];

    if (isVertical) {
        let midX = monitor.x + (monitor.width / 2);
        let centerX = panelX + (parent.width / 2);
        return (centerX > midX) ? St.Side.RIGHT : St.Side.LEFT;
    } else {
        let midY = monitor.y + (monitor.height / 2);
        let centerY = panelY + (parent.height / 2);
        return (centerY > midY) ? St.Side.BOTTOM : St.Side.TOP;
    }
}

// Helper function to hook BoxPointer so it never flips off-screen
export function hookBoxPointer(boxPointer, getTargetSide) {
    if (!boxPointer || boxPointer._fmpHooked) return;
    boxPointer._fmpHooked = true;
    boxPointer._origCalculateArrowSide = boxPointer._calculateArrowSide;
    boxPointer._origReposition = boxPointer._reposition;

    // 1. Prevent BoxPointer from flipping to the off-screen side
    boxPointer._calculateArrowSide = function(arrowSide) {
        try {
            let targetSide = getTargetSide();
            if (targetSide !== undefined && targetSide !== null) {
                return targetSide;
            }
        } catch (e) {
            // ignore
        }
        return this._origCalculateArrowSide ? this._origCalculateArrowSide(arrowSide) : arrowSide;
    };

    // 2. Protect _reposition so that resY / resX are kept within monitor work area
    boxPointer._reposition = function(allocationBox) {
        if (this._origReposition) {
            this._origReposition(allocationBox);
        }

        try {
            const workarea = this._workArea;
            if (!workarea) return;

            const themeNode = this.get_theme_node();
            const padding = themeNode.get_length('-arrow-rise');

            let x1 = allocationBox.x1;
            let y1 = allocationBox.y1;
            let x2 = allocationBox.x2;
            let y2 = allocationBox.y2;
            let height = y2 - y1;
            let width = x2 - x1;

            let clampedX = x1;
            let clampedY = y1;

            // Clamping for Y: ensure it is never off the top or off the bottom
            if (this._arrowSide === St.Side.BOTTOM && clampedY < workarea.y + padding) {
                clampedY = workarea.y + padding;
            } else if (this._arrowSide === St.Side.TOP && clampedY + height > workarea.y + workarea.height - padding) {
                clampedY = Math.max(workarea.y + padding, workarea.y + workarea.height - padding - height);
            }

            if (this._arrowSide === St.Side.RIGHT && clampedX < workarea.x + padding) {
                clampedX = workarea.x + padding;
            } else if (this._arrowSide === St.Side.LEFT && clampedX + width > workarea.x + workarea.width - padding) {
                clampedX = Math.max(workarea.x + padding, workarea.x + workarea.width - padding - width);
            }

            if (clampedY !== y1 || clampedX !== x1) {
                allocationBox.set_origin(Math.floor(clampedX), Math.floor(clampedY));
            }
        } catch (e) {
            // ignore
        }
    };
}

export function unhookBoxPointer(boxPointer) {
    if (!boxPointer || !boxPointer._fmpHooked) return;
    if (boxPointer._origCalculateArrowSide) {
        boxPointer._calculateArrowSide = boxPointer._origCalculateArrowSide;
        delete boxPointer._origCalculateArrowSide;
    }
    if (boxPointer._origReposition) {
        boxPointer._reposition = boxPointer._origReposition;
        delete boxPointer._origReposition;
    }
    delete boxPointer._fmpHooked;
}

// Helper function to update arrow side, clamping, and constraints for a menu
export function updateMenuConstraints(button, menu) {
    if (!button || !menu || !menu._boxPointer) return;

    let side = getMenuArrowSide(button);

    menu._arrowSide = side;
    menu._arrowAlignment = 0.5;

    if (typeof menu._boxPointer.updateArrowSide === 'function') {
        menu._boxPointer.updateArrowSide(side);
    } else {
        menu._boxPointer._userArrowSide = side;
        menu._boxPointer._arrowSide = side;
    }

    hookBoxPointer(menu._boxPointer, () => getMenuArrowSide(button));

    let [buttonX, buttonY] = button.get_transformed_position
        ? button.get_transformed_position()
        : [button.x, button.y];
    let [buttonW, buttonH] = button.get_transformed_size
        ? button.get_transformed_size()
        : [button.width, button.height];

    let monitor = Main.layoutManager.findMonitorForActor(button);
    if (!monitor) {
        let priMon = DISPLAY.get_primary_monitor();
        monitor = DISPLAY.get_monitor_geometry(priMon);
    }
    let workArea = (monitor && typeof monitor.index === 'number')
        ? Main.layoutManager.getWorkAreaForMonitor(monitor.index)
        : monitor;
    if (!workArea) {
        let priMon = DISPLAY.get_primary_monitor();
        workArea = DISPLAY.get_monitor_geometry(priMon);
    }

    const MARGIN = 16;
    let availableHeightPx;

    if (side === St.Side.BOTTOM) {
        availableHeightPx = buttonY - workArea.y - MARGIN;
    } else if (side === St.Side.TOP) {
        availableHeightPx = (workArea.y + workArea.height) - (buttonY + buttonH) - MARGIN;
    } else {
        availableHeightPx = workArea.height - (MARGIN * 2);
    }

    const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
    const maxLogicalHeight = Math.max(120, Math.floor(availableHeightPx / scaleFactor));
    const maxStyle = `max-height: ${maxLogicalHeight}px;`;

    menu._boxPointer.style = maxStyle;
    if (menu._boxPointer.bin) {
        menu._boxPointer.bin.style = maxStyle;
    }
    if (menu.box) {
        menu.box.style = maxStyle;
    }
    if (menu.actor && menu.actor !== menu._boxPointer) {
        menu.actor.style = maxStyle;
    }
}

// Helper function to restore a menu to default state
export function restoreMenu(menu, originalSourceActor, originalAlignment) {
    if (!menu) return;
    try {
        menu.close();
    } catch (e) {}

    if (originalSourceActor) {
        menu.sourceActor = originalSourceActor;
    }
    if (originalAlignment !== undefined) {
        menu._arrowAlignment = originalAlignment;
    }
    menu._arrowSide = St.Side.TOP;

    if (menu._boxPointer) {
        if (typeof menu._boxPointer.updateArrowSide === 'function') {
            menu._boxPointer.updateArrowSide(St.Side.TOP);
        } else {
            menu._boxPointer._userArrowSide = St.Side.TOP;
            menu._boxPointer._arrowSide = St.Side.TOP;
        }
        unhookBoxPointer(menu._boxPointer);
        menu._boxPointer.style = null;
        if (menu._boxPointer.bin) {
            menu._boxPointer.bin.style = null;
        }
    }
    if (menu.box) {
        menu.box.style = null;
    }
    if (menu.actor && menu.actor !== menu._boxPointer) {
        menu.actor.style = null;
    }
}
