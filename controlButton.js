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

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Utils from './utils.js';

const DISPLAY = global.display;
const OVERVIEW = Main.overview;

const shellVersion = parseFloat(Config.PACKAGE_VERSION);

const Alignment = {
    NONE: 0,
    TOP: 1,
    BOTTOM: 2,
    LEFT: 4,
    RIGHT: 8,
    CENTER: 16,
};

function setCursor(type) {
    try {
        if (typeof global !== 'undefined' && global.stage && typeof global.stage.set_cursor_type === 'function') {
            let cursorType = (type === 'move')
                ? (Clutter.CursorType?.MOVE ?? Clutter.CursorType?.ALL_SCROLL ?? Clutter.CursorType?.DEFAULT ?? 0)
                : (Clutter.CursorType?.DEFAULT ?? 0);
            global.stage.set_cursor_type(cursorType);
        } else if (DISPLAY && typeof DISPLAY.set_cursor === 'function' && typeof Meta !== 'undefined' && Meta?.Cursor) {
            let cursor = Meta.Cursor.DEFAULT;
            if (type === 'move') {
                cursor = (shellVersion < 47) ? Meta.Cursor.MOVE_OR_RESIZE_WINDOW : Meta.Cursor.MOVE;
            }
            DISPLAY.set_cursor(cursor);
        }
    } catch (e) {
        // ignore cursor setting errors
    }
}

export const CtlActions = GObject.registerClass(
    class CtlActions extends Clutter.Action {
        constructor(actor) {
            super();
            this._actor = actor;
            this._parent = this._actor._parent || this._actor;
            this._click = false;
            this._longpress = false;
            this._grab = null;
        }

        vfunc_handle_event(event) {
            switch (event.type()) {
                case Clutter.EventType.MOTION:
                    // Execute Drag
                    if (this._grab !== null) {
                        let [x, y] = event.get_coords();
                        let newX = Math.ceil(x - (this._dragOffsetX ?? (this._actor.width / 2)));
                        let newY = Math.ceil(y - (this._dragOffsetY ?? (this._actor.height / 2)));
                        this._parent.set_position(newX, newY);
                    }
                    break;
                case Clutter.EventType.BUTTON_PRESS:
                    // Test longpress
                    if (this._timeoutId) {
                        GLib.Source.remove(this._timeoutId);
                        this._timeoutId = null;
                    }
                    let pressCoords = event.get_coords();
                    this._timeoutId = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT,
                        250,
                        () => {
                            if (!this._click) {
                                this._longpress = true;
                                // Ignoring modifier keys (event.get_state())
                                switch (event.get_button()) {
                                    case Clutter.BUTTON_PRIMARY:
                                        this._leftBtnLongPress(pressCoords);
                                        break;
                                    case Clutter.BUTTON_MIDDLE:
                                        this._middleBtnLongPress();
                                        break;
                                    case Clutter.BUTTON_SECONDARY:
                                        this._rightBtnLongPress();
                                        break;
                                    default:
                                        break;
                                }
                            }
                            this._timeoutId = null;
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                    break;
                case Clutter.EventType.BUTTON_RELEASE:
                    // Button released after longpress
                    if (this._longpress) {
                        // End Drag and clean up
                        if (this._grab !== null) {
                            Main.popModal(this._grab);
                            this._grab.dismiss();
                            this._grab = null;
                            if (this._actor._handleIcon) {
                                this._actor._handleIcon.opacity = 255;
                            } else if (this._actor.firstChild) {
                                this._actor.firstChild.opacity = 255;
                            }
                            setCursor('default');
                            this._parent._relocate(true);
                        }
                    } else {
                        // Button released after click (quick release)
                        this._click = true;
                        let state = event.get_state();
                        switch (event.get_button()) {
                            case Clutter.BUTTON_PRIMARY:
                                this._leftBtnClick(state);
                                break;
                            case Clutter.BUTTON_MIDDLE:
                                this._middleBtnClick(state);
                                break;
                            case Clutter.BUTTON_SECONDARY:
                                this._rightBtnClick(state);
                                break;
                            default:
                                break;
                        }
                    }
                    break;
                default:
                    break;
            }
        }

        // Left longpress action
        _leftBtnLongPress(eventCoords) {
            // Prepare Drag if no other drag is ongoing
            if (this._grab === null) {
                this._grab = Main.pushModal(this._actor);
                this._actor.remove_style_pseudo_class('focus');
                this._parent.style = null;
                if (this._actor._handleIcon) {
                    this._actor._handleIcon.opacity = 0;
                } else if (this._actor.firstChild) {
                    this._actor.firstChild.opacity = 0;
                }
                setCursor('move');

                let [panelX, panelY] = this._parent.get_position
                    ? this._parent.get_position()
                    : [this._parent.x, this._parent.y];
                if (eventCoords) {
                    this._dragOffsetX = eventCoords[0] - panelX;
                    this._dragOffsetY = eventCoords[1] - panelY;
                } else {
                    this._dragOffsetX = Math.ceil(this._actor.width / 2);
                    this._dragOffsetY = Math.ceil(this._actor.height / 2);
                }
            }
        }

        // Middle longpress action
        _middleBtnLongPress() {
            // ORIENTATION
            this._actor._changeOrientation();
        }

        // Right longpress action
        _rightBtnLongPress() {
            if (this._actor._updateArrowSide)
                this._actor._updateArrowSide();
            this._actor.menu.toggle();
        }

        // Left click
        _leftBtnClick(state) {
            switch (state) {
                case 0:
                    OVERVIEW.visible ? OVERVIEW.toggle() : OVERVIEW.showApps();
                    break;
                case Clutter.ModifierType.SHIFT_MASK:
                    this._actor._doAlign(Alignment.LEFT | Alignment.TOP);
                    break;
                case Clutter.ModifierType.CONTROL_MASK:
                    if (this._actor[this._actor.orientStr]) {
                        this._actor._doAlign(Alignment.RIGHT | Alignment.TOP);
                    } else {
                        this._actor._doAlign(Alignment.LEFT | Alignment.BOTTOM);
                    }
                    break;
                default:
                    break;
            }
        }

        // Middle click
        _middleBtnClick(state) {
            switch (state) {
                case 0:
                    this._parent._indsDrawer.toggle();
                    break;
                case Clutter.ModifierType.SHIFT_MASK:
                    if (this._actor[this._actor.orientStr]) {
                        this._actor._doAlign(Alignment.CENTER | Alignment.LEFT);
                    } else {
                        this._actor._doAlign(Alignment.CENTER | Alignment.TOP);
                    }
                    break;
                case Clutter.ModifierType.CONTROL_MASK:
                    if (this._actor[this._actor.orientStr]) {
                        this._actor._doAlign(
                            Alignment.CENTER | Alignment.RIGHT
                        );
                    } else {
                        this._actor._doAlign(
                            Alignment.CENTER | Alignment.BOTTOM
                        );
                    }
                    break;
                default:
                    break;
            }
        }

        // Right click
        _rightBtnClick(state) {
            switch (state) {
                case 0:
                    this._parent._tmpHide();
                    break;
                case Clutter.ModifierType.SHIFT_MASK:
                    if (this._actor[this._actor.orientStr]) {
                        this._actor._doAlign(Alignment.LEFT | Alignment.BOTTOM);
                    } else {
                        this._actor._doAlign(Alignment.RIGHT | Alignment.TOP);
                    }
                    break;
                case Clutter.ModifierType.CONTROL_MASK:
                    this._actor._doAlign(Alignment.RIGHT | Alignment.BOTTOM);
                    break;
                default:
                    break;
            }
        }

        // Register new button press and release with 'return true'
        vfunc_register_sequence(event) {
            // Reset detected Click and Longpress properties here before a new
            // Press-Release-Cycle starts, because they are needed during
            // the complete cycle.
            if (event.type() === Clutter.EventType.BUTTON_PRESS) {
                this._click = false;
                this._longpress = false;
            }
            return true;
        }

        vfunc_sequence_cancelled() {}

        destroy() {
            if (this._timeoutId) {
                GLib.Source.remove(this._timeoutId);
                this._timeoutId = null;
            }
            if (this._grab !== null) {
                Main.popModal(this._grab);
                this._grab.dismiss();
                this._grab = null;
            }
            this._actor = null;
            this._parent = null;
        }
    }
);

const MenuItem = GObject.registerClass(
    class MenuItem extends PopupMenu.PopupBaseMenuItem {
        constructor(name, hotkey, action, params) {
            super(params);

            this.side = new St.Label({
                text: name,
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
            });
            this.add_child(this.side);
            this.add_child(
                new St.Label({
                    text: hotkey,
                    x_expand: true,
                    x_align: Clutter.ActorAlign.END,
                    style: 'color: grey !important;',
                })
            );
            this.connect('activate', () => action());
        }
    }
);

export const ControlButton = GObject.registerClass(
    class ControlButton extends St.BoxLayout {
        constructor(parent) {
            super({
                name: 'ctlBtn',
                reactive: true,
                track_hover: true,
                style_class: 'button ctlBtn',
            });

            this._parent = parent;

            this._handleIcon = new St.Icon({
                icon_name: 'list-drag-handle-symbolic',
                style_class: 'system-status-icon',
                x_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._handleIcon.set_pivot_point(0.5, 0.5);
            this.add_child(this._handleIcon);

            // Control Menu
            this.menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
            Main.uiGroup.add_child(this.menu.actor);
            Main.panel.menuManager.addMenu(this.menu);
            this.menu.actor.hide();

            this.menu.addMenuItem(
                new PopupMenu.PopupSeparatorMenuItem('Auto Position')
            );
            this.menu.addMenuItem(
                new MenuItem('Top - Start', 'Shift + Left Click', () => {
                    this._doAlign(Alignment.TOP | Alignment.LEFT);
                })
            );
            this.menu.addMenuItem(
                new MenuItem('Top - Center', 'Shift + Middle Click', () => {
                    if (this[this.orientStr]) {
                        this._doAlign(Alignment.LEFT | Alignment.CENTER);
                    } else {
                        this._doAlign(Alignment.TOP | Alignment.CENTER);
                    }
                })
            );
            this.menu.addMenuItem(
                new MenuItem('Top - End', 'Shift + Right Click', () => {
                    if (this[this.orientStr]) {
                        this._doAlign(Alignment.BOTTOM | Alignment.LEFT);
                    } else {
                        this._doAlign(Alignment.TOP | Alignment.RIGHT);
                    }
                })
            );
            this.menu.addMenuItem(
                new MenuItem('Bottom - Start', 'Ctrl + Left Click', () => {
                    if (this[this.orientStr]) {
                        this._doAlign(Alignment.TOP | Alignment.RIGHT);
                    } else {
                        this._doAlign(Alignment.BOTTOM | Alignment.LEFT);
                    }
                })
            );
            this.menu.addMenuItem(
                new MenuItem('Bottom - Center', 'Ctrl + Middle Click', () => {
                    if (this[this.orientStr]) {
                        this._doAlign(Alignment.RIGHT | Alignment.CENTER);
                    } else {
                        this._doAlign(Alignment.BOTTOM | Alignment.CENTER);
                    }
                })
            );
            this.menu.addMenuItem(
                new MenuItem('Bottom - End', 'Ctrl + Right Click', () => {
                    this._doAlign(Alignment.BOTTOM | Alignment.RIGHT);
                })
            );

            this.menu.addMenuItem(
                new PopupMenu.PopupSeparatorMenuItem('Control Functions')
            );
            this.menu.addMenuItem(
                new MenuItem('Show AppGrid', 'Left Click', () => {
                    !OVERVIEW.visible ? OVERVIEW.toggle() : OVERVIEW.showApps();
                })
            );
            this.menu.addMenuItem(
                new MenuItem('Toggle Drawer', 'Middle Click', () => {
                    this._parent._indsDrawer.toggle();
                })
            );
            this.menu.addMenuItem(
                new MenuItem('Hide For 5 Seconds', 'Right Click', () => {
                    this._parent._tmpHide();
                })
            );
            this.menu.addMenuItem(
                new MenuItem('Move', 'Left LongPress', () => {}, {
                    reactive: false,
                })
            );
            this.menu.addMenuItem(
                new MenuItem('Toggle Orientation', 'Middle LongPress', () => {
                    this._changeOrientation();
                })
            );
            this.menu.addMenuItem(
                new MenuItem('Toggle Menu', 'Right LongPress', () => {})
            );
            this.menu.addMenuItem(
                new PopupMenu.PopupSeparatorMenuItem()
            );
            this.menu.addMenuItem(
                new MenuItem('Preferences…', '', () => {
                    this._parent._openPreferences();
                })
            );

            this.menu.connect('open-state-changed', (menu, isOpen) => {
                if (isOpen) {
                    this._updateArrowSide();
                }
                if (this.has_style_pseudo_class('active')) {
                    this.remove_style_pseudo_class('active');
                } else {
                    this.add_style_pseudo_class('active');
                }
                return GLib.SOURCE_PROPAGATE;
            });

            // START CODE VERTICAL
            this.orientStr = shellVersion > 47 ? 'orientation' : 'vertical';
            this._parent.bind_property_full(
                this.orientStr,
                this,
                this.orientStr,
                GObject.BindingFlags.SYNC_CREATE,
                (binding, value) => {
                    let isVertical = shellVersion > 47
                        ? value === Clutter.Orientation.VERTICAL
                        : Boolean(value);

                    this._updateHandleRotation(isVertical);

                    if (isVertical) {
                        this.ltTxt = 'Left';
                        this.rbTxt = 'Right';
                    } else {
                        this.ltTxt = 'Top';
                        this.rbTxt = 'Bottom';
                    }
                    this._updateArrowSide();
                    let items = this.menu._getMenuItems();
                    items[1].side.text = this.ltTxt + ' - Start';
                    items[2].side.text = this.ltTxt + ' - Center';
                    items[3].side.text = this.ltTxt + ' - End';
                    items[4].side.text = this.rbTxt + ' - Start';
                    items[5].side.text = this.rbTxt + ' - Center';
                    items[6].side.text = this.rbTxt + ' - End';
                    return [binding, value];
                },
                null
            );

            this._posConId = this._parent.connect('notify::position', () => {
                this._updateArrowSide();
            });

            // Handling for GNOME 46, 47, 48, 49
            this._action = new CtlActions(this);
            this.add_action(this._action);

            this.connect('scroll-event', (obj, event) => {
                Main.wm.handleWorkspaceScroll(event);
            });
        }

        _updateHandleRotation(isVertical) {
            if (this._handleIcon) {
                this._handleIcon.set_pivot_point(0.5, 0.5);
                this._handleIcon.rotation_angle_z = isVertical ? 90.0 : 0.0;
            }
        }

        _doAlign(align) {
            this._parent._sets.set_int('aligned', align);
            this._parent._relocate(false);
        }

        // START CODE VERTICAL
        _changeOrientation() {
            this._doAlign(Alignment.NONE);
            let isVertical = Boolean(this._parent._sets.get_boolean('vertical'));
            this._parent.setOrientation(!isVertical);
        }

        _updateArrowSide() {
            if (this.menu) {
                Utils.updateMenuConstraints(this, this.menu);
            }
        }

        destroy() {
            if (this.menu?._boxPointer) {
                Utils.unhookBoxPointer(this.menu._boxPointer);
            }
            if (this._posConId && this._parent) {
                this._parent.disconnect(this._posConId);
                this._posConId = null;
            }
            if (this._timeoutId) {
                GLib.Source.remove(this._timeoutId);
                this._timeoutId = null;
            }
            if (this._action) {
                this.remove_action(this._action);
                this._action.destroy();
                this._action = null;
            }
            this._handleIcon = null;
            super.destroy();
        }
    }
);
