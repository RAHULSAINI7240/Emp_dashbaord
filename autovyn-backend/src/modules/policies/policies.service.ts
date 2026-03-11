import { AppError } from '../../utils/app-error';
import { policiesRepository } from './policies.repository';
import { resolveLeaveAllowances } from './policy-config';

export const policiesService = {
  async upsert(
    payload: {
      attendancePolicy: string;
      leavePolicy: string;
      leaveAllowances?: {
        casual: number;
        sick: number;
        special: number;
        emergency: number;
      };
    },
    createdById: string
  ) {
    const allowances = resolveLeaveAllowances(
      payload.leaveAllowances
        ? {
            casualLeaveAllowance: payload.leaveAllowances.casual,
            sickLeaveAllowance: payload.leaveAllowances.sick,
            specialLeaveAllowance: payload.leaveAllowances.special,
            emergencyLeaveAllowance: payload.leaveAllowances.emergency
          }
        : null
    );

    const policy = await policiesRepository.create({
      attendancePolicy: payload.attendancePolicy,
      leavePolicy: payload.leavePolicy,
      casualLeaveAllowance: allowances.casual,
      sickLeaveAllowance: allowances.sick,
      specialLeaveAllowance: allowances.special,
      emergencyLeaveAllowance: allowances.emergency,
      createdById
    });

    return {
      ...policy,
      leaveAllowances: allowances
    };
  },

  async getLatest() {
    const policy = await policiesRepository.latest();
    if (!policy) {
      throw new AppError('No policies found.', 404, 'POLICIES_NOT_FOUND');
    }

    return {
      ...policy,
      leaveAllowances: resolveLeaveAllowances(policy)
    };
  }
};
