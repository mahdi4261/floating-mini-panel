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
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Utils from './utils.js';

const PANELBOX = Main.layoutManager.panelBox;
const DATEMENU = Main.panel.statusArea['dateMenu'];
const DATESOURCEACTOR = DATEMENU.menu.sourceActor;
const DATEARROWALIGNMENT = DATEMENU.menu._arrowAlignment;

const shellVersion = parseFloat(Config.PACKAGE_VERSION);

export const DateButton = GObject.registerClass(
    class DateButton extends St.BoxLayout {
        constructor(parent) {
            super({
                name: 'dateBtn',
                reactive: true,
                track_hover: true,
                style_class: 'button btn',
            });

            this._parent = parent;

            // START CODE VERTICAL
            this.orientStr = shellVersion > 47 ? 'orientation' : 'vertical';

            this._parent.bind_property_full(
                this.orientStr,
                this,
                this.orientStr,
                GObject.BindingFlags.SYNC_CREATE,
                (binding, value) => {
                    this._updateArrowSide();
                    return [binding, value];
                },
                null
            );

            this.connect('notify::mapped', () => {
                DATEMENU.menu.close();
                if (this.mapped) {
                    DATEMENU.menu.sourceActor = this;
                    DATEMENU.menu._arrowAlignment = 0.5;
                    this._updateArrowSide();
                } else {
                    Utils.restoreMenu(DATEMENU.menu, DATESOURCEACTOR, DATEARROWALIGNMENT);
                }
            });

            this.connect('button-press-event', () => {
                this._updateArrowSide();
                DATEMENU.menu.toggle();
            });

            this._posConId = this._parent.connect('notify::position', () => {
                this._updateArrowSide();
            });

            this._dmConId = DATEMENU.menu.connect('open-state-changed', (menu, isOpen) => {
                if (isOpen && this.mapped) {
                    this._updateArrowSide();
                }
                if (this.has_style_pseudo_class('active')) {
                    this.remove_style_pseudo_class('active');
                } else {
                    this.add_style_pseudo_class('active');
                }
                return GLib.SOURCE_PROPAGATE;
            });

            this._dateLabel = new St.Label({
                text: this._getClockText(this[this.orientStr]),
                x_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style: 'padding-top: 2px;', // Align with percentage label
            });
            this.add_child(this._dateLabel);

            this.connect('notify::' + this.orientStr, () => {
                this._updateClock();
            });

            // Update clock on system tick or text change
            this._clockNotifyId = DATEMENU._clock.connect('notify::clock', () => {
                this._updateClock();
            });

            this._clockDisplayNotifyId = DATEMENU._clockDisplay.connect('notify::text', () => {
                this._updateClock();
            });

            // Update clock when settings change
            this._setsConId1 = this._parent._sets.connect('changed::date-format-mode', () => {
                this._updateClock();
            });
            this._setsConId2 = this._parent._sets.connect('changed::custom-date-format', () => {
                this._updateClock();
            });
            this._setsConId3 = this._parent._sets.connect('changed::custom-date-format-vertical', () => {
                this._updateClock();
            });

            this._noteIcon = new St.Icon({
                style_class: 'system-status-icon',
                visible: DATEMENU._indicator.visible,
            });
            this.add_child(this._noteIcon);

            this._noteConId1 = DATEMENU._indicator.bind_property(
                'icon-name',
                this._noteIcon,
                'icon-name',
                GObject.BindingFlags.SYNC_CREATE
            );

            this._updateNotificationIcon();
            this._noteVisibleConId = DATEMENU._indicator.connect('notify::visible', () => {
                this._updateNotificationIcon();
            });
            this._setsNotifConId = this._parent._sets.connect('changed::show-date-notification-icon', () => {
                this._updateNotificationIcon();
            });

            Main.wm.setCustomKeybindingHandler(
                'toggle-message-tray',
                Shell.ActionMode.NORMAL |
                    Shell.ActionMode.OVERVIEW |
                    Shell.ActionMode.POPUP,
                this._toggleCalendar.bind(this)
            );
        }

        _getPanelDateFormat() {
            try {
                let schemaDir = GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/panel-date-format@keiii.github.com/schemas';
                let schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                    schemaDir,
                    Gio.SettingsSchemaSource.get_default(),
                    false
                );
                let schema = schemaSource.lookup('org.gnome.shell.extensions.panel-date-format', true);
                if (schema) {
                    let settings = new Gio.Settings({ settings_schema: schema });
                    let fmt = settings.get_string('format');
                    if (fmt && fmt.trim() !== '') return fmt;
                }
            } catch (e) {
                // ignore
            }
            return null;
        }

        _formatVertical(str) {
            let dateStr = str
                .replace(/\u2002/g, '\n――\n')
                .replace(/\s+/g, '\n');
            if (
                dateStr.split(':').length > 2 ||
                dateStr.split('∶').length > 2
            ) {
                dateStr = dateStr.replace(/:|∶/g, '\n𐤟 𐤟\n');
            } else {
                dateStr = dateStr.replace(/\n――/g, '');
            }
            dateStr = dateStr.replace(/\n\n+/g, '\n');
            if (dateStr[0] === '\n') dateStr = dateStr.substring(1);
            return dateStr;
        }

        _getClockText(vertical) {
            const sets = this._parent._sets;
            const mode = sets.get_string('date-format-mode');
            const now = GLib.DateTime.new_now_local();
            let dateStr = '';

            if (mode === 'time-only') {
                if (!this._desktopInterfaceSettings) {
                    this._desktopInterfaceSettings = new Gio.Settings({
                        schema_id: 'org.gnome.desktop.interface',
                    });
                }
                const clockFormat = this._desktopInterfaceSettings.get_string('clock-format');
                const showSeconds = this._desktopInterfaceSettings.get_boolean('clock-show-seconds');

                let fmt;
                if (clockFormat === '12h') {
                    fmt = showSeconds ? '%-I:%M:%S %p' : '%-I:%M %p';
                } else {
                    fmt = showSeconds ? '%H:%M:%S' : '%H:%M';
                }
                dateStr = now.format(fmt) || '';
            } else if (mode === 'custom') {
                const customFmt = sets.get_string('custom-date-format');
                if (customFmt && customFmt.trim() !== '') {
                    dateStr = now.format(customFmt) || '';
                } else {
                    dateStr = DATEMENU._clockDisplay.text || '';
                }
            } else if (mode === 'follow-panel-date-format') {
                const pdfFmt = this._getPanelDateFormat();
                if (pdfFmt) {
                    dateStr = now.format(pdfFmt) || '';
                } else {
                    dateStr = DATEMENU._clockDisplay.text || '';
                }
            } else {
                // 'default'
                dateStr = DATEMENU._clockDisplay.text || '';
            }

            if (vertical) {
                const vertFmt = sets.get_string('custom-date-format-vertical');
                if (vertFmt && vertFmt.trim() !== '' && mode === 'custom') {
                    dateStr = now.format(vertFmt) || dateStr;
                } else {
                    dateStr = this._formatVertical(dateStr);
                }
            }

            return dateStr;
        }

        _updateClock() {
            if (this._dateLabel) {
                this._dateLabel.text = this._getClockText(this[this.orientStr]);
            }
        }

        _updateNotificationIcon() {
            if (!this._noteIcon) return;
            const showNotif = this._parent._sets.get_boolean('show-date-notification-icon');
            if (showNotif) {
                this._noteIcon.visible = DATEMENU._indicator.visible;
            } else {
                this._noteIcon.visible = false;
            }
        }

        _toggleCalendar() {
            if (this.visible || PANELBOX.visible) {
                this._updateArrowSide();
                DATEMENU.menu.toggle();
                if (DATEMENU.menu.isOpen) {
                    DATEMENU.menu.actor.navigate_focus(
                        null,
                        St.DirectionType.TAB_FORWARD,
                        false
                    );
                }
            }
        }

        _updateArrowSide() {
            if (this.mapped && DATEMENU?.menu) {
                Utils.updateMenuConstraints(this, DATEMENU.menu);
            }
        }

        destroy() {
            if (this._posConId && this._parent) {
                this._parent.disconnect(this._posConId);
                this._posConId = null;
            }

            Utils.restoreMenu(DATEMENU.menu, DATESOURCEACTOR, DATEARROWALIGNMENT);

            Main.wm.setCustomKeybindingHandler(
                'toggle-message-tray',
                Shell.ActionMode.NORMAL |
                    Shell.ActionMode.OVERVIEW |
                    Shell.ActionMode.POPUP,
                Main.wm._toggleCalendar.bind(Main.wm)
            );

            if (this._clockNotifyId) {
                DATEMENU._clock.disconnect(this._clockNotifyId);
                this._clockNotifyId = null;
            }

            if (this._clockDisplayNotifyId) {
                DATEMENU._clockDisplay.disconnect(this._clockDisplayNotifyId);
                this._clockDisplayNotifyId = null;
            }

            if (this._setsConId1) {
                this._parent._sets.disconnect(this._setsConId1);
                this._setsConId1 = null;
            }
            if (this._setsConId2) {
                this._parent._sets.disconnect(this._setsConId2);
                this._setsConId2 = null;
            }
            if (this._setsConId3) {
                this._parent._sets.disconnect(this._setsConId3);
                this._setsConId3 = null;
            }
            if (this._setsNotifConId) {
                this._parent._sets.disconnect(this._setsNotifConId);
                this._setsNotifConId = null;
            }

            if (this._noteVisibleConId) {
                DATEMENU._indicator.disconnect(this._noteVisibleConId);
                this._noteVisibleConId = null;
            }

            this._noteConId1 = null;

            DATEMENU.menu.disconnect(this._dmConId);
            this._dmConId = null;

            this._desktopInterfaceSettings = null;

            super.destroy();
        }
    }
);
