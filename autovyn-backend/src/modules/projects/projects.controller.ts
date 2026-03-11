import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { projectsService } from './projects.service';

export const projectsController = {
  listWorkspace: asyncHandler(async (req: Request, res: Response) => {
    const data = await projectsService.listWorkspace(req.auth!);
    return sendSuccess(res, 'Projects fetched successfully.', data);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const data = await projectsService.createProject(req.body, req.auth!);
    return sendSuccess(res, 'Project created successfully.', data, 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const data = await projectsService.updateProject(req.params.id, req.body, req.auth!);
    return sendSuccess(res, 'Project updated successfully.', data);
  })
};
