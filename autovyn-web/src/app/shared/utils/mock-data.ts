import { ARSRequest } from '../models/ars.model';
import { AttendanceDay } from '../models/attendance.model';
import { LeaveRequest } from '../models/leave.model';
import { User } from '../models/user.model';
import { monthDays } from './date.util';

export const MOCK_USERS: User[] = [
  {
    id: 'u-admin',
    name: 'Ava Carter',
    email: 'ava.carter@autovyn.com',
    mobile: '9000000001',
    designation: 'Admin',
    roles: ['ADMIN'],
    permissions: ['APPROVE_LEAVE', 'APPROVE_ARS', 'MANAGE_EMPLOYEES'],
    city: 'New York',
    workMode: 'WFO',
    teamMemberIds: ['u-emp-1', 'u-emp-2', 'u-emp-rahul', 'u-mgr-1', 'u-mgr-2', 'u-hr-1']
  },
  {
    id: 'u-hr-1',
    name: 'Maya Sharma',
    email: 'maya.sharma@autovyn.com',
    mobile: '9000000002',
    designation: 'HR Executive',
    roles: ['HR'],
    permissions: ['CREATE_USER'],
    city: 'Pune',
    workMode: 'WFO',
    managerId: 'u-admin',
    teamMemberIds: ['u-emp-1', 'u-emp-2', 'u-emp-rahul', 'u-mgr-1', 'u-mgr-2']
  },
  {
    id: 'u-mgr-1',
    name: 'Noah Benson',
    email: 'noah.benson@autovyn.com',
    mobile: '9000000003',
    designation: 'Team Lead',
    roles: ['EMPLOYEE'],
    permissions: ['APPROVE_LEAVE', 'APPROVE_ARS', 'VIEW_TEAM'],
    city: 'Austin',
    workMode: 'HYBRID',
    managerId: 'u-admin',
    teamMemberIds: ['u-emp-1', 'u-emp-2']
  },
  {
    id: 'u-mgr-2',
    name: 'Kapil Nirjawani',
    email: 'kapil.nirjawani@autovyn.com',
    mobile: '9000000006',
    designation: 'Team Lead',
    roles: ['EMPLOYEE'],
    permissions: ['APPROVE_LEAVE', 'APPROVE_ARS', 'VIEW_TEAM'],
    city: 'Gurugram',
    workMode: 'HYBRID',
    managerId: 'u-admin',
    teamMemberIds: ['u-emp-rahul']
  },
  {
    id: 'u-emp-1',
    name: 'Liam Reed',
    email: 'liam.reed@autovyn.com',
    mobile: '9000000004',
    designation: 'Software Engineer',
    roles: ['EMPLOYEE'],
    permissions: [],
    city: 'Austin',
    workMode: 'WFO',
    managerId: 'u-mgr-1',
    teamMemberIds: []
  },
  {
    id: 'u-emp-2',
    name: 'Emma Ross',
    email: 'emma.ross@autovyn.com',
    mobile: '9000000005',
    designation: 'QA Engineer',
    roles: ['EMPLOYEE'],
    permissions: [],
    city: 'Seattle',
    workMode: 'WFH',
    managerId: 'u-mgr-1',
    teamMemberIds: []
  },
  {
    id: 'u-emp-rahul',
    name: 'Rahul Saini',
    email: 'rahul.saini@autovyn.in',
    mobile: '9000000007',
    designation: 'Software Engineer',
    roles: ['EMPLOYEE'],
    permissions: [],
    city: 'Gurugram',
    workMode: 'WFO',
    managerId: 'u-mgr-2',
    teamMemberIds: []
  }
];

export const mockAttendance = (employeeId: string): AttendanceDay[] => {
  const now = new Date();
  const monthsToGenerate = employeeId === 'u-emp-rahul' ? 3 : 1;
  const attendance: AttendanceDay[] = [];

  for (let offset = monthsToGenerate - 1; offset >= 0; offset -= 1) {
    const base = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const dates = monthDays(base.getFullYear(), base.getMonth());
    dates.forEach((date, idx) => {
      const day = new Date(date).getDay();
      if (day === 0 || day === 6) {
        attendance.push({ date, status: 'WEEKEND' });
        return;
      }
      const seed = idx + base.getMonth() + offset + 1;
      if (seed % 14 === 0) {
        attendance.push({ date, status: 'ABSENT' });
        return;
      }
      if (seed % 10 === 0) {
        attendance.push({ date, status: 'LEAVE' });
        return;
      }
      if (seed % 8 === 0) {
        attendance.push({ date, status: 'OVERTIME', punchIn: '09:08', punchOut: '20:02', workingHours: '10:54' });
        return;
      }
      if (seed % 7 === 0) {
        attendance.push({ date, status: 'LATE', punchIn: '10:11', punchOut: '19:22', workingHours: '09:11' });
        return;
      }
      attendance.push({
        date,
        status: 'PRESENT',
        punchIn: '09:24',
        punchOut: '18:37',
        workingHours: '09:13'
      });
    });
  }

  return attendance;
};

export const MOCK_LEAVE_REQUESTS: LeaveRequest[] = [];
export const MOCK_ARS_REQUESTS: ARSRequest[] = [];

export const EMPLOYEE_ANNOUNCEMENTS = [
  {
    id: 'a1',
    title: 'Townhall 2026',
    text: 'Join the monthly townhall at 5 PM with leadership updates and Q&A.',
    image: 'https://picsum.photos/seed/autovyn1/680/260'
  },
  {
    id: 'a2',
    title: 'Wellness Week',
    text: 'From March 1 to March 7 enjoy wellness sessions and virtual yoga.',
    image: 'https://picsum.photos/seed/autovyn2/680/260'
  }
];
