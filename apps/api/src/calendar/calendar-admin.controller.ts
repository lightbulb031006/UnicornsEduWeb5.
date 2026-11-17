import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ParseClassIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CalendarService } from './calendar.service';
import {
  ClassScheduleEventDto,
  ClassScheduleFilterDto,
  ClassSchedulePatternDto,
  CreateMakeupScheduleEventDto,
  MakeupScheduleEventDto,
  UpdateMakeupScheduleEventDto,
} from '../dtos/class-schedule.dto';

@Controller('admin/calendar')
@ApiTags('calendar-admin')
@ApiCookieAuth('access_token')
@Roles(UserRole.admin)
export class CalendarAdminController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('events')
  @ApiOperation({
    summary: 'Lấy calendar feed tổng hợp theo khoảng ngày',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách event tổng hợp (fixed/makeup/exam)',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/ClassScheduleEventDto' },
        },
        total: { type: 'number', example: 12 },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number', example: 12 },
          },
        },
      },
    },
  })
  async getCalendarEvents(@Query() filters: ClassScheduleFilterDto): Promise<{
    success: boolean;
    data: ClassScheduleEventDto[];
    total: number;
    meta: { total: number };
  }> {
    const result = await this.calendarService.getAdminCalendarEvents(filters);
    return {
      ...result,
      meta: { total: result.total },
    };
  }

  @Get('class-schedule')
  @ApiOperation({
    summary: 'Lấy các occurrence của class schedule pattern trong khoảng ngày',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách class schedule occurrences',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/ClassScheduleEventDto' },
        },
        total: { type: 'number', example: 8 },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number', example: 8 },
          },
        },
      },
    },
  })
  async getClassScheduleEvents(
    @Query() filters: ClassScheduleFilterDto,
  ): Promise<{
    success: boolean;
    data: ClassScheduleEventDto[];
    total: number;
    meta: { total: number };
  }> {
    const result = await this.calendarService.getClassScheduleEvents(filters);
    return {
      ...result,
      meta: { total: result.total },
    };
  }

  @Get('classes/:classId/schedule')
  @ApiOperation({ summary: 'Lấy weekly schedule pattern của một lớp' })
  @ApiParam({
    name: 'classId',
    description: 'Class ID (UNICL-xxxxxxxxxx)',
    example: 'UNICL-b2c3d4e5f6',
  })
  @ApiResponse({
    status: 200,
    description: 'Lịch học định kỳ của lớp',
    type: ClassSchedulePatternDto,
  })
  @ApiResponse({ status: 404, description: 'Class không tồn tại' })
  async getClassSchedulePattern(
    @Param('classId', new ParseClassIdPipe()) classId: string,
  ) {
    return this.calendarService.getClassSchedulePattern(classId);
  }

  @Put('classes/:classId/schedule')
  @ApiOperation({ summary: 'Cập nhật weekly schedule pattern của một lớp' })
  @ApiParam({
    name: 'classId',
    description: 'Class ID (UNICL-xxxxxxxxxx)',
    example: 'UNICL-b2c3d4e5f6',
  })
  @ApiBody({
    description: 'Weekly schedule pattern payload',
    type: ClassSchedulePatternDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Lịch học định kỳ đã được cập nhật',
    type: ClassSchedulePatternDto,
  })
  @ApiResponse({ status: 404, description: 'Class không tồn tại' })
  async updateClassSchedulePattern(
    @Param('classId', new ParseClassIdPipe()) classId: string,
    @Body() dto: ClassSchedulePatternDto,
  ) {
    return this.calendarService.updateClassSchedulePattern(
      classId,
      dto.schedule,
    );
  }

  @Get('makeup-events')
  @ApiOperation({
    summary: 'Lấy danh sách lịch dạy bù theo khoảng ngày',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách lịch dạy bù',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/MakeupScheduleEventDto' },
        },
        total: { type: 'number', example: 3 },
      },
    },
  })
  async listMakeupEvents(@Query() filters: ClassScheduleFilterDto): Promise<{
    success: boolean;
    data: MakeupScheduleEventDto[];
    total: number;
  }> {
    return this.calendarService.listMakeupScheduleEvents(filters);
  }

  @Post('makeup-events')
  @ApiOperation({
    summary: 'Tạo lịch dạy bù một lần',
  })
  @ApiBody({
    description: 'Payload tạo lịch dạy bù',
    type: CreateMakeupScheduleEventDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Lịch dạy bù đã được tạo',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: { $ref: '#/components/schemas/MakeupScheduleEventDto' },
      },
    },
  })
  async createMakeupEvent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    return this.calendarService.createMakeupScheduleEvent(dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch('makeup-events/:id')
  @ApiOperation({
    summary: 'Cập nhật lịch dạy bù',
  })
  @ApiParam({ name: 'id', description: 'Makeup event ID (UUID)' })
  @ApiBody({
    description: 'Payload cập nhật lịch dạy bù',
    type: UpdateMakeupScheduleEventDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Lịch dạy bù đã được cập nhật',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: { $ref: '#/components/schemas/MakeupScheduleEventDto' },
      },
    },
  })
  async updateMakeupEvent(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    return this.calendarService.updateMakeupScheduleEvent(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete('makeup-events/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xóa lịch dạy bù',
  })
  @ApiParam({ name: 'id', description: 'Makeup event ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Lịch dạy bù đã được xóa',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  async deleteMakeupEvent(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ success: boolean }> {
    return this.calendarService.deleteMakeupScheduleEvent(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
