/*
 * Floating-Mini-Panel for GNOME Shell 46+
 *
 * QuickSettingsScroll helper based on Disk_MTH (GPL-2.0-or-later)
 * Makes GNOME Shell Quick Settings menu scrollable when clamped to screen space.
 */

'use strict';

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';

export class QuickSettingsScroll {
    constructor() {
        this._menu = null;
        this._scrollView = null;
        this._stack = null;
        this._gridIndex = -1;
    }

    apply() {
        if (this._scrollView)
            return;

        const menu = Main.panel.statusArea.quickSettings?.menu;
        if (!menu?.box || !menu._grid || !menu._overlay || !menu._boxPointer) {
            return;
        }

        const { box, _grid: grid, _overlay: overlay } = menu;

        this._gridIndex = box.get_children().indexOf(grid);
        if (this._gridIndex === -1) {
            // Already wrapped or unexpected hierarchy
            return;
        }

        this._menu = menu;

        this._scrollView = new St.ScrollView({
            style_class: 'qs-scroll-view',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.EXTERNAL,
            x_expand: true,
            y_expand: true,
        });

        box.remove_child(grid);

        this._stack = new St.Viewport({ x_expand: true });
        this._stack.add_child(grid);
        this._scrollView.child = this._stack;
        box.insert_child_at_index(this._scrollView, this._gridIndex);

        this._watchSubmenus(overlay);
        this._followScroll(overlay);

        menu._boxPointer.connectObject(
            'captured-event', (_a, event) => this._onCapturedEvent(event), this);

        menu.connectObject('open-state-changed', (_m, isOpen) => {
            if (!isOpen && this._scrollView) {
                this._scrollView.vadjustment.value = 0;
            }
        }, this);
    }

    _onCapturedEvent(event) {
        if (event.type() !== Clutter.EventType.SCROLL)
            return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        for (let a = target; a && a !== this._scrollView; a = a.get_parent()) {
            if (a instanceof Slider ||
                (a instanceof St.ScrollView &&
                 a.vadjustment.upper > a.vadjustment.page_size))
                return Clutter.EVENT_PROPAGATE;
        }

        return this._onScroll(event);
    }

    _onScroll(event) {
        if (!this._scrollView) return Clutter.EVENT_PROPAGATE;
        const adj = this._scrollView.vadjustment;

        if (event.is_pointer_emulated())
            return Clutter.EVENT_STOP;

        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.SMOOTH: {
            const [, dy] = event.get_scroll_delta();
            adj.adjust_for_scroll_event(dy);
            break;
        }
        case Clutter.ScrollDirection.UP:
            adj.adjust_for_scroll_event(-1);
            break;
        case Clutter.ScrollDirection.DOWN:
            adj.adjust_for_scroll_event(1);
            break;
        default:
            return Clutter.EVENT_PROPAGATE;
        }

        return Clutter.EVENT_STOP;
    }

    _watchSubmenus(overlay) {
        for (const actor of overlay)
            this._watchSubmenu(actor);

        overlay.connectObject(
            'child-added', (_o, actor) => this._watchSubmenu(actor),
            'child-removed', (_o, actor) => this._unwatchSubmenu(actor),
            this);
    }

    _watchSubmenu(actor) {
        actor.connectObject(
            'captured-event', (_a, event) => this._onCapturedEvent(event), this);
    }

    _unwatchSubmenu(actor) {
        actor.disconnectObject(this);
    }

    _followScroll(overlay) {
        this._scrollView.vadjustment.connectObject('notify::value', () => {
            overlay.translation_y = -this._scrollView.vadjustment.value;
            this._syncOverlayClip();
        }, this);

        this._scrollView.connectObject(
            'notify::allocation', () => this._syncOverlayClip(), this);

        this._syncOverlayClip();
    }

    _syncOverlayClip() {
        if (!this._scrollView?.has_allocation() || !this._menu?._overlay)
            return;

        const overlay = this._menu._overlay;
        const [viewX, viewY] = this._scrollView.get_transformed_position();
        const [overlayX, overlayY] = overlay.get_transformed_position();
        if (!Number.isFinite(viewX) || !Number.isFinite(overlayX))
            return;

        overlay.set_clip(viewX - overlayX, viewY - overlayY,
            this._scrollView.width, this._scrollView.height);
    }

    revert() {
        if (!this._scrollView)
            return;

        const menu = this._menu;
        const { box, _grid: grid, _overlay: overlay } = menu;

        menu.disconnectObject(this);
        menu._boxPointer.disconnectObject(this);

        for (const actor of overlay)
            this._unwatchSubmenu(actor);
        overlay.disconnectObject(this);
        this._scrollView.vadjustment.disconnectObject(this);
        this._scrollView.disconnectObject(this);
        overlay.remove_clip();
        overlay.translation_y = 0;

        this._stack.remove_child(grid);
        box.remove_child(this._scrollView);
        this._scrollView.destroy();

        box.insert_child_at_index(grid, this._gridIndex);

        this._scrollView = null;
        this._stack = null;
        this._gridIndex = -1;
        this._menu = null;
    }
}
