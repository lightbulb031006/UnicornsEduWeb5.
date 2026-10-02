import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseUUIDPipe } from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import { AllowAssistantOnAdminRoutes } from 'src/auth/decorators/allow-assistant-on-admin.decorator';
import { AllowStaffRolesOnAdminRoutes } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/dtos/pagination.dto';
import {
  type AdminMissingSurveyClassListDto,
  type AdminSurveyRoundSummaryDto,
  SetSurveyRoundDto,
} from 'src/dtos/survey-round.dto';
import {
  CreateSurveyDto,
  type SurveyListDto,
  type SurveyMissingClassListDto,
  type SurveyRecord,
  type SurveyReportedClassListDto,
  UpdateSurveyDto,
} from 'src/dtos/survey.dto';
import { SurveyRoundService } from './survey-round.service';
import { SurveyService } from './survey.service';

const SURVEY_MANAGER_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.lesson_plan,
  StaffRole.lesson_plan_head,
];

/**
 * Quản lý "Bài khảo sát" (Survey) — thay thế cơ chế "lần khảo sát N toàn cục" cũ.
 * Admin và đội giáo án (`lesson_plan`, `lesson_plan_head`) có thể tạo/sửa/xóa.
 */
@Controller('surveys')
@ApiTags('surveys')
@ApiCookieAuth('access_token')
@AllowAssistantOnAdminRoutes(false)
@AllowStaffRolesOnAdminRoutes(...SURVEY_MANAGER_ROLES)
@Roles(UserRole.admin)
export class SurveysController {
  constructor(
    private readonly surveyRoundService: SurveyRoundService,
    private readonly surveyService: SurveyService,
  ) {}

  @Get('round')
  @ApiOperation({
    summary: '[Legacy] Get current survey round summary',
    description:
      'Giữ lại cho dữ liệu lịch sử "lần khảo sát N toàn cục". Dùng /surveys cho hệ thống mới.',
  })
  @ApiResponse({ status: 200, description: 'Survey round summary.' })
  async getRoundSummary(): Promise<AdminSurveyRoundSummaryDto> {
    return this.surveyRoundService.getRoundSummary();
  }

  @Get('round/missing-classes')
  @ApiOperation({
    summary: '[Legacy] List running classes missing the current survey round',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated missing-class rows.' })
  async getRoundMissingClasses(
    @Query() query: PaginationQueryDto,
  ): Promise<AdminMissingSurveyClassListDto> {
    return this.surveyRoundService.getMissingClasses({
      page: query.page,
      limit: query.limit,
    });
  }

  @Patch('round')
  @ApiOperation({ summary: '[Legacy] Set the current survey round' })
  @ApiBody({ type: SetSurveyRoundDto })
  @ApiResponse({ status: 200, description: 'Updated survey round summary.' })
  async setRound(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetSurveyRoundDto,
  ): Promise<AdminSurveyRoundSummaryDto> {
    return this.surveyRoundService.setCurrentRound(dto.number, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'List surveys',
    description: 'Danh sách Bài khảo sát, phân trang, mới nhất trước.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated survey list.' })
  async listSurveys(
    @Query() query: PaginationQueryDto,
  ): Promise<SurveyListDto> {
    return this.surveyService.listSurveys({
      page: query.page,
      limit: query.limit,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a survey' })
  @ApiBody({ type: CreateSurveyDto })
  @ApiResponse({ status: 201, description: 'Survey created.' })
  async createSurvey(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSurveyDto,
  ): Promise<SurveyRecord> {
    return this.surveyService.createSurvey(dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a survey by id' })
  @ApiParam({ name: 'id', description: 'Survey id' })
  @ApiResponse({ status: 200, description: 'Survey record.' })
  async getSurvey(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SurveyRecord> {
    return this.surveyService.getSurveyById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a survey' })
  @ApiParam({ name: 'id', description: 'Survey id' })
  @ApiBody({ type: UpdateSurveyDto })
  @ApiResponse({ status: 200, description: 'Survey updated.' })
  async updateSurvey(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSurveyDto,
  ): Promise<SurveyRecord> {
    return this.surveyService.updateSurvey(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a survey' })
  @ApiParam({ name: 'id', description: 'Survey id' })
  @ApiResponse({ status: 200, description: 'Survey deleted.' })
  async deleteSurvey(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.surveyService.deleteSurvey(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get(':id/missing-classes')
  @ApiOperation({
    summary: 'List running classes missing a report for this survey',
  })
  @ApiParam({ name: 'id', description: 'Survey id' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated missing-class rows.' })
  async getMissingClasses(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<SurveyMissingClassListDto> {
    return this.surveyService.getMissingClasses(id, {
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id/reported-classes')
  @ApiOperation({
    summary: 'List running classes that reported for this survey',
  })
  @ApiParam({ name: 'id', description: 'Survey id' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated reported-class rows.' })
  async getReportedClasses(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<SurveyReportedClassListDto> {
    return this.surveyService.getReportedClasses(id, {
      page: query.page,
      limit: query.limit,
    });
  }
}
