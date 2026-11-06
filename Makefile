APP_NAME := kindly-reminder
APP_TITLE := Kindly Reminder
VERSION := 0.1.0
DMG := dist/$(APP_NAME)-$(VERSION).dmg
APP_BUNDLE := $(APP_TITLE).app
TEMP_DMG := /tmp/$(APP_NAME)-$(VERSION).dmg
LAUNCHER_APP := .build/Kindly Reminder Launcher.app

.PHONY: dev build run dmg install open launcher

dev:
	tinyjs dev

build:
	tinyjs build

run: build
	./dist/$(APP_NAME)

launcher:
	@set -e; \
	app="$(LAUNCHER_APP)"; \
	mkdir -p "$$app/Contents/MacOS"; \
	cp scripts/launch-from-dock.sh "$$app/Contents/MacOS/KindlyReminderLauncher"; \
	chmod +x "$$app/Contents/MacOS/KindlyReminderLauncher" scripts/run-in-terminal.command; \
	cp scripts/launcher-Info.plist "$$app/Contents/Info.plist"; \
	echo "Gotowy launcher: $$app"; \
	echo 'Przeciągnij go z Findera do Docka, aby przypiąć.'; \
	open -R "$$app"

dmg:
	tinyjs build
	@set -e; \
	stage_dir=.build/dmg; \
	image_log=.build/hdiutil-create.log; \
	rm -rf "$$stage_dir"; \
	mkdir -p "$$stage_dir"; \
	cp -R "dist/$(APP_BUNDLE)" "$$stage_dir/"; \
	ln -s /Applications "$$stage_dir/Applications"; \
	attempt=1; created=0; \
	while [ "$$attempt" -le 4 ]; do \
	  rm -f "$(TEMP_DMG)"; \
	  if hdiutil create -verbose -nospotlight -volname "$(APP_TITLE)" -srcfolder "$$stage_dir" -ov -format UDZO "$(TEMP_DMG)" >"$$image_log" 2>&1; then created=1; break; fi; \
	  echo "hdiutil nie odmontował obrazu; ponawiam próbę $$attempt/4" >&2; \
	  attempt=$$((attempt + 1)); sleep 1; \
	done; \
	if [ "$$created" -ne 1 ]; then cat "$$image_log" >&2; exit 1; fi; \
	mv "$(TEMP_DMG)" "$(DMG)"; \
	echo "Utworzono $(DMG)"

# Builds the DMG, mounts it, and copies the app bundle into /Applications.
install: dmg
	@set -e; \
	mount_point=$$(mktemp -d /tmp/kindly-reminder.XXXXXX); \
	cleanup() { hdiutil detach "$$mount_point" >/dev/null 2>&1 || true; rmdir "$$mount_point" 2>/dev/null || true; }; \
	trap cleanup EXIT; \
	hdiutil attach -quiet -nobrowse -readonly -mountpoint "$$mount_point" "$(DMG)"; \
	sudo ditto "$$mount_point/$(APP_BUNDLE)" "/Applications/$(APP_BUNDLE)"; \
  echo "Zainstalowano /Applications/$(APP_BUNDLE) — możesz uruchamiać aplikację przez Spotlight."

open:
	open "/Applications/$(APP_BUNDLE)"
