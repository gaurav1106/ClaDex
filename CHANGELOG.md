# Changelog

## 0.5.0 - 2026-05-17

- Removed OpenClaude/Open Design starter import buttons from Skills settings.
- Made skill auto-call enabled by default for new, imported, and normalized skills.
- Added a browser PiP launcher with an 800x600 maximum floating browser, Back, Close, and return-to-chat controls.
- Restored an Artifacts menu for chat and project outputs with image/video previews and bookmark controls.
- Updated Windows executable icon editing so installed builds use the ClaDex app icon.

## 0.4.0 - 2026-05-17

- GitHub skill import now imports every matching skill in a repository, including all `skills/*/SKILL.md` files.
- Added `obra/superpowers` as a default skill source.
- Default seeding fills in missing Superpowers skills on config load while preserving existing user skills.
- Imported skills remain global and are available from both Chat and Design modes.

## 0.3.0 - 2026-05-17

- Added GitHub skill import from the Skills settings page.
- Parses common skill files such as `SKILL.md`, `README.md`, `prompt.md`, and `instructions.md`.
- Auto-fills skill name, description, source repo, slash call, instructions, and knowledge base from the imported repository.

## 0.2.0 - 2026-05-17

- Redesigned the app around a Codex-style dark workspace with Chat and Design modes.
- Added OpenClaude and OpenDesign model profiles.
- Added project and chat pinning with persisted SQLite state.
- Added skill import, creation, editing, slash calls, and model prompt injection.
- Added MCP, file, image, and skill insertion from the composer plus menu.
- Added reply copy actions for assistant messages.
- Removed Automations and Artifacts UI surfaces.
- Updated the ClaDex app and installer icon.

## 0.1.0 - 2026-05-16

- Initial local Electron desktop app scaffold.
