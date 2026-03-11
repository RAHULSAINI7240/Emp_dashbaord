export type Role = 'ADMIN' | 'EMPLOYEE' | 'HR';

export type Permission =
  | 'APPROVE_LEAVE'
  | 'APPROVE_ARS'
  | 'VIEW_TEAM'
  | 'MANAGE_EMPLOYEES'
  | 'CREATE_USER'
  | 'MANAGER'
  | 'TEAM_LEAD';

export type UserFlag = 'ADMIN' | 'HR' | 'TL' | 'EMPLOYEE';

export interface User {
  id: string;
  employeeId?: string;
  adminId?: string;
  name: string;
  email?: string;
  mobile?: string;
  department?: string;
  profilePhotoUrl?: string;
  joiningDate?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  emergencyContact?: string;
  address?: string;
  designation: string;
  roles: Role[];
  permissions: Permission[];
  city: string;
  workMode: 'WFO' | 'WFH' | 'HYBRID';
  managerId?: string;
  managerName?: string;
  managerEmployeeId?: string;
  teamMemberIds: string[];
  userFlag?: UserFlag;
}
