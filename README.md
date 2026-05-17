# ClaDex

Local installable desktop workspace for OpenClaude-compatible chat, OpenDesign-style design workflows, MCP servers, skills, projects, and local chat history.

## Run Locally

```powershell
npm install
npm run build:renderer
npm run electron
```

## Build Windows Installer

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build
```

The installer is generated at:

```text
dist\ClaDex Setup 0.5.0.exe
```

## What The UI Manages

- React + Tailwind chat surface with Markdown and syntax highlighting
- SQLite-backed local chat history
- Chat and Design modes with separate OpenClaude and OpenDesign model profiles
- Model provider, endpoint, token, temperature, context, and streaming defaults
- Feature toggles for memory, code execution, web search, voice, and computer use
- Local skill entries with enable/disable, slash calls, instructions, knowledge base, source repo, and auto-invoke
- GitHub skill import from all `skills/*/SKILL.md` files, standalone `SKILL.md`, `README.md`, or Markdown instruction files
- Default `obra/superpowers` skills available globally in Chat and Design modes
- MCP server command, args, environment, and enabled state
- Project spaces with pinned project support
- Artifacts view for generated or attached images, videos, webpages, and files
- Browser PiP window capped at 800x600 with navigation controls
- Appearance preferences
- Import, export, and config file path selection
- OS keychain storage for API keys when available

By default, the app writes `cladex-config.json` in Electron's user data folder. Use **Config path** in Settings to point it at the real config file.

## Release Checklist

```powershell
npm install
npm run make:icon
npm run check
npm run build
```

Upload the generated installer from `dist\ClaDex Setup 0.5.0.exe` with the matching `v0.5.0` GitHub release tag.

## Import A GitHub Skill

1. Open **Customize**.
2. Go to **Skills**.
3. Paste a GitHub repository URL into **Import from GitHub**.
4. Click **Import**.
5. ClaDex imports all detected skills from the repo.
6. Review the expanded skill forms, adjust slash calls or instructions if needed, then click **Save**.
