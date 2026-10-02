import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiConflictResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { StaffRole, UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from '../auth/decorators/allow-staff-roles-on-admin.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
  QuestionFilterDto,
  BulkCreateQuestionDto,
} from '../dtos/question.dto';
import { QuestionService } from './question.service';

@ApiTags('question')
@ApiCookieAuth('access_token')
@Controller('questions')
export class QuestionController {
  constructor(private readonly service: QuestionService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.student)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.teacher,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({ summary: 'List questions with optional filters' })
  @ApiQuery({ name: 'skip', required: false, description: 'Offset' })
  @ApiQuery({ name: 'take', required: false, description: 'Limit' })
  @ApiOkResponse({ description: 'List of questions.' })
  async list(
    @Query() filter: QuestionFilterDto,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(20), ParseIntPipe) take: number,
  ) {
    return this.service.list(filter, skip, take);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.student)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.teacher,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({ summary: 'Get a single question by ID' })
  @ApiParam({ name: 'id', description: 'Question ID' })
  @ApiOkResponse({ description: 'Question detail.' })
  @ApiNotFoundResponse({ description: 'Question not found' })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post()
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.teacher,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({ summary: 'Create a new question' })
  @ApiBody({ type: CreateQuestionDto })
  @ApiOkResponse({ description: 'Created question.' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.service.create(dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post('bulk')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.teacher,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({ summary: 'Bulk create questions (AI import)' })
  @ApiBody({ type: BulkCreateQuestionDto })
  @ApiOkResponse({ description: 'Created questions count.' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  async bulkCreate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkCreateQuestionDto,
  ) {
    return this.service.bulkCreate(dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.teacher,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({ summary: 'Update an existing question' })
  @ApiParam({ name: 'id', description: 'Question ID' })
  @ApiBody({ type: UpdateQuestionDto })
  @ApiOkResponse({ description: 'Updated question.' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @ApiNotFoundResponse({ description: 'Question not found' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.service.update(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.lesson_plan,
    StaffRole.lesson_plan_head,
  )
  @ApiOperation({ summary: 'Soft‑delete a question' })
  @ApiParam({ name: 'id', description: 'Question ID' })
  @ApiOkResponse({ description: 'Deleted question.' })
  @ApiConflictResponse({ description: 'Question is used by practice lessons' })
  @ApiNotFoundResponse({ description: 'Question not found' })
  async delete(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.delete(id, {
      userId: user.id,
      userEmail: user.email,
    });
  }
}
