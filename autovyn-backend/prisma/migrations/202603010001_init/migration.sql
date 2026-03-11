-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EMPLOYEE', 'HR');
CREATE TYPE "WorkMode" AS ENUM ('WFO', 'WFH', 'HYBRID');
CREATE TYPE "Permission" AS ENUM (
  'APPROVE_LEAVE',
  'APPROVE_ARS',
  'VIEW_TEAM',
  'MANAGE_EMPLOYEES',
  'CREATE_USER',
  'MANAGER',
  'TEAM_LEAD'
);
CREATE TYPE "AttendanceStatus" AS ENUM (
  'PRESENT',
  'LEAVE',
  'ABSENT',
  'HALF_DAY',
  'LATE',
  'HOLIDAY',
  'WEEKEND',
  'OVERTIME',
  'INVALID'
);
CREATE TYPE "LeaveType" AS ENUM ('CASUAL', 'SICK', 'SPECIAL', 'EMERGENCY', 'HALF_DAY');
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED');
CREATE TYPE "MissingType" AS ENUM ('MISSING_IN', 'MISSING_OUT', 'BOTH');

-- CreateTable
CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "employeeId" TEXT,
  "adminId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "designation" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "workMode" "WorkMode" NOT NULL DEFAULT 'WFO',
  "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
  "permissions" "Permission"[] DEFAULT ARRAY[]::"Permission"[],
  "managerId" UUID,
  "passwordHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_days" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'ABSENT',
  "punchInAt" TIMESTAMP(3),
  "punchOutAt" TIMESTAMP(3),
  "workingMinutes" INTEGER,
  "timezoneOffsetMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
  "id" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "approverId" UUID NOT NULL,
  "type" "LeaveType" NOT NULL,
  "reason" TEXT NOT NULL,
  "dates" TEXT[] NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
  "comment" TEXT,
  "actedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ars_requests" (
  "id" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "approverId" UUID NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "missingType" "MissingType" NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
  "correctedPunchInAt" TIMESTAMP(3),
  "correctedPunchOutAt" TIMESTAMP(3),
  "comment" TEXT,
  "actedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ars_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "imageUrl" TEXT,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
  "id" UUID NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "name" TEXT NOT NULL,
  "imageUrl" TEXT,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
  "id" UUID NOT NULL,
  "attendancePolicy" TEXT NOT NULL,
  "leavePolicy" TEXT NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");
CREATE UNIQUE INDEX "users_adminId_key" ON "users"("adminId");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_managerId_idx" ON "users"("managerId");

CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

CREATE UNIQUE INDEX "attendance_days_userId_date_key" ON "attendance_days"("userId", "date");
CREATE INDEX "attendance_days_userId_date_idx" ON "attendance_days"("userId", "date");

CREATE INDEX "leave_requests_employeeId_approverId_status_idx" ON "leave_requests"("employeeId", "approverId", "status");
CREATE INDEX "leave_requests_approverId_status_idx" ON "leave_requests"("approverId", "status");
CREATE INDEX "leave_requests_employeeId_status_idx" ON "leave_requests"("employeeId", "status");

CREATE INDEX "ars_requests_employeeId_approverId_status_idx" ON "ars_requests"("employeeId", "approverId", "status");
CREATE INDEX "ars_requests_approverId_status_idx" ON "ars_requests"("approverId", "status");
CREATE INDEX "ars_requests_employeeId_status_idx" ON "ars_requests"("employeeId", "status");
CREATE INDEX "ars_requests_employeeId_date_idx" ON "ars_requests"("employeeId", "date");

CREATE INDEX "announcements_createdAt_idx" ON "announcements"("createdAt");
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");
CREATE INDEX "holidays_date_idx" ON "holidays"("date");
CREATE INDEX "policies_createdAt_idx" ON "policies"("createdAt");

-- AddForeignKey
ALTER TABLE "users"
  ADD CONSTRAINT "users_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_days"
  ADD CONSTRAINT "attendance_days_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ars_requests"
  ADD CONSTRAINT "ars_requests_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ars_requests"
  ADD CONSTRAINT "ars_requests_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "holidays"
  ADD CONSTRAINT "holidays_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "policies"
  ADD CONSTRAINT "policies_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
