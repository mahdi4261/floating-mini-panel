UUID = floating-mini-panel@mahdi4261.github.com
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all build install uninstall clean

all: build

build:
	glib-compile-schemas schemas/

install: build
	mkdir -p $(INSTALL_DIR)
	cp -r * $(INSTALL_DIR)/
	-gnome-extensions enable $(UUID)
	@echo "Installed $(UUID) to $(INSTALL_DIR)."
	@echo "If on Wayland, please log out and log back in. If on X11, press Alt+F2, type 'r', and Enter."

uninstall:
	-gnome-extensions disable $(UUID)
	rm -rf $(INSTALL_DIR)
	@echo "Uninstalled $(UUID)."

clean:
	rm -f schemas/gschemas.compiled
