# Autovyn_employee_dashboard

Production-grade Angular 20 web app scaffold inspired by the Autovyn mobile UX, redesigned for responsive web dashboard usage.

## 1) Create and Run (Step-by-step)

Because Angular 20 requires Node `>=20.19`, and some environments may default to Node 18, use temporary Node 20 via `npx`.

1. Create project (already done in this repo):
```bash
npx -y -p node@20 -p @angular/cli@20 ng new autovyn-web --routing --style=scss --strict --standalone --skip-git
```

2. Install dependencies: 
```bash
npm install
npm install @angular/material@20 @angular/cdk@20 @angular/animations@20
```

3. Run dev server:
```bash
npx -y -p node@20 node ./node_modules/@angular/cli/bin/ng serve
```

4. Production build:
```bash
npx -y -p node@20 node ./node_modules/@angular/cli/bin/ng build
```

## 2) Architecture

- Angular 20 strict mode
- Standalone components
- Lazy loaded feature routes
- Route guards: auth, role, permission
- Interceptor stub for Bearer token
- SCSS design system with global variables/mixins/components/utilities
- LocalStorage persistence for mock auth + attendance + leave + ARS state

## 3) Folder Structure

```text
src/app/
  core/
    guards/
    interceptors/
    layouts/
    services/
  shared/
    components/
    models/
    utils/
  features/
    auth/
    employee/
    admin/
```

## 4) Auth and Roles

- `/auth/login` supports Employee/Admin mode.
- Session stores token, userId, roles, permissions in localStorage.
- Redirects:
  - Employee -> `/employee/dashboard`
  - Admin -> `/admin/dashboard`
- Employee with manager/team lead permissions sees approvals menus.

## 5) Business Logic Implemented

- Leave request flow:
  - Employee creates request with selected approver.
  - Approver/Admin can approve/decline.
  - Approved -> attendance marked `LEAVE` or `HALF_DAY`.
  - Declined -> attendance marked `ABSENT`.
  - Past pending requests auto-marked `EXPIRED` and attendance set `ABSENT`.

- ARS request flow:
  - Employee submits for missing punch cases.
  - Approver/Admin can approve/decline.
  - Approved -> attendance corrected to `PRESENT` with mock punches.

## 6) Pages Included

Employee:
- Dashboard
- Timesheet
- Leave Management
- Leave Request
- Leave Approvals
- ARS Request
- ARS Status
- ARS Approvals
- Announcements
- Policies
- Holiday
- Projects (empty state)
- Employee Connect
- Profile

Admin:
- Dashboard
- Employees
- Unified Approvals (Leave/ARS/WFH placeholder)

## 7) UI System

Global SCSS files:
- `src/styles/_variables.scss`
- `src/styles/_mixins.scss`
- `src/styles/_components.scss`
- `src/styles/_utilities.scss`

Includes navy gradients, status chips, cards, hover transitions, shadows, rounded corners, skeleton loaders, empty states, and toast notifications.

## 8) API-Ready Extension Plan

To integrate Node APIs later:
1. Replace mock services in `core/services` with HttpClient calls.
2. Keep interfaces in `shared/models` as API contracts.
3. Move localStorage persistence behind repository/data-access classes.
4. Keep guards and UI unchanged; only service layer changes.
