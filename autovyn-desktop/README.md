# Autovyn Desktop

Autovyn Desktop is the installable desktop app for Autovyn employees.

It is designed to:

- sign in with backend employee ID and password
- stay alive in the system tray
- auto-start with the operating system
- keep running in the background until manual logout
- track active time, idle time, total tracked time, and sync heartbeats to the existing backend

## Current Scope

This project already includes:

- employee login against `POST /api/auth/login/employee`
- refresh token reuse through `POST /api/auth/refresh`
- logout through `POST /api/auth/logout`
- heartbeat sync through `POST /api/worklog/heartbeat`
- tray app shell
- local encrypted state when Electron safe storage is available
- persistent login until logout
- idle detection using Electron `powerMonitor`
- auto-launch toggle
- packaging config for Windows, macOS, and Linux

## Install Dependencies

```bash
cd autovyn-desktop
npm install
```

## Run In Development

```bash
cd autovyn-desktop
npm start
```

## Quick Validation

```bash
cd autovyn-desktop
npm run check
```

## Build Setup Files

```bash
cd autovyn-desktop
npm run dist
```

Expected outputs:

- Windows: NSIS installer `.exe`
- macOS: `.dmg`
- Linux: `.AppImage` and `.deb`

## Set A Live Backend Before Building

Update [`src/build-config.json`](/home/rahul/Documents/Proj-BACKUP/Proj/Autovyn_web/autovyn-desktop/src/build-config.json) before creating the installer:

```json
{
  "defaultApiBaseUrl": "https://your-backend.onrender.com"
}
```

This makes fresh installs point to your hosted backend by default instead of `localhost`.

Users can still change the API URL later from the settings screen inside the app.

## Distribute To Another Desktop

1. Deploy `autovyn-backend` and your database online first.
2. Set the live backend URL in [`src/build-config.json`](/home/rahul/Documents/Proj-BACKUP/Proj/Autovyn_web/autovyn-desktop/src/build-config.json).
3. Run `npm run dist` inside `autovyn-desktop`.
4. Share the generated installer from `autovyn-desktop/dist/`.
5. Install that app on the employee machine and sign in there.

The source code folder is not needed on the employee system. Only the installed desktop app is needed.

Preferred packaged filenames:

- Windows: `Autovyn-Desktop-Setup.exe`
- macOS: `Autovyn-Desktop.dmg`
- Linux: `Autovyn-Desktop.AppImage` or `Autovyn-Desktop.deb`

## Platform Note

For the smoothest packaging results, build each installer on its target operating system:

- build Windows `.exe` on Windows
- build macOS `.dmg` on macOS
- build Linux packages on Linux

## Notes

- Default backend URL comes from [`src/build-config.json`](/home/rahul/Documents/Proj-BACKUP/Proj/Autovyn_web/autovyn-desktop/src/build-config.json)
- The desktop app accepts either `http://localhost:3001` or `http://localhost:3001/api` and normalizes both correctly
- Heartbeats are sent with `editor: "desktop-agent"` so the current dashboard can distinguish this source from the old VS Code extension
- Closing the window hides the app instead of stopping tracking
- Use the tray menu or the logout button to stop the desktop app manually
