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

const PANEL = Main.panel;
const PANELBOX = Main.layoutManager.panelBox;
const STATUSAREA = PANEL.statusArea;
const LEFTBOX = PANEL._leftBox;
const CENTERBOX = PANEL._centerBox;
const RIGHTBOX = PANEL._rightBox;
const DISPLAY = global.display;

const shellVersion = parseFloat(Config.PACKAGE_VERSION);

const Box = {
    LEFT: 0,
    CENTER: 1,
    RIGHT: 2,
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

function isCoordInsideActor(actor, x, y) {
    if (!actor || !actor.mapped || !actor.visible) return false;
    let [ax, ay] = actor.get_transformed_position ? actor.get_transformed_position() : [actor.x, actor.y];
    let [aw, ah] = actor.get_transformed_size ? actor.get_transformed_size() : [actor.width, actor.height];
    return (x >= ax && x <= ax + aw && y >= ay && y <= ay + ah);
}

function getIndicatorId(ind, role) {
    if (ind?._indicator?.id) {
        return ind._indicator.id;
    }
    if (ind?.uniqueId) {
        return ind.uniqueId;
    }
    if (role && !role.startsWith('appindicator')) {
        return role;
    }
    if (ind?._indicator?.busName) {
        return ind._indicator.busName;
    }
    if (role) {
        return role.replace(/:\d+\.\d+/, '').replace(/StatusNotifierItem-\d+-\d+/, 'StatusNotifierItem');
    }
    return '';
}

const IndicatorClone = GObject.registerClass(
    class IndicatorClone extends St.BoxLayout {
        constructor(parent, ind, role, box, pos) {
            super({
                name: 'extBtn',
                reactive: true,
                track_hover: true,
                style_class: 'button btn extBtn',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });

            this._parent = parent; // IndicatorsDrawer
            this._fmpParent = this._parent?._parent; // FloatingMiniPanel
            this._ind = ind;
            this._role = role;
            this._box = box;
            this._pos = pos;
            this._id = getIndicatorId(this._ind, this._role);
            this._isHidden = false;

            this._isPressed = false;
            this._isDragging = false;
            this._pressX = 0;
            this._pressY = 0;
            this._dragClone = null;
            this._grab = null;
            this._dragTimer = null;
            this._arrowHoverTimer = null;

            this._indChilds = [];
            this._indContainers = [];
            this._childs = [];
            this._containers = [];

            this._ind.connectObject('destroy', () => this.destroy(), this);

            this._ind.bind_property(
                'visible',
                this,
                'visible',
                GObject.BindingFlags.SYNC_CREATE
            );

            // START CODE VERTICAL
            this.orientStr = shellVersion > 47 ? 'orientation' : 'vertical';

            this._parent.bind_property_full(
                this.orientStr,
                this,
                this.orientStr,
                GObject.BindingFlags.SYNC_CREATE,
                (binding, value) => {
                    for (let c of this._childs) {
                        if (c?.text) {
                            if (value) {
                                c.text = c.text.replace(/\s/g, '\n');
                            } else {
                                c.text = c.text.replace(/\n/g, ' ');
                            }
                        }
                    }
                    return [binding, value];
                },
                null
            );

            // Get indicator menu properties -----------------------------------
            if (this._ind.menu) {
                this._indActor = this._ind.menu.sourceActor;
                this._indArrow = this._ind.menu.arrowAlignment;

                this._ind.menu.connectObject(
                    'open-state-changed',
                    (menu, isOpen) => {
                        if (isOpen && this.mapped) {
                            Utils.updateMenuConstraints(this, this._ind.menu);
                        }
                        if (this.has_style_pseudo_class('active')) {
                            this.remove_style_pseudo_class('active');
                        } else {
                            this.add_style_pseudo_class('active');
                        }
                        return Clutter.EVENT_PROPAGATE;
                    },
                    this
                );
            } else if (this._role === 'ArcMenu') {
                this._indActor = this._ind.arcMenu?.sourceActor;
                this._indArrow = this._ind.arcMenu?.arrowAlignment;
                if (this._ind.arcMenu) {
                    this._ind.arcMenu.connectObject(
                        'open-state-changed',
                        (menu, isOpen) => {
                            if (isOpen && this.mapped) {
                                Utils.updateMenuConstraints(this, this._ind.arcMenu);
                            }
                            if (this.has_style_pseudo_class('active')) {
                                this.remove_style_pseudo_class('active');
                            } else {
                                this.add_style_pseudo_class('active');
                            }
                            return Clutter.EVENT_PROPAGATE;
                        },
                        this
                    );
                }
                if (this._ind.arcMenuContextMenu) {
                    this._ind.arcMenuContextMenu.connectObject(
                        'open-state-changed',
                        (menu, isOpen) => {
                            if (isOpen && this.mapped) {
                                Utils.updateMenuConstraints(this, this._ind.arcMenuContextMenu);
                            }
                            if (this.has_style_pseudo_class('active')) {
                                this.remove_style_pseudo_class('active');
                            } else {
                                this.add_style_pseudo_class('active');
                            }
                            return Clutter.EVENT_PROPAGATE;
                        },
                        this
                    );
                }
            }

            // Change / restore menu properties (sourceActor and arrowAlignment)
            // triggered by visibility (mapped)
            this.connect('notify::mapped', () => {
                this._toggleMenuProps(this.mapped);
            });

            // START CODE VERTICAL
            this.connect_after('notify::' + this.orientStr, () => {
                if (this.mapped) {
                    if (this._ind.menu) {
                        Utils.updateMenuConstraints(this, this._ind.menu);
                    }
                    if (this._ind.arcMenu) {
                        Utils.updateMenuConstraints(this, this._ind.arcMenu);
                        Utils.updateMenuConstraints(this, this._ind.arcMenuContextMenu);
                    }
                }
            });

            if (this._fmpParent) {
                this._posConId = this._fmpParent.connect('notify::position', () => {
                    if (this.mapped) {
                        if (this._ind.menu) {
                            Utils.updateMenuConstraints(this, this._ind.menu);
                        }
                        if (this._ind.arcMenu) {
                            Utils.updateMenuConstraints(this, this._ind.arcMenu);
                            Utils.updateMenuConstraints(this, this._ind.arcMenuContextMenu);
                        }
                    }
                });
            }

            // Pointer actions: click, drag-and-drop, and middle-click toggle ---
            this.connect('button-press-event', (obj, event) => {
                let button = event.get_button();

                if (button === Clutter.BUTTON_MIDDLE) {
                    this._parent.toggleIndicator(this);
                    return Clutter.EVENT_STOP;
                }

                if (button === Clutter.BUTTON_SECONDARY) {
                    this._activateIndicator(event);
                    return Clutter.EVENT_STOP;
                }

                if (button === Clutter.BUTTON_PRIMARY) {
                    let [x, y] = event.get_coords();
                    this._pressX = x;
                    this._pressY = y;
                    this._isPressed = true;
                    this._isDragging = false;

                    // Press-and-hold timer (180ms) for drag pickup
                    if (this._dragTimer) {
                        GLib.Source.remove(this._dragTimer);
                        this._dragTimer = null;
                    }
                    this._dragTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
                        this._dragTimer = null;
                        if (this._isPressed && !this._isDragging) {
                            this._startDrag(this._pressX, this._pressY);
                        }
                        return GLib.SOURCE_REMOVE;
                    });

                    return Clutter.EVENT_STOP;
                }

                return Clutter.EVENT_PROPAGATE;
            });

            this.connect('motion-event', (obj, event) => {
                if (!this._isPressed)
                    return Clutter.EVENT_PROPAGATE;

                let [x, y] = event.get_coords();
                let dist = Math.hypot(x - this._pressX, y - this._pressY);

                if (!this._isDragging && dist > 6) {
                    if (this._dragTimer) {
                        GLib.Source.remove(this._dragTimer);
                        this._dragTimer = null;
                    }
                    this._startDrag(x, y);
                }

                if (this._isDragging) {
                    this._updateDrag(x, y);
                    return Clutter.EVENT_STOP;
                }

                return Clutter.EVENT_PROPAGATE;
            });

            this.connect('button-release-event', (obj, event) => {
                let button = event.get_button();

                if (button === Clutter.BUTTON_PRIMARY) {
                    if (this._dragTimer) {
                        GLib.Source.remove(this._dragTimer);
                        this._dragTimer = null;
                    }

                    if (this._isDragging) {
                        let [x, y] = event.get_coords();
                        this._endDrag(x, y);
                        this._isDragging = false;
                        this._isPressed = false;
                        return Clutter.EVENT_STOP;
                    } else if (this._isPressed) {
                        this._isPressed = false;
                        // Click! Activate indicator directly
                        this._activateIndicator(event);
                        return Clutter.EVENT_STOP;
                    }
                }

                return Clutter.EVENT_PROPAGATE;
            });

            // Settle timeout for indicators (ca. 500ms) -----------------------
            let timeout = 0;
            if (
                this._role.startsWith('appindicator') ||
                this._role.startsWith('freonMenu')
            ) {
                timeout = 500;
                PANELBOX.visible = true;
            }
            this._timeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                timeout,
                () => {
                    this._timeoutId = null;
                    if (!this._ind || !this._containers || !this._indContainers || !this.get_parent())
                        return GLib.SOURCE_REMOVE;

                    this._id = getIndicatorId(this._ind, this._role);
                    if (this._parent?._isIndicatorHidden?.(this)) {
                        if (!this._isHidden) {
                            this._parent.hideIndicator(this);
                        }
                    }

                    this._containers.push(this);
                    this._indContainers.push(this._ind);
                    this._findIndChilds(
                        this._indContainers[0],
                        this._containers[0]
                    );
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

        _activateIndicator(event) {
            if (!this._ind) return;

            // If indicator has a shell menu, update constraints and toggle it
            if (this._ind.menu) {
                Utils.updateMenuConstraints(this, this._ind.menu);
                if (this._isHidden && this._parent?.closeFlyout) {
                    this._parent.closeFlyout();
                }
                this._ind.menu.toggle();
                return;
            }

            if (this._ind.arcMenu) {
                Utils.updateMenuConstraints(this, this._ind.arcMenu);
                if (this._isHidden && this._parent?.closeFlyout) {
                    this._parent.closeFlyout();
                }
                this._ind.arcMenu.toggle();
                return;
            }

            try {
                if (this._isHidden && this._parent?.closeFlyout) {
                    this._parent.closeFlyout();
                }
                if (typeof this._ind.vfunc_button_press_event === 'function') {
                    this._ind.vfunc_button_press_event(event);
                } else {
                    this._ind.emit('event', event);
                }
            } catch (e) {
                // ignore
            }
        }

        _startDrag(x, y) {
            this._isDragging = true;
            this._grab = Main.pushModal(this);
            this.opacity = 120;

            try {
                this._dragClone = new Clutter.Clone({
                    source: this,
                    opacity: 220,
                });
                Main.uiGroup.add_child(this._dragClone);
                let [w, h] = this.get_transformed_size ? this.get_transformed_size() : [this.width, this.height];
                this._dragOffsetX = (w > 0) ? (w / 2) : 14;
                this._dragOffsetY = (h > 0) ? (h / 2) : 14;
                this._dragClone.set_position(
                    Math.floor(x - this._dragOffsetX),
                    Math.floor(y - this._dragOffsetY)
                );
            } catch (e) {
                // ignore
            }

            setCursor('move');
        }

        _updateDrag(x, y) {
            if (this._dragClone) {
                this._dragClone.set_position(
                    Math.floor(x - this._dragOffsetX),
                    Math.floor(y - this._dragOffsetY)
                );
            }

            if (this._parent?._isInsideArrow?.(x, y)) {
                if (!this._arrowHoverTimer && !this._parent._flyout?.isOpen) {
                    this._arrowHoverTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                        this._parent.openFlyout();
                        this._arrowHoverTimer = null;
                        return GLib.SOURCE_REMOVE;
                    });
                }
            } else if (this._arrowHoverTimer) {
                GLib.Source.remove(this._arrowHoverTimer);
                this._arrowHoverTimer = null;
            }
        }

        _endDrag(x, y) {
            if (this._arrowHoverTimer) {
                GLib.Source.remove(this._arrowHoverTimer);
                this._arrowHoverTimer = null;
            }

            if (this._dragClone) {
                Main.uiGroup.remove_child(this._dragClone);
                this._dragClone.destroy();
                this._dragClone = null;
            }

            if (this._grab) {
                Main.popModal(this._grab);
                this._grab = null;
            }

            this.opacity = 255;
            setCursor('default');

            if (this._parent) {
                this._parent.handleDrop(this, x, y);
            }
        }

        // Find indicator childs and add containers recursively ----------------
        _findIndChilds(indContainer, container) {
            let childs = indContainer.get_children();
            for (let c = 0; c < childs.length; c++) {
                if (
                    childs[c].get_n_children() > 0 &&
                    !(childs[c] instanceof Clutter.Content) &&
                    !(childs[c] instanceof St.Icon) &&
                    !(childs[c] instanceof St.Label)
                ) {
                    this._indContainers.push(childs[c]);
                    let i = this._indContainers.length - 1;
                    this._containers.push(
                        new St.BoxLayout({
                            x_align: Clutter.ActorAlign.CENTER,
                            y_align: Clutter.ActorAlign.CENTER,
                            x_expand: true,
                            y_expand: true,
                        })
                    );

                    container.add_child(this._containers[i]);

                    this._indContainers[i].bind_property(
                        'visible',
                        this._containers[i],
                        'visible',
                        GObject.BindingFlags.SYNC_CREATE
                    );

                    // START CODE VERTICAL
                    this.bind_property(
                        this.orientStr,
                        this._containers[i],
                        this.orientStr,
                        GObject.BindingFlags.SYNC_CREATE
                    );

                    this._indContainers[i].connectObject(
                        'child-added',
                        (actor, child) => {
                            this._addChildToContainer(
                                child,
                                this._containers[i]
                            );
                            return Clutter.EVENT_STOP;
                        },
                        'child-removed',
                        (actor, child) => {
                            this._removeChildFromContainer(
                                child,
                                this._containers[i]
                            );
                            return Clutter.EVENT_STOP;
                        },
                        this
                    );

                    // Recursion
                    this._findIndChilds(
                        this._indContainers[i],
                        this._containers[i]
                    );
                } else {
                    if (childs[c].source) {
                        if (this.get_parent()) {
                            this.get_parent().remove_child(this);
                        }
                    } else {
                        if (
                            childs[c].content ||
                            childs[c].gicon ||
                            childs[c].text
                        )
                            this._addChildToContainer(
                                childs[c],
                                this._containers[this._containers.length - 1]
                            );
                    }
                }
            }
        }

        // Add indicator childs to their parent container ----------------------
        _addChildToContainer(child, container) {
            this._indChilds.push(child);
            let j = this._indChilds.indexOf(child);

            // Clutter.Actor (AppIndicator)
            if (child.content) {
                this._childs[j] = new St.Icon({
                    style_class: 'system-status-icon',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                    x_expand: true,
                    y_expand: true,
                });
                container.add_child(this._childs[j]);
                this._indChilds[j].bind_property(
                    'content',
                    this._childs[j],
                    'gicon',
                    GObject.BindingFlags.SYNC_CREATE
                );
                this._indChilds[j].bind_property(
                    'visible',
                    this._childs[j],
                    'visible',
                    GObject.BindingFlags.SYNC_CREATE
                );
            }

            // St.Icon (Extension or AppIndicator)
            if (child.gicon) {
                if (child.get_next_sibling() instanceof St.Label)
                    child.get_next_sibling().set_text('...');

                if (child.get_previous_sibling() instanceof St.Label) {
                    this._childs[j] = new St.Icon({
                        style_class: 'system-status-icon-2',
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER,
                        x_expand: true,
                        y_expand: true,
                    });
                } else {
                    this._childs[j] = new St.Icon({
                        style_class: 'system-status-icon',
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER,
                        x_expand: true,
                        y_expand: true,
                    });
                }
                container.add_child(this._childs[j]);
                this._indChilds[j].bind_property(
                    'gicon',
                    this._childs[j],
                    'gicon',
                    GObject.BindingFlags.SYNC_CREATE
                );
                if (container !== this) {
                    this._indChilds[j].bind_property(
                        'visible',
                        this._childs[j],
                        'visible',
                        GObject.BindingFlags.SYNC_CREATE
                    );
                }
            }

            // St.Label (Extension)
            if (child.text) {
                this._childs[j] = new St.Label({
                    x_expand: true,
                    x_align: Clutter.ActorAlign.CENTER,
                    y_expand: true,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                container.add_child(this._childs[j]);
                this._indChilds[j].bind_property_full(
                    'text',
                    this._childs[j],
                    'text',
                    GObject.BindingFlags.SYNC_CREATE,
                    // START CODE VERTICAL
                    (binding, value) => {
                        if (this[this.orientStr])
                            value = value.replace(/\s/g, '\n');
                        return [binding, value];
                    },
                    null
                );
                this._indChilds[j].bind_property(
                    'visible',
                    this._childs[j],
                    'visible',
                    GObject.BindingFlags.SYNC_CREATE
                );
            }
        }

        // Remove indicator childs ---------------------------------------------
        _removeChildFromContainer(child, container) {
            if (this._indChilds) {
                let j = this._indChilds.indexOf(child);
                if (this._childs[j]) {
                    container.remove_child(this._childs[j]);
                    this._childs[j] = null;
                    this._childs.splice(j, 1);
                    this._indChilds[j] = null;
                    this._indChilds.splice(j, 1);
                }
            }
        }

        // Toggle indicator menu properties ------------------------------------
        _toggleMenuProps(on) {
            if (this._ind.menu) {
                if (on) {
                    this._ind.menu.sourceActor = this;
                    this._ind.menu._arrowAlignment = 0.5;
                    Utils.updateMenuConstraints(this, this._ind.menu);
                } else {
                    Utils.restoreMenu(this._ind.menu, this._indActor, this._indArrow);
                }
            } else if (this._role === 'ArcMenu') {
                if (this._ind.arcMenu) {
                    if (on) {
                        this._ind.arcMenu.sourceActor = this;
                        this._ind.arcMenu._arrowAlignment = 0.5;
                        if (this._ind.arcMenuContextMenu) {
                            this._ind.arcMenuContextMenu.sourceActor = this;
                            this._ind.arcMenuContextMenu._arrowAlignment = 0.5;
                        }
                        Utils.updateMenuConstraints(this, this._ind.arcMenu);
                        if (this._ind.arcMenuContextMenu) {
                            Utils.updateMenuConstraints(this, this._ind.arcMenuContextMenu);
                        }
                    } else {
                        Utils.restoreMenu(this._ind.arcMenu, this._indActor, this._indArrow);
                        if (this._ind.arcMenuContextMenu) {
                            Utils.restoreMenu(this._ind.arcMenuContextMenu, this._indActor, this._indArrow);
                        }
                    }
                }
            }
        }

        destroy() {
            if (this._dragTimer) {
                GLib.Source.remove(this._dragTimer);
                this._dragTimer = null;
            }

            if (this._arrowHoverTimer) {
                GLib.Source.remove(this._arrowHoverTimer);
                this._arrowHoverTimer = null;
            }

            if (this._dragClone) {
                Main.uiGroup.remove_child(this._dragClone);
                this._dragClone.destroy();
                this._dragClone = null;
            }

            if (this._grab) {
                Main.popModal(this._grab);
                this._grab = null;
            }

            if (this._posConId && this._fmpParent) {
                this._fmpParent.disconnect(this._posConId);
                this._posConId = null;
            }

            if (this._timeoutId) {
                GLib.Source.remove(this._timeoutId);
                this._timeoutId = null;
            }

            if (this._parent?._cloned) {
                let idx = this._parent._cloned.indexOf(this._ind);
                if (idx >= 0)
                    this._parent._cloned.splice(idx, 1);
            }

            if (this.get_parent()) {
                this.get_parent().remove_child(this);
            }

            this._toggleMenuProps(false);

            this._parent?._updateArrowVisibility?.();
            this._parent?._updateEmptyLabel?.();

            this._parent = null;
            this._fmpParent = null;
            this._ind = null;
            this._role = null;
            this._box = null;
            this._pos = null;

            this._indChilds = null;
            this._indContainers = null;
            this._indActor = null;
            this._indArrow = null;
            this._childs = null;
            this._containers = null;

            super.destroy();
        }
    }
);

export const IndicatorsDrawer = GObject.registerClass(
    class IndicatorsDrawer extends St.BoxLayout {
        constructor(parent) {
            super({
                name: 'IndicatorsDrawer',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });

            this._parent = parent; // FloatingMiniPanel
            this._sets = this._parent._sets;
            this._hiddenList = this._sets.get_strv('hidden-indicators') || [];
            this._cloned = [];

            // 1. Arrow Button (Chevron facing screen center) ------------------
            this._arrowBtn = new St.BoxLayout({
                name: 'arrowBtn',
                reactive: true,
                track_hover: true,
                style_class: 'button btn extBtn arrowBtn',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._arrowBtn._parent = this._parent; // Ensure Utils.getMenuArrowSide finds FloatingMiniPanel

            this._arrowIcon = new St.Icon({
                style_class: 'system-status-icon arrowIcon',
                icon_name: 'pan-up-symbolic',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true,
            });
            this._arrowBtn.add_child(this._arrowIcon);
            this.add_child(this._arrowBtn);

            // 2. Always Box (Visible indicators on panel) ---------------------
            this._alwaysBox = new St.BoxLayout({
                name: 'alwaysBox',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._alwaysBox);

            // 3. Hidden Indicators Overflow Flyout ----------------------------
            this._flyout = new PopupMenu.PopupMenu(this._arrowBtn, 0.5, St.Side.BOTTOM);
            Main.uiGroup.add_child(this._flyout.actor);
            // Use dedicated PopupMenuManager so panel indicator hovers don't close the flyout
            this._menuManager = new PopupMenu.PopupMenuManager(this);
            this._menuManager.addMenu(this._flyout);
            this._flyout.actor.hide();

            let flyoutItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
                style_class: 'hidden-menu-item',
            });
            this._flyoutContainer = new St.BoxLayout({
                vertical: true,
                style_class: 'hidden-indicators-container',
            });
            this._emptyLabel = new St.Label({
                text: 'Drag icons here to hide',
                style_class: 'hidden-empty-label',
            });
            this._hiddenBox = new St.BoxLayout({
                name: 'hiddenBox',
                style_class: 'hidden-indicators-box',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });

            this._flyoutContainer.add_child(this._emptyLabel);
            this._flyoutContainer.add_child(this._hiddenBox);
            flyoutItem.add_child(this._flyoutContainer);
            this._flyout.addMenuItem(flyoutItem);

            // START CODE VERTICAL
            this.orientStr = shellVersion > 47 ? 'orientation' : 'vertical';

            this._parent.bind_property_full(
                this.orientStr,
                this,
                this.orientStr,
                GObject.BindingFlags.SYNC_CREATE,
                (binding, value) => {
                    this._arrowBtn[this.orientStr] = value;
                    this._alwaysBox[this.orientStr] = value;
                    this._hiddenBox[this.orientStr] = value;
                    this._updateArrowDirection();
                    return [binding, value];
                },
                null
            );

            this._posConId = this._parent.connect('notify::position', () => {
                this._updateArrowDirection();
                if (this._flyout?.isOpen) {
                    Utils.updateMenuConstraints(this._arrowBtn, this._flyout);
                }
            });

            this._flyout.connectObject(
                'open-state-changed',
                (menu, isOpen) => {
                    if (isOpen) {
                        Utils.updateMenuConstraints(this._arrowBtn, this._flyout);
                    }
                    this._updateArrowDirection();
                },
                this
            );

            this._arrowBtn.connect('button-press-event', (actor, event) => {
                if (event.get_button() === Clutter.BUTTON_PRIMARY) {
                    this.toggleFlyout();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });

            this._drawerChangedId = this._sets.connect('changed::show-drawer', () => {
                this._updateArrowVisibility();
            });

            // Start collecting Indicators -------------------------------------
            let orgInds = LEFTBOX.get_children();
            for (let i = 0; i < orgInds.length; i++) {
                this._cloneIndicators(Box.LEFT, orgInds[i]);
            }
            orgInds = CENTERBOX.get_children();
            for (let i = 0; i < orgInds.length; i++) {
                this._cloneIndicators(Box.CENTER, orgInds[i]);
            }
            orgInds = RIGHTBOX.get_children();
            for (let i = 0; i < orgInds.length; i++) {
                this._cloneIndicators(Box.RIGHT, orgInds[i]);
            }

            // Start listeners for indicators which will be realized in future
            this._plConId = LEFTBOX.connect('child-added', (actor, child) => {
                this._cloneIndicators(Box.LEFT, child);
                return Clutter.EVENT_STOP;
            });
            this._pcConId = CENTERBOX.connect('child-added', (actor, child) => {
                this._cloneIndicators(Box.CENTER, child);
                return Clutter.EVENT_STOP;
            });
            this._prConId = RIGHTBOX.connect('child-added', (actor, child) => {
                this._cloneIndicators(Box.RIGHT, child);
                return Clutter.EVENT_STOP;
            });

            this._updateArrowVisibility();
            this._updateEmptyLabel();
        }

        _updateArrowDirection() {
            if (!this._arrowIcon) return;
            let side = Utils.getMenuArrowSide(this._arrowBtn || this);
            let isOpen = Boolean(this._flyout && this._flyout.isOpen);

            // In closed state, arrow points toward screen center:
            // St.Side.BOTTOM (bottom dock) -> pan-up-symbolic
            // St.Side.TOP (top dock) -> pan-down-symbolic
            // St.Side.RIGHT (right dock) -> pan-start-symbolic
            // St.Side.LEFT (left dock) -> pan-end-symbolic
            let iconName = 'pan-up-symbolic';
            if (side === St.Side.BOTTOM) {
                iconName = isOpen ? 'pan-down-symbolic' : 'pan-up-symbolic';
            } else if (side === St.Side.TOP) {
                iconName = isOpen ? 'pan-up-symbolic' : 'pan-down-symbolic';
            } else if (side === St.Side.RIGHT) {
                iconName = isOpen ? 'pan-end-symbolic' : 'pan-start-symbolic';
            } else if (side === St.Side.LEFT) {
                iconName = isOpen ? 'pan-start-symbolic' : 'pan-end-symbolic';
            }

            this._arrowIcon.icon_name = iconName;
        }

        _updateArrowVisibility() {
            let totalInds = this._alwaysBox.get_n_children() + this._hiddenBox.get_n_children();
            let showDrawer = this._sets.get_boolean('show-drawer');
            this._arrowBtn.visible = Boolean(showDrawer && totalInds > 0);
            this._updateArrowDirection();
        }

        _updateEmptyLabel() {
            let hasHidden = this._hiddenBox.get_n_children() > 0;
            this._emptyLabel.visible = !hasHidden;
            this._hiddenBox.visible = hasHidden;
        }

        closeFlyout() {
            if (this._flyout && this._flyout.isOpen) {
                this._flyout.close(true);
                this._updateArrowDirection();
            }
        }

        openFlyout() {
            if (!this._flyout) return;
            Utils.updateMenuConstraints(this._arrowBtn, this._flyout);
            this._flyout.open(true);
            this._updateArrowDirection();
        }

        toggleFlyout() {
            if (!this._flyout) return;
            if (this._flyout.isOpen) {
                this.closeFlyout();
            } else {
                this.openFlyout();
            }
        }

        // Backward compatibility for controlButton
        toggle() {
            this.toggleFlyout();
        }

        // Helper function to insert child into box sorted by _pos
        _insertCloneIntoBox(clone, box) {
            let childs = box.get_children();
            if (childs.length === 0 || box.lastChild?._pos === undefined || box.lastChild._pos < clone._pos) {
                box.add_child(clone);
            } else {
                let inserted = false;
                for (let c = 0; c < childs.length; c++) {
                    if (childs[c]._pos !== undefined && childs[c]._pos > clone._pos) {
                        box.insert_child_at_index(clone, c);
                        inserted = true;
                        break;
                    }
                }
                if (!inserted) {
                    box.add_child(clone);
                }
            }
            if (clone.get_parent() !== box) box.add_child(clone);
        }

        // Start cloning indicators --------------------------------------------
        _cloneIndicators(box, child) {
            if (
                child.firstChild &&
                !this._cloned.includes(child.firstChild) &&
                child.firstChild !== STATUSAREA['activities'] &&
                child.firstChild !== STATUSAREA['dateMenu'] &&
                child.firstChild !== STATUSAREA['quickSettings']
            ) {
                this._cloned.push(child.firstChild);

                // Calculate real position of indicator in panel
                let l = LEFTBOX.get_children();
                let c = CENTERBOX.get_children();
                let r = RIGHTBOX.get_children();
                let a = l.concat(c, r);
                a.splice(a.indexOf(STATUSAREA['activities'].get_parent()), 1);
                a.splice(a.indexOf(STATUSAREA['dateMenu'].get_parent()), 1);
                a.splice(
                    a.indexOf(STATUSAREA['quickSettings'].get_parent()),
                    1
                );
                let pos = a.indexOf(child);

                // Get indicator role from statusarea
                let role = '';
                for (let rName in STATUSAREA) {
                    if (child.firstChild === STATUSAREA[rName]) {
                        role = rName;
                        break;
                    }
                }

                // Create clone of indicator
                let clone = new IndicatorClone(
                    this,
                    child.firstChild,
                    role,
                    box,
                    pos
                );

                if (this._isIndicatorHidden(clone)) {
                    clone._isHidden = true;
                    this._insertCloneIntoBox(clone, this._hiddenBox);
                } else {
                    clone._isHidden = false;
                    this._insertCloneIntoBox(clone, this._alwaysBox);
                }

                this._updateArrowVisibility();
                this._updateEmptyLabel();
            }
        }

        _isIndicatorHidden(clone) {
            if (!this._hiddenList || this._hiddenList.length === 0)
                return false;
            let id = clone._id;
            if (id && this._hiddenList.includes(id))
                return true;
            if (clone._role && this._hiddenList.includes(clone._role))
                return true;
            return false;
        }

        hideIndicator(clone) {
            if (!clone) return;
            if (clone.get_parent() === this._hiddenBox) return;

            if (clone.get_parent()) {
                clone.get_parent().remove_child(clone);
            }
            this._insertCloneIntoBox(clone, this._hiddenBox);
            clone._isHidden = true;

            let id = clone._id || clone._role;
            if (id && !this._hiddenList.includes(id)) {
                this._hiddenList.push(id);
                this._sets.set_strv('hidden-indicators', this._hiddenList);
            }

            this._updateArrowVisibility();
            this._updateEmptyLabel();
        }

        showIndicator(clone) {
            if (!clone) return;
            if (clone.get_parent() === this._alwaysBox) return;

            if (clone.get_parent()) {
                clone.get_parent().remove_child(clone);
            }
            this._insertCloneIntoBox(clone, this._alwaysBox);
            clone._isHidden = false;

            let ids = [clone._id, clone._role].filter(Boolean);
            let changed = false;
            for (let id of ids) {
                let idx = this._hiddenList.indexOf(id);
                if (idx >= 0) {
                    this._hiddenList.splice(idx, 1);
                    changed = true;
                }
            }
            if (changed) {
                this._sets.set_strv('hidden-indicators', this._hiddenList);
            }

            this._updateArrowVisibility();
            this._updateEmptyLabel();
        }

        toggleIndicator(clone) {
            if (clone._isHidden) {
                this.showIndicator(clone);
            } else {
                this.hideIndicator(clone);
            }
        }

        handleDrop(clone, x, y) {
            let insideFlyout = this._isInsideFlyout(x, y);
            let insideArrow = this._isInsideArrow(x, y);
            let insidePanel = this._isInsidePanel(x, y);

            if (clone._isHidden) {
                if (insidePanel || insideArrow || !insideFlyout) {
                    this.showIndicator(clone);
                }
            } else {
                if (insideFlyout || insideArrow) {
                    this.hideIndicator(clone);
                }
            }
        }

        _isInsideArrow(x, y) {
            return isCoordInsideActor(this._arrowBtn, x, y);
        }

        _isInsideFlyout(x, y) {
            return isCoordInsideActor(this._flyout?.actor, x, y);
        }

        _isInsidePanel(x, y) {
            return isCoordInsideActor(this._parent, x, y);
        }

        destroy() {
            if (this._drawerChangedId) {
                this._sets.disconnect(this._drawerChangedId);
                this._drawerChangedId = null;
            }

            if (this._posConId && this._parent) {
                this._parent.disconnect(this._posConId);
                this._posConId = null;
            }

            if (this._menuManager) {
                if (this._flyout) {
                    this._menuManager.removeMenu(this._flyout);
                }
                this._menuManager = null;
            }

            if (this._flyout) {
                if (this._flyout._boxPointer) {
                    Utils.unhookBoxPointer(this._flyout._boxPointer);
                }
                this._flyout.destroy();
                this._flyout = null;
            }

            this._cloned = null;

            if (this._plConId) {
                LEFTBOX.disconnect(this._plConId);
                this._plConId = null;
            }
            if (this._pcConId) {
                CENTERBOX.disconnect(this._pcConId);
                this._pcConId = null;
            }
            if (this._prConId) {
                RIGHTBOX.disconnect(this._prConId);
                this._prConId = null;
            }

            super.destroy();
        }
    }
);
