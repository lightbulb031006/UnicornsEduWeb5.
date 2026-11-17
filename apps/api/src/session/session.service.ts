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
import { ReviewValidationOptions } from './session-validation.service';
import { SessionScheduleRulesService } from './session-schedule-rules.service';
import { MissedTeachingExplanationService } from './missed-teaching-explanation.service';
import {
  StaffOperationsAccessService,
  canWorkOnAllClassSessions,
  seesClassAsTrainingManager,
} from '../staff-ops/staff-operations-access.service';

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
    data: Parameters<SessionCreateService['createSessionForStaff']>[3],
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

  async updateSession(
    data: SessionUpdateDto,
    actor?: ActionHistoryActor,
    reviewOptions?: ReviewValidationOptions,
  ) {
    await this.sessionUpdateService.assertAdminRouteUpdateAllowed(data, actor);
    return this.sessionUpdateService.updateSession(data, actor, reviewOptions);
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
    data: Parameters<SessionUpdateService['updateSessionForStaff']>[3],
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

  updateSessionAsTrainingHead(
    userId: string,
    roleType: UserRole,
    sessionId: string,
    data: Parameters<SessionUpdateService['updateSessionAsTrainingHead']>[3],
    actor?: ActionHistoryActor,
  ) {
    return this.sessionUpdateService.updateSessionAsTrainingHead(
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

  getNextSessionOrdinal(classId: string, date: string, startTime?: string) {
    return this.sessionReportingService.getNextSessionOrdinal(
      classId,
      date,
      startTime,
    );
  }

  getNextSessionOrdinalForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    date: string,
    startTime?: string,
  ) {
    return this.sessionReportingService.getNextSessionOrdinalForStaff(
      userId,
      roleType,
      classId,
      date,
      startTime,
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
    const access = await this.staffOperationsAccess.resolveClassAccess(
      actor,
      classId,
    );

    // #275: kiêm Quản lý lớp (#277: hoặc Trưởng ban Đào tạo) → thấy cảnh
    // báo của mọi gia sư trong lớp.
    return this.sessionScheduleRulesService.getMissedTeachingAlertsByClass(
      classId,
      days,
      access.mode === 'teacher' && !seesClassAsTrainingManager(access)
        ? actor.id
        : undefined,
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
    // Follow-up grill 13/11 — glossary «Giải trình vắng»: ai xếp được lịch bù
    // trên lớp thì mới giải trình được (cùng predicate #275). Admin / Quản lý
    // lớp: mọi gia sư của lớp; gia sư: chỉ buổi của mình; lớp khác → 403.
    const restrictTeacherId = await this.resolveMissedTeachingRestriction(
      userId,
      roleType,
      classId,
    );
    return this.missedTeachingExplanationService.createExplanationForClass(
      classId,
      dto,
      actor,
      restrictTeacherId ? { restrictTeacherId } : undefined,
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
    const classId =
      await this.missedTeachingExplanationService.getExplanationClassId(id);
    const restrictTeacherId = await this.resolveMissedTeachingRestriction(
      userId,
      roleType,
      classId,
    );
    return this.missedTeachingExplanationService.updateExplanation(
      id,
      dto,
      actor,
      restrictTeacherId ? { restrictTeacherId } : undefined,
    );
  }

  /**
   * Quyền giải trình vắng trên lớp = quyền xếp lịch bù (`resolveClassWorkAccess`,
   * #275). Trả `staffId` gia sư bị giới hạn, hoặc `null` khi làm được cho mọi
   * gia sư của lớp. Không thuộc lớp → 403.
   */
  private async resolveMissedTeachingRestriction(
    userId: string,
    roleType: UserRole,
    classId: string,
  ): Promise<string | null> {
    const access = await this.staffOperationsAccess.resolveClassWorkAccess(
      userId,
      roleType,
      classId,
    );
    if (canWorkOnAllClassSessions(access)) {
      return null;
    }
    return access.staffId;
  }
}
