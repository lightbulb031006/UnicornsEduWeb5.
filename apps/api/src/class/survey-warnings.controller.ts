import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StaffRole, UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { StaffOperationsAccessService } from 'src/staff-ops/staff-operations-access.service';
import {
  DismissSurveyWarningDto,
  type AccountantSurveyWarningDto,
  type TeacherSurveyWarningDto,
} from 'src/dtos/survey.dto';
import { SurveyService } from './survey.service';

/**
 * Self-service endpoints cho gia sư (modal cảnh báo mỗi lần truy cập) và kế
 * toán chi (banner cảnh báo nhân sự chưa báo cáo khảo sát quá hạn).
 */
@Controller('survey-warnings')
@ApiTags('surveys')
@ApiCookieAuth('access_token')
@Roles(UserRole.staff, UserRole.admin)
export class SurveyWarningsController {
  constructor(
    private readonly surveyService: SurveyService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
  ) {}

  @Get('open-surveys')
  @ApiOperation({
    summary: 'List open surveys (for report form pickers)',
    description:
      'Danh sách bài khảo sát đã mở (startDate <= hôm nay), dùng để chọn khi tạo báo cáo khảo sát lớp.',
  })
  @ApiResponse({ status: 200, description: 'Open surveys.' })
  async getOpenSurveys() {
    return this.surveyService.listOpenSurveysForReporting();
  }

  @Get('my-warnings')
  @ApiOperation({
    summary: 'Get pending survey warnings for the logged-in teacher',
    description:
      'Danh sách lớp đang running mình phụ trách còn thiếu báo cáo bài khảo sát đã mở.',
  })
  @ApiResponse({ status: 200, description: 'Teacher survey warnings.' })
  async getMyWarnings(
    @CurrentUser() user: JwtPayload,
  ): Promise<TeacherSurveyWarningDto[]> {
    if (user.roleType === UserRole.admin) {
      return [];
    }
    const actor = await this.staffOperationsAccess.resolveActor(
      user.id,
      user.roleType,
    );
    if (!actor.roles.includes(StaffRole.teacher)) {
      return [];
    }
    return this.surveyService.getTeacherWarnings(actor.id);
  }

  @Get('accountant-warnings')
  @ApiOperation({
    summary: 'Get overdue teacher survey warnings for accountant_expense',
  })
  @ApiResponse({ status: 200, description: 'Accountant survey warnings.' })
  async getAccountantWarnings(
    @CurrentUser() user: JwtPayload,
  ): Promise<AccountantSurveyWarningDto[]> {
    if (user.roleType !== UserRole.admin) {
      const actor = await this.staffOperationsAccess.resolveActor(
        user.id,
        user.roleType,
      );
      if (
        !actor.roles.includes(StaffRole.accountant_expense) &&
        !actor.roles.includes(StaffRole.admin)
      ) {
        throw new ForbiddenException(
          'Chỉ kế toán chi hoặc admin được xem cảnh báo này.',
        );
      }
    }
    return this.surveyService.getAccountantWarnings(user.id);
  }

  @Post('accountant-warnings/dismiss')
  @ApiOperation({
    summary: 'Permanently dismiss an accountant survey warning',
  })
  @ApiBody({ type: DismissSurveyWarningDto })
  @ApiResponse({ status: 200, description: 'Warning dismissed.' })
  async dismissWarning(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DismissSurveyWarningDto,
  ) {
    if (user.roleType !== UserRole.admin) {
      const actor = await this.staffOperationsAccess.resolveActor(
        user.id,
        user.roleType,
      );
      if (
        !actor.roles.includes(StaffRole.accountant_expense) &&
        !actor.roles.includes(StaffRole.admin)
      ) {
        throw new ForbiddenException(
          'Chỉ kế toán chi hoặc admin được xử lý cảnh báo này.',
        );
      }
    }
    return this.surveyService.dismissWarning(user.id, {
      ...dto,
      permanent: true,
    });
  }
}
