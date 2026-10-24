/*
 * Floating-Mini-Panel for GNOME Shell
 * Blur integration with blur-my-shell
 */

'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BMS_UUID = 'blur-my-shell@aunetx';
const BMS_PANEL_SCHEMA = 'org.gnome.shell.extensions.blur-my-shell.panel';
const PANEL_STYLES = ['transparent-panel', 'light-panel', 'dark-panel', 'contrasted-panel'];

const Alignment = {
    NONE: 0,
    TOP: 1,
    BOTTOM: 2,
    LEFT: 4,
    RIGHT: 8,
    CENTER: 16,
};

let DynamicPipelineClass = null;

async function getDynamicPipelineClass() {
    if (DynamicPipelineClass)
        return DynamicPipelineClass;

    const bmsExt = Main.extensionManager.lookup(BMS_UUID);
    if (!bmsExt || !bmsExt.dir)
        return null;

    try {
        const uri = `${bmsExt.dir.get_uri()}/render/dynamic_surface.js`;
        const mod = await import(uri);
        DynamicPipelineClass = mod.DynamicPipeline;
        return DynamicPipelineClass;
    } catch (e) {
        console.warn('[FloatingMiniPanel] Failed to import blur-my-shell DynamicPipeline:', e);
        return null;
    }
}

export class BlurHelper {
    constructor(panel) {
        this._panel = panel;
        this._blurContainer = null;
        this._pipeline = null;
        this._bindX = null;
        this._bindY = null;
        this._bindW = null;
        this._bindH = null;
        this._visibleBinding = null;
        this._opacityBinding = null;
        this._enabled = false;
        this._unblurInOverview = false;

        this._bmsSettings = null;
        this._settingsChangedId = null;
        this._extStateChangedId = null;
        this._overviewShowingId = null;
        this._overviewHidingId = null;
        this._sizeChangedId = null;
        this._alignedChangedId = null;

        this._initSettings();
        this._initListeners();
        this._update();
    }

    _initSettings() {
        try {
            const defaultSource = Gio.SettingsSchemaSource.get_default();
            if (defaultSource && defaultSource.lookup(BMS_PANEL_SCHEMA, true)) {
                this._bmsSettings = new Gio.Settings({ schema_id: BMS_PANEL_SCHEMA });
                this._settingsChangedId = this._bmsSettings.connect('changed', (_, key) => {
                    this._onSettingChanged(key);
                });
            }
        } catch (e) {
            console.warn('[FloatingMiniPanel] Error loading blur-my-shell schema:', e);
        }
    }

    _initListeners() {
        this._extStateChangedId = Main.extensionManager.connect('extension-state-changed', (_, ext) => {
            if (ext.uuid === BMS_UUID) {
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    this._update();
                    return GLib.SOURCE_REMOVE;
                });
            }
        });

        this._overviewShowingId = Main.overview.connect('showing', () => {
            if (this._unblurInOverview && this._blurContainer)
                this._blurContainer.hide();
        });

        this._overviewHidingId = Main.overview.connect('hidden', () => {
            if (this._unblurInOverview && this._blurContainer && this._panel?.visible)
                this._blurContainer.show();
        });

        this._sizeChangedId = this._panel.connect('notify::size', () => {
            this._updateCornerRadius();
        });

        if (this._panel._sets) {
            this._alignedChangedId = this._panel._sets.connect('changed::aligned', () => {
                this._updateCornerRadius();
            });
        }
    }

    _shouldBlur() {
        const bmsExt = Main.extensionManager.lookup(BMS_UUID);
        if (!bmsExt || bmsExt.state !== 1)
            return false;

        if (!global.blur_my_shell || !global.blur_my_shell._effects_manager || !global.blur_my_shell._pipelines_manager)
            return false;

        if (!this._bmsSettings || !this._bmsSettings.get_boolean('blur'))
            return false;

        return true;
    }

    async _update() {
        if (!this._bmsSettings)
            this._initSettings();

        if (this._shouldBlur()) {
            await this._enableBlur();
        } else {
            this._disableBlur();
        }
    }

    async _enableBlur() {
        const DynamicPipeline = await getDynamicPipelineClass();
        if (!DynamicPipeline || !this._shouldBlur()) {
            this._disableBlur();
            return;
        }

        if (this._enabled && this._pipeline) {
            this._updateStyle();
            this._updateCornerRadius();
            return;
        }

        this._disableBlur();

        this._blurContainer = new St.Widget({
            name: 'FloatingMiniPanelBlurContainer',
            reactive: false,
        });

        Main.layoutManager.addTopChrome(this._blurContainer, { trackFullscreen: false });
        Main.uiGroup.set_child_below_sibling(this._blurContainer, this._panel);

        this._bindX = new Clutter.BindConstraint({
            source: this._panel,
            coordinate: Clutter.BindCoordinate.X,
        });
        this._bindY = new Clutter.BindConstraint({
            source: this._panel,
            coordinate: Clutter.BindCoordinate.Y,
        });
        this._bindW = new Clutter.BindConstraint({
            source: this._panel,
            coordinate: Clutter.BindCoordinate.WIDTH,
        });
        this._bindH = new Clutter.BindConstraint({
            source: this._panel,
            coordinate: Clutter.BindCoordinate.HEIGHT,
        });
        this._blurContainer.add_constraint(this._bindX);
        this._blurContainer.add_constraint(this._bindY);
        this._blurContainer.add_constraint(this._bindW);
        this._blurContainer.add_constraint(this._bindH);

        this._visibleBinding = this._panel.bind_property(
            'visible',
            this._blurContainer,
            'visible',
            GObject.BindingFlags.SYNC_CREATE
        );
        this._opacityBinding = this._panel.bind_property(
            'opacity',
            this._blurContainer,
            'opacity',
            GObject.BindingFlags.SYNC_CREATE
        );

        const pipelineId = this._bmsSettings.get_string('pipeline') || 'pipeline_default';
        const cornerRadius = this._getCornerRadius();

        this._pipeline = new DynamicPipeline(
            global.blur_my_shell._effects_manager,
            global.blur_my_shell._pipelines_manager,
            pipelineId,
            {
                corner_radius: cornerRadius,
                get_corners: () => this._getCornersSelection(),
            }
        );

        this._pipeline.attach_to_container(this._blurContainer, 'bms-panel-blurred-widget');

        this._enabled = true;
        this._updateStyle();
        this._updateCornerRadius();
    }

    _getCornersSelection(align = null) {
        if (align === null) {
            try {
                if (this._panel?._sets)
                    align = this._panel._sets.get_int('aligned');
            } catch (e) {
                align = Alignment.NONE;
            }
        }

        if (align & Alignment.TOP)
            return 2; // top docked: only bottom rounded
        if (align & Alignment.BOTTOM)
            return 1; // bottom docked: only top rounded
        return 0; // floating or side-centered: all corners rounded
    }

    _getCornerRadius() {
        if (this._bmsSettings) {
            const setRadius = this._bmsSettings.get_int('corner-radius');
            if (setRadius > 0)
                return setRadius;
        }
        return 8;
    }

    _updateCornerRadius(align = null) {
        const r = this._getCornerRadius();
        if (align === null) {
            try {
                if (this._panel?._sets)
                    align = this._panel._sets.get_int('aligned');
            } catch (e) {
                align = Alignment.NONE;
            }
        }

        let offsetX = 0;
        let extraWidth = 0;

        if (align & Alignment.LEFT) {
            offsetX = -r;
            extraWidth = r;
        } else if (align & Alignment.RIGHT) {
            offsetX = 0;
            extraWidth = r;
        }

        if (this._bindX)
            this._bindX.offset = offsetX;
        if (this._bindW)
            this._bindW.offset = extraWidth;

        if (this._blurContainer)
            this._blurContainer.queue_relayout();

        if (this._pipeline) {
            this._pipeline.set_corner_radius(r);
            this._pipeline.roundedPipeline?.update();
            this._pipeline.repaint_effect?.();
        }
    }

    _updateStyle() {
        if (!this._enabled)
            return;

        if (!this._panel.has_style_class_name('bms-blurred'))
            this._panel.add_style_class_name('bms-blurred');

        const styleIndex = this._bmsSettings ? this._bmsSettings.get_int('style-panel') : 0;
        const targetStyle = PANEL_STYLES[styleIndex] || 'transparent-panel';

        PANEL_STYLES.forEach(style => {
            if (style === targetStyle) {
                if (!this._panel.has_style_class_name(style))
                    this._panel.add_style_class_name(style);
            } else {
                this._panel.remove_style_class_name(style);
            }
        });

        const forceLightText = this._bmsSettings ? this._bmsSettings.get_boolean('force-light-text') : false;
        if (forceLightText) {
            if (!this._panel.has_style_class_name('bms-light-text'))
                this._panel.add_style_class_name('bms-light-text');
        } else {
            this._panel.remove_style_class_name('bms-light-text');
        }

        this._unblurInOverview = this._bmsSettings ? this._bmsSettings.get_boolean('unblur-in-overview') : false;
        if (this._unblurInOverview && Main.overview.visible && this._blurContainer)
            this._blurContainer.hide();
    }

    _onSettingChanged(key) {
        switch (key) {
            case 'blur':
            case 'static-blur':
                this._update();
                break;
            case 'pipeline':
                if (this._pipeline && this._bmsSettings) {
                    const pipelineId = this._bmsSettings.get_string('pipeline') || 'pipeline_default';
                    this._pipeline.change_pipeline_to(pipelineId);
                }
                break;
            case 'corner-radius': {
                let align = Alignment.NONE;
                try {
                    if (this._panel?._sets)
                        align = this._panel._sets.get_int('aligned');
                } catch (e) {
                    // ignore
                }
                if (this._panel?._adjustBorder)
                    this._panel._adjustBorder(align);
                this._updateCornerRadius();
                break;
            }
            case 'style-panel':
            case 'force-light-text':
                this._updateStyle();
                break;
            case 'unblur-in-overview':
                this._unblurInOverview = this._bmsSettings ? this._bmsSettings.get_boolean('unblur-in-overview') : false;
                if (this._unblurInOverview && Main.overview.visible && this._blurContainer)
                    this._blurContainer.hide();
                else if (this._blurContainer && this._panel.visible)
                    this._blurContainer.show();
                break;
            default:
                break;
        }
    }

    _disableBlur() {
        if (this._pipeline) {
            try {
                this._pipeline.destroy();
            } catch (e) {
                console.warn('[FloatingMiniPanel] Error destroying pipeline:', e);
            }
            this._pipeline = null;
        }

        if (this._visibleBinding) {
            this._visibleBinding.unbind();
            this._visibleBinding = null;
        }
        if (this._opacityBinding) {
            this._opacityBinding.unbind();
            this._opacityBinding = null;
        }

        if (this._blurContainer) {
            ['X', 'Y', 'W', 'H'].forEach(coord => {
                const prop = `_bind${coord}`;
                if (this[prop]) {
                    this._blurContainer.remove_constraint(this[prop]);
                    this[prop] = null;
                }
            });
            Main.layoutManager.removeChrome(this._blurContainer);
            this._blurContainer.destroy();
            this._blurContainer = null;
        }

        if (this._panel) {
            this._panel.remove_style_class_name('bms-blurred');
            PANEL_STYLES.forEach(style => this._panel.remove_style_class_name(style));
            this._panel.remove_style_class_name('bms-light-text');
        }

        this._enabled = false;
    }

    destroy() {
        if (this._settingsChangedId && this._bmsSettings) {
            this._bmsSettings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._bmsSettings = null;

        if (this._extStateChangedId) {
            Main.extensionManager.disconnect(this._extStateChangedId);
            this._extStateChangedId = null;
        }

        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = null;
        }

        if (this._overviewHidingId) {
            Main.overview.disconnect(this._overviewHidingId);
            this._overviewHidingId = null;
        }

        if (this._sizeChangedId && this._panel) {
            this._panel.disconnect(this._sizeChangedId);
            this._sizeChangedId = null;
        }

        if (this._alignedChangedId && this._panel?._sets) {
            this._panel._sets.disconnect(this._alignedChangedId);
            this._alignedChangedId = null;
        }

        this._disableBlur();
        this._panel = null;
    }
}
