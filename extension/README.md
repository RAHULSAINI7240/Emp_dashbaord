# Autovyn_treacar

Autovyn_treacar is a VS Code extension that authenticates Autovyn employees, tracks development activity inside the editor, and periodically sends analytics data to the Autovyn backend for dashboard reporting.

This is the current tracker client in the repo. The same worklog API can also power a future installable desktop tracker for Windows, Ubuntu, and macOS.

Marketplace note: VS Code extension package names cannot contain underscores, so the publishable identifier is `autovyn.autovyn-treacar` while the visible product name remains `Autovyn_treacar`.

## Features

- Employee login with persistent VS Code session storage
- Silent token refresh so expired access tokens do not immediately log the employee out
- Live activity tracking for:
  - text changes
  - file saves
  - active editor changes
  - selection changes
  - visible range changes while navigating files
  - active terminal changes
  - file create, rename, and delete events
  - VS Code window focus changes
- Idle detection after configurable inactivity
- 5-second activity evaluation for faster live status updates
- 10-second heartbeat sync to the backend worklog service
- Status bar visibility for `Active`, `Idle`, `Tracking`, and `Reconnect Needed`
- Markdown activity report with local metrics, backend worklog summary, and optional local AI summary via Ollama

## Backend contract

The extension defaults to:

- Login: `POST /api/auth/login/employee`
- Logout: `POST /api/auth/logout`
- Worklog heartbeat upload: `POST /api/worklog/heartbeat`

The code also attempts `POST /api/employee/login` as a fallback because that route was requested in the initial spec, but the current backend in this repository exposes `POST /api/auth/login/employee`.

Expected heartbeat payload:

```json
{
  "status": "ACTIVE",
  "durationSeconds": 60,
  "recordedAt": "2026-03-09T09:15:00.000Z",
  "deviceId": "vscode-machine-id",
  "editor": "vscode-extension",
  "isFocused": true
}
```

## Settings

- `autovyn.apiUrl`: base URL for the backend API. Default: `http://localhost:3001`
- `autovyn.idleTimeout`: idle timeout in seconds. Default: `60`
- `autovyn.summaryProvider`: `local` or `ollama`. Default: `local`
- `autovyn.ollamaUrl`: local Ollama generate endpoint. Default: `http://127.0.0.1:11434/api/generate`
- `autovyn.ollamaModel`: local Ollama model for AI summaries. Default: `llama3.2:3b`

## AI Summary

The extension works without any external AI service by default. If you want an AI-generated summary using a free local model:

1. Install Ollama from `https://ollama.com`.
2. Pull a model such as `llama3.2:3b`.
3. Set `autovyn.summaryProvider` to `ollama`.
4. Run `Autovyn: Show Activity Summary`.

If Ollama is not available, the extension falls back to the built-in local summary report and keeps tracking normally.

## Development

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run compile
```

Run in the Extension Development Host:

1. Open the `extension` folder in VS Code.
2. Run `npm install`.
3. Press `F5`.
4. In the launched Extension Development Host, trigger `Autovyn: Login` if the login prompt does not appear automatically.

## Packaging

Create a VSIX package:

```bash
npm run package
```

This uses `@vscode/vsce` from the local dev dependencies and packages without bundled runtime dependencies because the extension uses native `fetch`.

## Publishing

1. Create a publisher named `autovyn` in the Visual Studio Marketplace.
2. Authenticate `vsce` with a Personal Access Token that has Marketplace publish permissions.
3. Update the version in `package.json`.
4. Publish:

```bash
npm run publish
```

## Notes

- Tokens are stored in VS Code Secret Storage and employee profile metadata is stored in `globalState`.
- Tracking is disabled until the employee has logged in successfully.
- If a heartbeat gets a `401`, the extension tries to refresh the session and retry automatically instead of clearing the saved employee login.
- If refresh fails, the extension keeps the stored employee session, marks the status as reconnect-needed, and retries again later.
- The extension sends active and idle heartbeat deltas to the existing backend worklog module, which powers the employee dashboard summary cards.
