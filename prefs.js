/*
 * Floating-Mini-Panel Preferences
 *
 * Copyright 2024, 2025 Gerhard Himmel
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 */

'use strict';

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences, gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const _ = (str) => {
    try {
        return gettext ? gettext(str) : str;
    } catch {
        return str;
    }
};

export default class FloatingMiniPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(680, 640);

        // --- PAGE 1: COMPONENTS ---
        const compPage = new Adw.PreferencesPage({
            title: _('Components'),
            icon_name: 'view-grid-symbolic',
        });

        const compGroup = new Adw.PreferencesGroup({
            title: _('Visible Elements'),
            description: _('Choose which components to show in the Floating Mini Panel.'),
        });

        // 1. Show Handle
        const handleRow = new Adw.SwitchRow({
            title: _('Drag Handle Button'),
            subtitle: _('Movable handle button with quick app launcher and right-click menu'),
        });
        settings.bind('show-handle', handleRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        compGroup.add(handleRow);

        // 2. Show Indicators Drawer
        const drawerRow = new Adw.SwitchRow({
            title: _('Indicators Drawer'),
            subtitle: _('Collapsible drawer for 3rd-party extension and system tray indicators'),
        });
        settings.bind('show-drawer', drawerRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        compGroup.add(drawerRow);

        // 3. Show Date/Clock
        const dateRow = new Adw.SwitchRow({
            title: _('Clock and Calendar Button'),
            subtitle: _('Displays time/date and opens the GNOME calendar and notification center'),
        });
        settings.bind('show-date', dateRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        compGroup.add(dateRow);

        // 4. Show Quick Settings
        const quickRow = new Adw.SwitchRow({
            title: _('Quick Settings Button'),
            subtitle: _('Shows system indicators (volume, network, battery) and opens Quick Settings'),
        });
        settings.bind('show-quick-settings', quickRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        compGroup.add(quickRow);

        compPage.add(compGroup);
        window.add(compPage);

        // --- PAGE 2: CLOCK and DATE FORMAT ---
        const clockPage = new Adw.PreferencesPage({
            title: _('Clock and Date'),
            icon_name: 'preferences-system-time-symbolic',
        });

        const clockGroup = new Adw.PreferencesGroup({
            title: _('Time and Date Formatting'),
            description: _('Customize what appears on the clock button in the floating panel.'),
        });

        // Mode ComboRow
        const modeRow = new Adw.ComboRow({
            title: _('Display Mode'),
            subtitle: _('Choose between Time Only, Custom Format, or GNOME Default'),
        });

        const modeModel = new Gtk.StringList();
        modeModel.append(_('Time only (e.g. 9:20 PM / 21:20)'));
        modeModel.append(_('Custom format'));
        modeModel.append(_('Follow "Panel Date Format" extension'));
        modeModel.append(_('GNOME Shell default'));
        modeRow.model = modeModel;

        const modeValues = ['time-only', 'custom', 'follow-panel-date-format', 'default'];

        // Custom format entry
        const customFormatRow = new Adw.EntryRow({
            title: _('Custom Format String'),
            text: settings.get_string('custom-date-format'),
        });
        settings.bind('custom-date-format', customFormatRow, 'text', Gio.SettingsBindFlags.DEFAULT);

        // Custom vertical format entry
        const verticalFormatRow = new Adw.EntryRow({
            title: _('Vertical Orientation Format (Optional)'),
            text: settings.get_string('custom-date-format-vertical'),
        });
        settings.bind('custom-date-format-vertical', verticalFormatRow, 'text', Gio.SettingsBindFlags.DEFAULT);

        // Live preview row
        const previewRow = new Adw.ActionRow({
            title: _('Live Preview'),
            subtitle: '',
        });

        const updatePreview = () => {
            const now = GLib.DateTime.new_now_local();
            const selectedIdx = modeRow.selected;
            const mode = modeValues[selectedIdx] || 'time-only';
            let previewText = '';

            if (mode === 'time-only') {
                try {
                    const iface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
                    const is12h = iface.get_string('clock-format') === '12h';
                    const showSec = iface.get_boolean('clock-show-seconds');
                    const fmt = is12h
                        ? (showSec ? '%-I:%M:%S %p' : '%-I:%M %p')
                        : (showSec ? '%H:%M:%S' : '%H:%M');
                    previewText = now.format(fmt) || '';
                } catch {
                    previewText = now.format('%-I:%M %p') || '';
                }
            } else if (mode === 'custom') {
                const fmt = customFormatRow.text || '%-I:%M %p';
                try {
                    previewText = now.format(fmt) || '';
                } catch {
                    previewText = _('Invalid format');
                }
            } else if (mode === 'follow-panel-date-format') {
                try {
                    const schemaDir = GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/panel-date-format@keiii.github.com/schemas';
                    const schemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir, Gio.SettingsSchemaSource.get_default(), false);
                    const schema = schemaSource.lookup('org.gnome.shell.extensions.panel-date-format', true);
                    if (schema) {
                        const pdfSettings = new Gio.Settings({ settings_schema: schema });
                        const pdfFmt = pdfSettings.get_string('format');
                        previewText = now.format(pdfFmt) || '';
                    } else {
                        previewText = _('Panel Date Format schema not found');
                    }
                } catch {
                    previewText = _('Panel Date Format extension not found');
                }
            } else {
                previewText = now.format('%a %b %e  %-I:%M %p') || '';
            }

            previewRow.subtitle = previewText || _('(empty)');
        };

        const syncModeUI = () => {
            const currentMode = settings.get_string('date-format-mode');
            let idx = modeValues.indexOf(currentMode);
            if (idx === -1) idx = 0;
            if (modeRow.selected !== idx) {
                modeRow.selected = idx;
            }
            const isCustom = idx === 1;
            customFormatRow.visible = isCustom;
            verticalFormatRow.visible = isCustom;
            updatePreview();
        };

        modeRow.connect('notify::selected', () => {
            const idx = modeRow.selected;
            const newMode = modeValues[idx] || 'time-only';
            if (settings.get_string('date-format-mode') !== newMode) {
                settings.set_string('date-format-mode', newMode);
            }
            syncModeUI();
        });

        customFormatRow.connect('notify::text', () => {
            updatePreview();
        });

        syncModeUI();

        clockGroup.add(modeRow);
        clockGroup.add(customFormatRow);
        clockGroup.add(verticalFormatRow);
        clockGroup.add(previewRow);

        // Notification Icon Toggle
        const notifRow = new Adw.SwitchRow({
            title: _('Show Notification Indicator Icon'),
            subtitle: _('Display the bell / dot icon on the clock button when notifications or Do Not Disturb are active'),
        });
        settings.bind('show-date-notification-icon', notifRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        clockGroup.add(notifRow);

        clockPage.add(clockGroup);

        // Tokens Reference Expander
        const helpGroup = new Adw.PreferencesGroup({
            title: _('Formatting Guide'),
        });

        const helpExpander = new Adw.ExpanderRow({
            title: _('Common Date and Time Format Codes'),
            subtitle: _('Reference for building custom format strings (GLib / strftime syntax)'),
        });

        const tokens = [
            { code: '%-I:%M %p', desc: _('12-hour time without leading zero (e.g. 9:20 PM)') },
            { code: '%H:%M', desc: _('24-hour time with leading zero (e.g. 21:20)') },
            { code: '%-I:%M:%S %p', desc: _('12-hour time with seconds (e.g. 9:20:45 PM)') },
            { code: '%H:%M:%S', desc: _('24-hour time with seconds (e.g. 21:20:45)') },
            { code: '%a ・ %b %-d ・ %-I:%M %p', desc: _('Day, Date and Time (e.g. Fri ・ Oct 23 ・ 9:20 PM)') },
            { code: '%A, %B %-d', desc: _('Full Day and Month (e.g. Friday, October 23)') },
            { code: '%Y-%m-%d', desc: _('ISO Date (e.g. 2026-10-23)') },
            { code: '%e %b %H:%M', desc: _('Day, Short Month, 24h Time (e.g. 23 Oct 21:20)') },
        ];

        for (const token of tokens) {
            const row = new Adw.ActionRow({
                title: token.code,
                subtitle: token.desc,
            });
            const copyBtn = new Gtk.Button({
                icon_name: 'edit-copy-symbolic',
                valign: Gtk.Align.CENTER,
                tooltip_text: _('Use this format'),
            });
            copyBtn.connect('clicked', () => {
                modeRow.selected = 1; // Custom
                settings.set_string('date-format-mode', 'custom');
                customFormatRow.text = token.code;
                settings.set_string('custom-date-format', token.code);
            });
            row.add_suffix(copyBtn);
            helpExpander.add_row(row);
        }

        helpGroup.add(helpExpander);
        clockPage.add(helpGroup);

        window.add(clockPage);
    }
}
