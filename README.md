# Autovyn Employee Dashboard Monorepo

This repository contains the full Autovyn employee platform:

- `autovyn-web`: Angular 20 frontend for employee and admin dashboards
- `autovyn-backend`: Node.js + Express + Prisma + MongoDB backend API
- `autovyn-desktop`: installable desktop agent for Windows, macOS, and Ubuntu/Linux
- `extension`: current tracker client built as a VS Code extension for employee activity tracking and worklog sync
- `docs/desktop-tracker-roadmap.md`: migration plan for a real installable desktop tracker app

The three projects are designed to work together during local development:

- frontend calls the backend at `http://localhost:3001/api`
- VS Code extension calls the backend at `http://localhost:3001`
- backend serves the API and connects to MongoDB

## Repository Structure

```text
.
├── autovyn-backend/
├── autovyn-desktop/
├── autovyn-web/
├── docs/
└── extension/
```

## Prerequisites

Install these before starting:

- Git
- Node.js `20.19+`
- npm
- MongoDB with a replica set enabled, or MongoDB Atlas
- Electron dependencies, if you want to run the desktop agent
- VS Code, if you want to run or test the extension

If you want to replace the extension with an installable desktop app, start with [`docs/desktop-tracker-roadmap.md`](/home/rahul/Documents/Proj-BACKUP/Proj/Autovyn_web/docs/desktop-tracker-roadmap.md).

Node 20 is recommended for the whole repo because the Angular app requires it.

## Clone The Project

```bash
git clone https://github.com/rahul-autovyn/autovyn_employee_dashaboard.git
cd autovyn_employee_dashaboard
```

## First-Time Setup

There is no root workspace package manager file yet, so dependencies must be installed in each project separately.

### 1. Install frontend dependencies

```bash
cd autovyn-web
npm install
cd ..
```

### 2. Install backend dependencies

```bash
cd autovyn-backend
npm install
cp .env.example .env
cd ..
```

### 3. Install extension dependencies

```bash
cd extension
npm install
cd ..
```

### 4. Install desktop agent dependencies

```bash
cd autovyn-desktop
npm install
cd ..
```

## Backend Environment

Update `autovyn-backend/.env` after copying it from `.env.example`.

Important defaults:

```env
PORT=3001
DATABASE_URL="mongodb://127.0.0.1:27017/autovyn_db?directConnection=true&replicaSet=rs0"
CORS_ORIGIN="http://localhost:4200,https://emp-dashboard-frontend.onrender.com"
ARS_APPROVER_MODE="ADMIN"
```

You must also set secure JWT secrets:

```env
JWT_ACCESS_SECRET="replace-with-strong-access-secret"
JWT_REFRESH_SECRET="replace-with-strong-refresh-secret"
```

If you use a local MongoDB instance, make sure it is available with replica set support because the sample `DATABASE_URL` expects `replicaSet=rs0`.

## Database Setup

From the backend folder:

```bash
cd autovyn-backend
npm run prisma:generate
npm run prisma:push
npm run db:seed
cd ..
```

This generates Prisma client files, applies the schema to MongoDB, and seeds sample users.

## Run The Projects

Use separate terminals for each service.

### Start backend

```bash
cd autovyn-backend
npm run dev
```

Backend base URL:

```text
http://localhost:3001/api
```

### Start frontend

```bash
cd autovyn-web
npm start
```

To expose the frontend on your local Wi-Fi for testing from another device:

```bash
cd autovyn-web
npm run start:lan
```

Frontend dev server:

```text
http://localhost:4200
```

### Start extension development

```bash
cd extension
npm run compile
```

Then:

1. Open the `extension` folder in VS Code.
2. Press `F5` to launch the Extension Development Host.
3. Use the `Autovyn: Login` command if login does not appear automatically.

The extension points to `http://localhost:3001` by default.

### Start desktop agent development

```bash
cd autovyn-desktop
npm start
```

The desktop agent points to `http://localhost:3001` by default and keeps running in the system tray until the user logs out manually.

## Seed Login Accounts

After running `npm run db:seed`, these demo accounts are available:

- Admin: `VYN01` / `Admin@123`
- HR: `VYN04` / `Emp@123`
- Managers: `VYN02` / `Emp@123`, `VYN03` / `Emp@123`
- Employees: `VYN05` to `VYN09` / `Emp@123`

## Common Commands

### Frontend

```bash
cd autovyn-web
npm start
npm run build
npm test
```

### Backend

```bash
cd autovyn-backend
npm run dev
npm run build
npm start
npm run prisma:generate
npm run prisma:push
npm run db:seed
```

### Extension

```bash
cd extension
npm run compile
npm run watch
npm run package
```

### Desktop Agent

```bash
cd autovyn-desktop
npm run check
npm start
npm run pack
npm run dist
```

## Recommended Startup Order

For a new local setup, start things in this order:

1. MongoDB
2. `autovyn-backend`
3. `autovyn-web`
4. `autovyn-desktop` if you want the installable background agent
5. `extension` development host only if you still need the old tracker

## Access From Another Device On The Same Wi-Fi

For LAN testing:

1. Start the backend with `npm run dev` inside `autovyn-backend`.
2. Start the frontend with `npm run start:lan` inside `autovyn-web`.
3. Open the frontend on the second device using `http://<your-wifi-ip>:4200`.
4. Call the backend API from the second device using `http://<your-wifi-ip>:3001/api`.

In development, the backend now accepts `localhost` and private LAN origins such as `192.168.x.x`, `172.16.x.x` to `172.31.x.x`, and `10.x.x.x`.

## Notes For New Developers

- Do not commit `.env` files.
- `node_modules` and `dist` folders are intentionally ignored.
- The frontend and extension assume the backend is running on localhost unless their config is changed.
- If you only need the dashboard app, you can skip the extension setup.

## Project-Specific Docs

- `autovyn-web/README.md`
- `autovyn-backend/README.md`
- `extension/README.md`
