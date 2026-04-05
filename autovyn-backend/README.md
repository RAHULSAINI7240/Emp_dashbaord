# Autovyn Backend (Node.js + Express + MongoDB + Prisma)

Production-grade backend for attendance, leave approvals, ARS approvals, employee directory, announcements, holidays, and policies.

## Stack
- Node.js (LTS)
- Express.js
- MongoDB
- Prisma ORM
- JWT (access + refresh)
- bcryptjs
- Zod validation
- dotenv
- Helmet + CORS + rate limiting
- Morgan request logging
- Centralized error handling

## Project Structure
```text
src/
  config/
  db/
  middleware/
  modules/
    auth/
    users/
    attendance/
    leaves/
    ars/
    announcements/
    holidays/
    policies/
  utils/
  app.ts
  server.ts
```

## Setup (Step-by-step)
1. Open backend folder:
   ```bash
   cd autovyn-backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy env file:
   ```bash
   cp .env.example .env
   ```
4. Start MongoDB (local or Atlas).
   Local Docker example:
   ```bash
   docker run -d --name autovyn-mongo -p 27017:27017 mongo:7
   ```
5. Set MongoDB connection in `.env`:
   ```env
   DATABASE_URL="mongodb://127.0.0.1:27017/autovyn_db?directConnection=true&replicaSet=rs0"
   ```
6. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```
7. Push Prisma schema to MongoDB:
   ```bash
   npm run prisma:push
   ```
8. Seed bundled dummy login data:
   ```bash
   npm run db:seed
   ```
9. Start development server:
   ```bash
   npm run dev
   ```

Base URL: `http://localhost:3001/api`

## Environment
Use `.env.example` as reference.

Important values:
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ARS_APPROVER_MODE=ADMIN|MANAGER|AUTO`
- `CORS_ORIGIN=http://localhost:4200,https://emp-dashboard-frontend.onrender.com`
- `TRUST_PROXY=1` when deployed behind Render/reverse proxies so rate limiting uses the real client IP
- `BOOTSTRAP_CORE_USERS=true` on Render if you want startup-created Admin/HR/Manager accounts without running `db:seed`
- Optional live demo login: set `DEMO_LOGIN_ID` and `DEMO_PASSWORD` on Render to auto-create/refresh a known account at startup

## Seed Users
- `npm run db:seed` imports the bundled dummy CSV at `prisma/data/dummy-autovyn-users.csv`.
- It also creates fixed local testing accounts: `VYN01`, `VYN02`, and `VYN03`.
- Employee login uses the CSV `EmployeeID` values such as `EMP1001`.
- Passwords come from the CSV `UserPassword` column by default.

## Authentication
- `POST /auth/login`
- `POST /auth/login/admin`
- `POST /auth/login/employee`
- `POST /auth/refresh`
- `POST /auth/logout`

Token format:
```http
Authorization: Bearer <accessToken>
```

## Timezone Handling
- Timestamps are stored in UTC.
- Client can pass timezone offset minutes:
  - Header: `x-timezone-offset`
  - Query: `timezoneOffsetMinutes`
  - Body: `timezoneOffsetMinutes` (for punch endpoints)

Example offset from browser JS:
```ts
const offset = new Date().getTimezoneOffset();
```

## API Response Format
Success:
```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

Error:
```json
{
  "success": false,
  "message": "...",
  "data": null,
  "errorCode": "..."
}
```

## Endpoints

### Auth
- `POST /auth/login` `{ loginId, password }`
- `POST /auth/login/admin` `{ adminId, password }`
- `POST /auth/login/employee` `{ employeeId, password }`
- `POST /auth/refresh` `{ refreshToken }`
- `POST /auth/logout` `{ refreshToken }`

### Users / Team
- `POST /users` (ADMIN or CREATE_USER/MANAGE_EMPLOYEES)
  - `adminId` / `employeeId` optional. If omitted, backend auto-generates next code: `VYN01`, `VYN02`, ...
- `GET /users/me`
- `GET /users/approvers?type=leave|ars|both`
- `GET /team/members?search=&city=&workMode=&onlineStatus=&page=&limit=`
- `GET /team/member/:id`

### Attendance
- `POST /attendance/punch-in`
- `POST /attendance/punch-out`
- `GET /attendance/month?month=YYYY-MM`
- `GET /attendance/day?date=YYYY-MM-DD`
- `GET /attendance/report?from=YYYY-MM-DD&to=YYYY-MM-DD&employeeId=&page=&limit=`

### Leave
- `POST /leaves/request` `{ approverId, type, reason, dates[] }`
- `GET /leaves/my?status=&page=&limit=`
- `GET /leaves/approvals/pending?search=&page=&limit=`
- `GET /leaves/approvals/history?status=&search=&page=&limit=`
- `POST /leaves/:id/approve` `{ comment? }`
- `POST /leaves/:id/decline` `{ comment? }`

### ARS
- `POST /ars/request` `{ date, missingType, reason, approverId? }`
- `GET /ars/my?status=&page=&limit=`
- `GET /ars/approvals/pending?search=&page=&limit=`
- `POST /ars/:id/approve` `{ correctedPunchIn?, correctedPunchOut?, comment? }`
- `POST /ars/:id/decline` `{ comment? }`

### Announcements
- `GET /announcements?page=&limit=`
- `POST /announcements` (ADMIN)

### Holidays
- `GET /holidays?year=YYYY`
- `POST /holidays` (ADMIN)

### Policies
- `GET /policies`
- `POST /policies` (ADMIN)

## Example Requests

### Employee login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"EMP1001","password":"2016-02-19"}'
```

### Render startup users
If your Render service does not run `npm run db:seed`, use these environment variables so the backend auto-creates your main login accounts on startup:
```env
CORS_ORIGIN=http://localhost:4200,https://emp-dashboard-frontend.onrender.com
TRUST_PROXY=1
BOOTSTRAP_CORE_USERS=true
BOOTSTRAP_ADMIN_LOGIN_ID=VYN01
BOOTSTRAP_ADMIN_PASSWORD=Admin@123
BOOTSTRAP_HR_LOGIN_ID=VYN02
BOOTSTRAP_HR_PASSWORD=Hr@12345
BOOTSTRAP_MANAGER_LOGIN_ID=VYN03
BOOTSTRAP_MANAGER_PASSWORD=Manager@123
```

### Render demo login
For one extra live demo user, set these environment variables in Render, redeploy, then log in with the configured credentials:
```env
CORS_ORIGIN=http://localhost:4200,https://emp-dashboard-frontend.onrender.com
TRUST_PROXY=1
DEMO_LOGIN_ID=DEMO01
DEMO_PASSWORD=Demo@12345
DEMO_ROLE=ADMIN
DEMO_NAME=Autovyn Demo
DEMO_DESIGNATION=Administrator
DEMO_CITY=Remote
DEMO_WORK_MODE=WFO
```

### Import users with one known password
```bash
npm run db:import:users:csv -- ./users.csv --default-password Emp@123
```

### Reset one user password
```bash
npm run db:password:set -- --login-id VYN001 --password Emp@123
```

### Reset all employee passwords
```bash
npm run db:password:set -- --all --role EMPLOYEE --password Emp@123
```

### Punch in
```bash
curl -X POST http://localhost:3001/api/attendance/punch-in \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"timezoneOffsetMinutes":-330}'
```

### Leave request
```bash
curl -X POST http://localhost:3001/api/leaves/request \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "approverId":"<MANAGER_OBJECT_ID>",
    "type":"CASUAL",
    "reason":"Family event",
    "dates":["2026-03-12","2026-03-13"]
  }'
```

### ARS approve
```bash
curl -X POST http://localhost:3001/api/ars/<ARS_ID>/approve \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "correctedPunchIn":"2026-03-01T09:30:00.000Z",
    "correctedPunchOut":"2026-03-01T18:00:00.000Z",
    "comment":"Approved after verification"
  }'
```

## Notes
- Leave auto-expiry is enforced on leave API calls:
  - pending leave with `startDate < today` becomes `EXPIRED`
  - attendance for those leave dates is marked `ABSENT`
- Managers can only approve leave/ARS for employees where `employee.managerId === manager.id`.
- Non-admin users cannot self-approve leave/ARS.
- MongoDB IDs use 24-char ObjectId strings (not UUID).
- `/api/health` now returns `503` when MongoDB is unreachable, so DB issues are distinguishable from auth failures.
- `db:import:users:csv` and `db:import:users:xlsx` accept `--default-password <password>` if you want predictable imported credentials.
