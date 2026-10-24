# [<img src="img/fmp.png" width="48" valign="middle"/>](img/fmp.png) Floating Mini Panel (Enhanced Fork)

> [!NOTE]
> **AI-Generated Code Notice**: The modifications, bug fixes, and additional features in this fork were AI-generated (assisted by Google DeepMind Antigravity).
>
> **Credits & Attribution**: Full credit belongs to the original author, **Gerhard Himmel ([ghi59](https://github.com/ghi59))**, who created the original [Floating Mini Panel extension](https://github.com/ghi59/floating-mini-panel) (available on [GNOME Extensions](https://extensions.gnome.org/extension/8274/floating-mini-panel/)). This repository is a personal fork that adds customization options and fixes on top of his original work.

---

## About This Fork

Floating Mini Panel replaces the GNOME top bar with a movable, always-on-top **Mini Panel** containing the Date/Clock menu, Quick Settings, and App/Extension indicators.

This fork extends the original extension with several enhancements:

1. **Modern GNOME Shell Support (GNOME 47, 48, 49, 50+)**:
   - Fixed `super.destroy` runtime errors on modern GNOME versions.
   - Updated event propagation to modern Clutter standards (`Clutter.EVENT_PROPAGATE` / `Clutter.EVENT_STOP`).
   - Fixed startup race conditions when GNOME Shell is already loaded.
2. **Date & Time Customization**:
   - **Time-only mode**: Displays just the time (e.g. `10:45 AM`), omitting the date for a clean and minimalist look.
   - **Custom format**: Full support for `GLib.DateTime` / `strftime` format strings (e.g., `%-I:%M %p`, `%H:%M`, `%a %b %-d %H:%M`).
   - **Follow `panel-date-format`**: Automatically syncs format with the [`panel-date-format`](https://github.com/KEIII/gnome-shell-panel-date-format) extension if installed.
   - **GNOME Default**: Standard system clock format.
   - **Notification indicator**: Toggle the notification dot next to the clock on or off.
3. **Blur-my-shell Integration**:
   - Native integration with the popular [`blur-my-shell`](https://github.com/aunetx/blur-my-shell) extension.
   - Automatically inherits the exact blur settings (sigma, brightness, noise, color tint, contrasted style) configured for the top panel without modifying `blur-my-shell`.
   - Dynamically tracks panel geometry, position, and rounded corner radius.
4. **Smart Screen-Boundary Menu Placement & Quick Settings Scrolling**:
   - When the mini panel is placed at the bottom or sides of the screen, popup menus (Calendar/Notification tray, Quick Settings, Control Menu, AppIndicators) open towards the screen interior without flipping off-screen or cutting off.
   - Constrains maximum popup height to the available space between the panel and the monitor edge.
   - DateMenu's notification list scrolls smoothly inside its container.
   - Adds smooth vertical scrolling (`St.ScrollView`) to Quick Settings, allowing all toggles and submenus to be scrolled with the mouse wheel or touchpad when space is limited.
5. **Component Visibility Toggles & Preferences**:
   - Preferences UI (`prefs.js`) to toggle individual elements: Handle button, Indicators Drawer, Date/Clock button, Quick Settings button.
   - Fallback drag gesture on the panel when the handle button is hidden.
   - Convenient access to preferences directly from the Control Menu.
6. **Distinct Extension Identity**:
   - Configured with UUID `floating-mini-panel@mahdi4261.github.com` so GNOME Shell recognizes this fork alongside or independently from the upstream version without conflicts.

---

## Installation from GitHub

### Prerequisites
Make sure you have `git` and `glib-compile-schemas` (part of `glib2` / `glib2-devel`):
- **Fedora**: `sudo dnf install git glib2`
- **Ubuntu/Debian**: `sudo apt install git libglib2.0-bin-dev`
- **Arch Linux**: `sudo pacman -S git glib2`

### Option 1: Direct Clone (Recommended)

1. Clone the repository into your GNOME Shell extensions directory:
   ```bash
   git clone https://github.com/mahdi4261/floating-mini-panel.git ~/.local/share/gnome-shell/extensions/floating-mini-panel@mahdi4261.github.com
   ```

2. Compile the GSettings schema:
   ```bash
   glib-compile-schemas ~/.local/share/gnome-shell/extensions/floating-mini-panel@mahdi4261.github.com/schemas/
   ```

3. Restart GNOME Shell:
   - **Wayland**: Log out and log back in.
   - **X11**: Press `Alt + F2`, type `r`, and press `Enter`.

4. Enable the extension:
   ```bash
   gnome-extensions enable floating-mini-panel@mahdi4261.github.com
   ```
   *(Or toggle it on using the **Extensions** or **Extension Manager** app).*

### Option 2: Using Makefile

```bash
git clone https://github.com/mahdi4261/floating-mini-panel.git
cd floating-mini-panel
make install
```
Then log out and log back in (on Wayland) or restart GNOME Shell (`Alt + F2`, `r` on X11).

---

## Configuration & Preferences

Open the preferences window to customize the panel:
- **Command Line**:
  ```bash
  gnome-extensions prefs floating-mini-panel@mahdi4261.github.com
  ```
- **Via GUI**: Right-click longpress on the handle button, select **Settings**, or open it from the **Extension Manager** app.

### Configurable Options
- **Components**: Toggle Handle Button, Indicators Drawer, Date/Clock Button, and Quick Settings Button.
- **Clock Mode**: Choose between Time Only, GNOME Default, Custom Format, or Follow Panel Date Format extension.
- **Custom Strftime Format**: Specify your preferred format string (e.g. `%-I:%M %p` for 12-hour format or `%H:%M` for 24-hour format).
- **Notification Dot**: Show or hide the unread notification dot next to the clock.

---

## Features (from original extension)

 ![Screenshot from 20240928 182100](img/Floating-Mini-Panel-Dark.png?msec=1751949159799) ![](img/Floating-Mini-Panel-Light.png?msec=1751949159799)

- **Movable & Dockable**: Drag the mini panel anywhere on the desktop. It snaps and aligns when moved near screen edges.
- **Vertical Orientation**: Switch between horizontal and vertical orientations (middle-click longpress on the handle).
- **Predefined Positions**: Quick alignment presets (Top-Start, Top-Center, Top-End, Bottom-Start, Bottom-Center, Bottom-End) with dynamic rounded border corners.
- **System, Extension & AppIndicator Support**:
  - Middle-click the handle button to open or close the indicators drawer.
  - Middle-click an extension indicator to move it between the drawer and the always-visible area.
- **Auto Mode & Permanent Mode**:
  - **Permanent Mode**: Hides the main panel and keeps the mini panel visible.
  - **Auto Mode**: Mini panel shows only when the main panel is hidden (compatible with Hide Top Bar, Dash to Panel, PaperWM, or fullscreen windows).
- **Quick Temporary Hide**: Right-click the handle button to hide the mini panel for 5 seconds to access obstructed window controls.
- **Multi-Monitor Capable**: Relocates automatically when monitors are connected or disconnected.
- **Dark / Light Mode**: Adapts dynamically to your system color scheme.

---

## Usage Summary

| Action | Control |
| --- | --- |
| Drag panel | Left-click + drag on Handle Button (or anywhere on panel if handle is disabled) |
| Show Overview / App Grid | Left-click on Handle Button |
| Temporarily hide (5s) | Right-click on Handle Button |
| Open Drawer | Middle-click on Handle Button |
| Move indicator in/out of Drawer | Middle-click on the indicator |
| Open Control / Alignment Menu | Right-click longpress on Handle Button |
| Toggle Orientation (Horizontal/Vertical) | Middle-click longpress on Handle Button |
| Open Preferences | Select **Settings** in Control Menu, or run `gnome-extensions prefs ...` |

---

## License & Terms

Floating Mini Panel is licensed under the terms of the GNU General Public License v2 or later (GPL-2.0-or-later). See [LICENSE](LICENSE) for details.

Original Copyright (C) 2024, 2025 Gerhard Himmel.
Additional enhancements Copyright (C) 2026.
