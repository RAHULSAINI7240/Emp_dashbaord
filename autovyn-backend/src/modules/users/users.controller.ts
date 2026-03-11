import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { usersService } from './users.service';

export const usersController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const data = await usersService.createUser(req.body, req.auth!);
    return sendSuccess(res, 'User created successfully.', data, 201);
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    const data = await usersService.me(req.auth!.userId);
    return sendSuccess(res, 'Current user fetched successfully.', data);
  }),

  updateMyProfilePhoto: asyncHandler(async (req: Request, res: Response) => {
    const data = await usersService.updateMyProfilePhoto(req.auth!.userId, req.body.profilePhotoUrl);
    return sendSuccess(res, 'Profile photo updated successfully.', data);
  }),

  approvers: asyncHandler(async (req: Request, res: Response) => {
    const type = (req.query.type as 'leave' | 'ars' | 'both') ?? 'both';
    const data = await usersService.approvers(type);
    return sendSuccess(res, 'Approvers fetched successfully.', data);
  }),

  listTeamMembers: asyncHandler(async (req: Request, res: Response) => {
    const data = await usersService.listTeamMembers(
      {
        search: req.query.search as string | undefined,
        city: req.query.city as string | undefined,
        workMode: req.query.workMode as 'WFO' | 'WFH' | 'HYBRID' | undefined,
        onlineStatus: req.query.onlineStatus as 'ONLINE' | 'OFFLINE' | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      },
      req.timezoneOffsetMinutes ?? 0
    );
    return sendSuccess(res, 'Team members fetched successfully.', data);
  }),

  getTeamMember: asyncHandler(async (req: Request, res: Response) => {
    const data = await usersService.getTeamMember(req.params.id, req.timezoneOffsetMinutes ?? 0);
    return sendSuccess(res, 'Team member fetched successfully.', data);
  })
};
