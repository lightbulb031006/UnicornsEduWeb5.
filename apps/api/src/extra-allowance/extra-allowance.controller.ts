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
import { StaffRole, UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator';
import { AllowStaffRolesOnAdminRoutes } from '../auth/decorators/allow-staff-roles-on-admin.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ExtraAllowanceBulkStatusUpdateDto,
  ExtraAllowanceBulkStatusUpdateResult,
  CreateExtraAllowanceDto,
  UpdateExtraAllowanceDto,
} from '../dtos/extra-allowance.dto';
import { PaginationQueryDto } from '../dtos/pagination.dto';
import { ExtraAllowanceService } from './extra-allowance.service';

@Controller('extra-allowance')
@ApiTags('extra-allowance')
@ApiCookieAuth('access_token')
@AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.accountant)
@Roles(UserRole.admin)
export class ExtraAllowanceController {
  constructor(private readonly extraAllowanceService: ExtraAllowanceService) {}

  @Get()
  @ApiOperation({
    summary: 'List extra allowances',
    description: 'Get paginated extra allowance list.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
    example: 20,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by staff full name or note',
    example: 'Nguyen',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: String,
    description: 'Filter by year (e.g. 2026). Use with month.',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Filter by month 1-12. Use with year.',
  })
  @ApiQuery({
    name: 'roleType',
    required: false,
    enum: StaffRole,
    description: 'Filter by staff role',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by payment status',
    example: 'pending',
  })
  @ApiQuery({
    name: 'staffId',
    required: false,
    type: String,
    description: 'Filter by staff id',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated extra allowance list with data and meta.',
  })
  async getExtraAllowances(
    @Query() query: PaginationQueryDto,
    @Query('search') search?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('roleType') roleType?: string,
    @Query('status') status?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.extraAllowanceService.getExtraAllowances({
      ...query,
      search,
      year,
      month,
      roleType,
      status,
      staffId,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get extra allowance by id',
    description: 'Get a single extra allowance record by id.',
  })
  @ApiParam({ name: 'id', description: 'Extra allowance id' })
  @ApiResponse({ status: 200, description: 'Extra allowance found.' })
  @ApiResponse({ status: 404, description: 'Extra allowance not found.' })
  async getExtraAllowanceById(@Param('id') id: string) {
    return this.extraAllowanceService.getExtraAllowanceById(id);
  }

  @Post()
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.accountant)
  @ApiOperation({
    summary: 'Create extra allowance',
    description: 'Create a new extra allowance record.',
  })
  @ApiBody({
    type: CreateExtraAllowanceDto,
    description: 'Extra allowance create payload',
  })
  @ApiResponse({ status: 201, description: 'Extra allowance created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  async createExtraAllowance(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateExtraAllowanceDto,
  ) {
    return this.extraAllowanceService.createExtraAllowance(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch()
  @ApiOperation({
    summary: 'Update extra allowance',
    description: 'Update an extra allowance record.',
  })
  @ApiBody({
    type: UpdateExtraAllowanceDto,
    description: 'Extra allowance update payload (id required)',
  })
  @ApiResponse({ status: 200, description: 'Extra allowance updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Extra allowance not found.' })
  async updateExtraAllowance(
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateExtraAllowanceDto,
  ) {
    return this.extraAllowanceService.updateExtraAllowance(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch('status/bulk')
  @ApiOperation({
    summary: 'Bulk update extra allowance payment status',
    description: 'Update payment status for multiple extra allowance records.',
  })
  @ApiBody({
    type: ExtraAllowanceBulkStatusUpdateDto,
    description: 'Bulk payment status update payload',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated payment status for selected extra allowances.',
    type: Object,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error.',
  })
  @ApiResponse({
    status: 404,
    description: 'At least one extra allowance record was not found.',
  })
  async updateExtraAllowanceStatuses(
    @CurrentUser() user: JwtPayload,
    @Body() data: ExtraAllowanceBulkStatusUpdateDto,
  ): Promise<ExtraAllowanceBulkStatusUpdateResult> {
    return this.extraAllowanceService.updateExtraAllowanceStatuses(
      data.allowanceIds,
      data.status,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Delete(':id')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.accountant)
  @ApiOperation({
    summary: 'Delete extra allowance',
    description: 'Delete an extra allowance record by id.',
  })
  @ApiParam({ name: 'id', description: 'Extra allowance id' })
  @ApiResponse({ status: 200, description: 'Extra allowance deleted.' })
  @ApiResponse({ status: 404, description: 'Extra allowance not found.' })
  async deleteExtraAllowance(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.extraAllowanceService.deleteExtraAllowance(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
