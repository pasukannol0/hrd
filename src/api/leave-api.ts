import { Router, Request, Response, NextFunction } from 'express';
import { LeaveManagementService } from '../services/leave-management.service';
import {
  CreateLeaveRequestSchema,
  ApproveLeaveRequestSchema,
  RejectLeaveRequestSchema,
  CancelLeaveRequestSchema,
  LeaveQueryParamsSchema,
  LeaveStatus,
} from '../types';
import { z } from 'zod';

export interface LeaveApiConfig {
  leaveManagementService: LeaveManagementService;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email?: string;
  };
}

export class LeaveApi {
  private router: Router;
  private leaveManagementService: LeaveManagementService;

  constructor(config: LeaveApiConfig) {
    this.leaveManagementService = config.leaveManagementService;
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Submit leave request
    this.router.post(
      '/leaves',
      this.validateRequest(CreateLeaveRequestSchema),
      this.submitLeave.bind(this)
    );

    // Get leave by ID
    this.router.get(
      '/leaves/:id',
      this.getLeaveById.bind(this)
    );

    // Get leaves with filters
    this.router.get(
      '/leaves',
      this.queryLeaves.bind(this)
    );

    // Approve leave
    this.router.post(
      '/leaves/:id/approve',
      this.validateRequest(ApproveLeaveRequestSchema),
      this.approveLeave.bind(this)
    );

    // Reject leave
    this.router.post(
      '/leaves/:id/reject',
      this.validateRequest(RejectLeaveRequestSchema),
      this.rejectLeave.bind(this)
    );

    // Cancel leave
    this.router.post(
      '/leaves/:id/cancel',
      this.validateRequest(CancelLeaveRequestSchema),
      this.cancelLeave.bind(this)
    );

    // Get leave audit history
    this.router.get(
      '/leaves/:id/audit',
      this.getLeaveAuditHistory.bind(this)
    );

    // Check leave overlap
    this.router.post(
      '/leaves/check-overlap',
      this.checkOverlap.bind(this)
    );

    // Get leave balance
    this.router.get(
      '/users/:userId/leave-balance',
      this.getLeaveBalance.bind(this)
    );
  }

  private validateRequest(schema: z.ZodSchema) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        req.body = await schema.parseAsync(req.body);
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: 'Validation failed',
            details: error.issues,
          });
        } else {
          next(error);
        }
      }
    };
  }

  private async submitLeave(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const leave = await this.leaveManagementService.submitLeave(req.body);
      res.status(201).json({
        success: true,
        data: leave,
      });
    } catch (error) {
      next(error);
    }
  }

  private async getLeaveById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const leave = await this.leaveManagementService.getLeaveById(id);
      
      if (!leave) {
        res.status(404).json({
          success: false,
          error: 'Leave not found',
        });
        return;
      }

      res.json({
        success: true,
        data: leave,
      });
    } catch (error) {
      next(error);
    }
  }

  private async queryLeaves(req: Request, res: Response, next: NextFunction) {
    try {
      const params: any = {
        user_id: req.query.user_id as string | undefined,
        status: req.query.status as LeaveStatus | undefined,
        leave_type: req.query.leave_type as string | undefined,
        start_date: req.query.start_date as string | undefined,
        end_date: req.query.end_date as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const leaves = await this.leaveManagementService.queryLeaves(params);

      res.json({
        success: true,
        data: leaves,
        pagination: {
          limit: params.limit,
          offset: params.offset,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  private async approveLeave(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const actorRole = req.user?.role || 'employee';

      const leave = await this.leaveManagementService.approveLeave(
        id,
        req.body,
        actorRole
      );

      res.json({
        success: true,
        data: leave,
        message: 'Leave approved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  private async rejectLeave(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const actorRole = req.user?.role || 'employee';

      const leave = await this.leaveManagementService.rejectLeave(
        id,
        req.body,
        actorRole
      );

      res.json({
        success: true,
        data: leave,
        message: 'Leave rejected successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  private async cancelLeave(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const actorRole = req.user?.role || 'employee';

      const leave = await this.leaveManagementService.cancelLeave(
        id,
        req.body,
        actorRole
      );

      res.json({
        success: true,
        data: leave,
        message: 'Leave cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  private async getLeaveAuditHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const history = await this.leaveManagementService.getLeaveAuditHistory(id);

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  private async checkOverlap(req: Request, res: Response, next: NextFunction) {
    try {
      const { user_id, start_date, end_date, exclude_leave_id } = req.body;

      if (!user_id || !start_date || !end_date) {
        res.status(400).json({
          success: false,
          error: 'user_id, start_date, and end_date are required',
        });
        return;
      }

      const result = await this.leaveManagementService.checkOverlap(
        user_id,
        start_date,
        end_date,
        exclude_leave_id
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  private async getLeaveBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const leaveType = req.query.leave_type as string | undefined;
      const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
      const totalAllocated = req.query.total_allocated 
        ? parseInt(req.query.total_allocated as string, 10) 
        : 12;

      if (!leaveType) {
        res.status(400).json({
          success: false,
          error: 'leave_type query parameter is required',
        });
        return;
      }

      const balance = await this.leaveManagementService.getLeaveBalance(
        userId,
        leaveType as any,
        totalAllocated,
        year
      );

      res.json({
        success: true,
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }

  getRouter(): Router {
    return this.router;
  }
}

export function createLeaveApi(config: LeaveApiConfig): Router {
  const api = new LeaveApi(config);
  return api.getRouter();
}
