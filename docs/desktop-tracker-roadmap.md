# Desktop Tracker Roadmap

## Goal

Replace the current editor-only tracker with an installable Autovyn desktop app that:

- installs on Windows, Ubuntu, and macOS
- requires employee sign-in
- starts with the system and keeps running in the background
- tracks total working time, active time, idle time, and live status
- syncs data to the existing Autovyn backend so the current employee and admin dashboards continue to work

## Recommended Stack

Use `Electron + TypeScript + electron-builder`.

Why this fits the current repo:

- your team is already working in TypeScript
- it is easier to reuse API logic from the current extension
- Electron supports tray apps, auto-launch, background windows, secure local storage, and cross-platform installers
- packaging to `.exe`, `.dmg`, and `.AppImage` or `.deb` is well supported

`Tauri` is also a good option if installer size matters a lot, but it adds Rust to the stack and will slow down the first migration.

## MVP Scope

The first desktop version should do only the things needed to replace the extension safely:

- employee login with access token and refresh token
- secure token storage
- tray icon with `Active`, `Idle`, `Offline`, and `Signed out` states
- auto-start on login
- background heartbeat sync every 10 to 30 seconds
- idle detection from keyboard and mouse inactivity
- detect screen lock, unlock, suspend, and resume
- send total active and inactive seconds to `/api/worklog/heartbeat`
- offline queue so data syncs after internet returns

## Existing Backend Reuse

The current backend is already close to what the desktop app needs.

Keep using:

- `POST /api/auth/login/employee`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/worklog/heartbeat`
- `GET /api/worklog/summary`

For the desktop app heartbeat payload, send:

```json
{
  "status": "ACTIVE",
  "durationSeconds": 60,
  "recordedAt": "2026-03-19T09:15:00.000Z",
  "deviceId": "machine-or-install-id",
  "editor": "desktop-agent",
  "isFocused": true
}
```

In the current codebase, the `editor` field is the safest place to store tracker source without changing the database schema again right now.

## Desktop App Structure

Suggested new project folder:

```text
autovyn-desktop/
  src/main/
  src/preload/
  src/renderer/
  assets/
```

Suggested responsibilities:

- `src/main/`: system tray, auto-launch, idle detection, OS events, secure storage, background sync
- `src/preload/`: safe bridge between Electron main and renderer
- `src/renderer/`: login screen, status screen, sync logs, settings

## Data You Can Track

Good default data:

- total active time
- total idle time
- first activity time
- last activity time
- current live status
- today tracked total
- last sync time
- device id
- tracker source

Good optional data for phase 2:

- active application name
- website domain when browser is active
- per-app time split
- break sessions
- meeting time
- manual note for corrected time

High-risk data that should be policy-controlled before building:

- screenshots
- keystroke logging
- clipboard logging
- full window titles for personal apps

## Dashboard Changes

The dashboard should stop assuming the source is only VS Code.

The updates in this repo now make the UI source-aware:

- current source can still show as `VS Code extension`
- a future desktop build can report `desktop-agent`
- the employee dashboard copy now says `Work Tracker` instead of hardcoding only `VS Code`

## Best Next Features

Strong next ideas after MVP:

- punch in and punch out directly from the tray app
- break mode with reason
- daily summary popup before logout or shutdown
- manager alert if tracker stays offline during shift
- policy-driven screenshot capture for approved teams only
- timesheet autofill suggestions from tracked app usage
- tamper detection when system time changes sharply
- local cache encryption
- silent auto-update support

## Delivery Plan

### Phase 1

Build the desktop app shell, login, secure storage, tray, auto-launch, idle detection, and heartbeat sync.

### Phase 2

Connect punch in and punch out, lock and sleep handling, offline queue replay, and settings.

### Phase 3

Add app usage analytics, optional evidence capture, manager controls, and installer signing.

## Notes

- Windows installer: `.exe`
- macOS installer: `.dmg`
- Ubuntu installer: `.AppImage` first, `.deb` if needed
- Keep the extension alive during migration so employees do not lose tracking while the desktop app is being tested
