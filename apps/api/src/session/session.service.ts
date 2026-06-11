import { Injectable } from '@nestjs/common';
import {
  CreateMissedTeachingExplanationDto,
  SessionBulkPaymentStatusUpdateResult,
  SessionCreateDto,
  MissedTeachingAlertDto,
  MissedTeachingExplanationResponseDto,
  SessionUnpaidSummaryItem,
  SessionUpdateDto,
  UpdateMissedTeachingExplanationDto,
} from '../dtos/session.dto';
import { SessionPaymentStatus, UserRole } from '../../generated/enums';
import { ActionHistoryActor } from '../action-history/action-history.service';
import { SessionCreateService } from './session-create.service';
import { SessionDeleteService } from './session-delete.service';
import { SessionReportingService } from './session-reporting.service';
import { SessionUpdateService } from './session-update.service';
import { SessionScheduleRulesService } from './session-schedule-rules.service';
import { MissedTeachingExplanationService } from './missed-teaching-explanation.service';
import { StaffOperationsAccessService } from '../staff-ops/staff-operations-access.service';
import { StaffRole } from '../../generated/enums';

const ELEVATED_CLASS_ACCESS_ROLES: StaffRole[] = [
  StaffRole.assistant,
  StaffRole.accountant_income,
  StaffRole.accountant_expense,
];

function isTeacherScopedActor(roles: StaffRole[]) {
  return (
    roles.includes(StaffRole.teacher) &&
    !roles.some((role) => ELEVATED_CLASS_ACCESS_ROLES.includes(role))
  );
}

@Injectable()
export class SessionService {
  constructor(
    private readonly sessionCreateService: SessionCreateService,
    private readonly sessionUpdateService: SessionUpdateService,
    private readonly sessionDeleteService: SessionDeleteService,
    private readonly sessionReportingService: SessionReportingService,
    private readonly sessionScheduleRulesService: SessionScheduleRulesService,
    private readonly missedTeachingExplanationService: MissedTeachingExplanationService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
  ) {}

  createSession(data: SessionCreateDto, actor?: ActionHistoryActor) {
    return this.sessionCreateService.createSession(data, actor);
  }

  createSessionForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    data: {
      date: string;
      startTime?: string;
      endTime?: string;
      notes?: string | null;
      coefficient?: number;
      attendance: Array<{
        studentId: string;
        status: SessionCreateDto['attendance'][number]['status'];
        notes?: string | null;
      }>;
    },
    actor?: ActionHistoryActor,
  ) {
    return this.sessionCreateService.createSessionForStaff(
      userId,
      roleType,
      classId,
      data,
      actor,
    );
  }

  updateSession(data: SessionUpdateDto, actor?: ActionHistoryActor) {
    return this.sessionUpdateService.updateSession(data, actor);
  }

  updateSessionPaymentStatuses(
    sessionIds: string[],
    teacherPaymentStatus: SessionPaymentStatus,
    actor?: ActionHistoryActor,
  ): Promise<SessionBulkPaymentStatusUpdateResult> {
    return this.sessionUpdateService.updateSessionPaymentStatuses(
      sessionIds,
      teacherPaymentStatus,
      actor,
    );
  }

  updateSessionForStaff(
    userId: string,
    roleType: UserRole,
    sessionId: string,
    data: {
      date?: string;
      startTime?: string;
      endTime?: string;
      notes?: string | null;
      coefficient?: number;
      attendance?: Array<{
        studentId: string;
        status: NonNullable<SessionUpdateDto['attendance']>[number]['status'];
        notes?: string | null;
      }>;
    },
    actor?: ActionHistoryActor,
  ) {
    return this.sessionUpdateService.updateSessionForStaff(
      userId,
      roleType,
      sessionId,
      data,
      actor,
    );
  }

  deleteSession(id: string, actor?: ActionHistoryActor) {
    return this.sessionDeleteService.deleteSession(id, actor);
  }

  getSessionsByClassId(classId: string, month: string, year: string) {
    return this.sessionReportingService.getSessionsByClassId(
      classId,
      month,
      year,
    );
  }

  getSessionsByClassIdForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    month: string,
    year: string,
  ) {
    return this.sessionReportingService.getSessionsByClassIdForStaff(
      userId,
      roleType,
      classId,
      month,
      year,
    );
  }

  getSessionsByTeacherId(teacherId: string, month: string, year: string) {
    return this.sessionReportingService.getSessionsByTeacherId(
      teacherId,
      month,
      year,
    );
  }

  getUnpaidSessionsByTeacherId(
    teacherId: string,
    days?: number,
  ): Promise<SessionUnpaidSummaryItem[]> {
    return this.sessionReportingService.getUnpaidSessionsByTeacherId(
      teacherId,
      days,
    );
  }

  getMissedTeachingAlertsByClass(
    classId: string,
    days?: number,
  ): Promise<MissedTeachingAlertDto[]> {
    return this.sessionScheduleRulesService.getMissedTeachingAlertsByClass(
      classId,
      days,
    );
  }

  async getMissedTeachingAlertsByClassForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    days?: number,
  ): Promise<MissedTeachingAlertDto[]> {
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      userId,
      roleType,
    );
    const accessMode =
      await this.staffOperationsAccess.resolveClassViewAccessMode(
        actor,
        classId,
      );

    return this.sessionScheduleRulesService.getMissedTeachingAlertsByClass(
      classId,
      days,
      accessMode === 'teacher' ? actor.id : undefined,
    );
  }

  getMissedTeachingAlertsByTeacher(
    teacherId: string,
    days?: number,
  ): Promise<MissedTeachingAlertDto[]> {
    return this.sessionScheduleRulesService.getMissedTeachingAlertsByTeacher(
      teacherId,
      days,
    );
  }

  async createMissedTeachingExplanationForClass(
    classId: string,
    dto: CreateMissedTeachingExplanationDto,
    actor?: ActionHistoryActor,
  ): Promise<MissedTeachingExplanationResponseDto> {
    return this.missedTeachingExplanationService.createExplanationForClass(
      classId,
      dto,
      actor,
    );
  }

  async createMissedTeachingExplanationForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    dto: CreateMissedTeachingExplanationDto,
    actor?: ActionHistoryActor,
  ): Promise<MissedTeachingExplanationResponseDto> {
    const resolvedActor = await this.staffOperationsAccess.resolveActor(
      userId,
      roleType,
    );

    if (isTeacherScopedActor(resolvedActor.roles)) {
      await this.staffOperationsAccess.assertTeacherAssignedToClass(
        resolvedActor.id,
        classId,
      );
      return this.missedTeachingExplanationService.createExplanationForClass(
        classId,
        dto,
        actor,
        { restrictTeacherId: resolvedActor.id },
      );
    }

    return this.missedTeachingExplanationService.createExplanationForClass(
      classId,
      dto,
      actor,
    );
  }

  async updateMissedTeachingExplanation(
    id: string,
    dto: UpdateMissedTeachingExplanationDto,
    actor?: ActionHistoryActor,
  ): Promise<MissedTeachingExplanationResponseDto> {
    return this.missedTeachingExplanationService.updateExplanation(
      id,
      dto,
      actor,
    );
  }

  async updateMissedTeachingExplanationForStaff(
    userId: string,
    roleType: UserRole,
    id: string,
    dto: UpdateMissedTeachingExplanationDto,
    actor?: ActionHistoryActor,
  ): Promise<MissedTeachingExplanationResponseDto> {
    const resolvedActor = await this.staffOperationsAccess.resolveActor(
      userId,
      roleType,
    );

    return this.missedTeachingExplanationService.updateExplanation(
      id,
      dto,
      actor,
      isTeacherScopedActor(resolvedActor.roles)
        ? { restrictTeacherId: resolvedActor.id }
        : undefined,
    );
  }
}
