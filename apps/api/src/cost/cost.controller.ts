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
  CostBulkStatusUpdateDto,
  CostBulkStatusUpdateResult,
  CreateCostDto,
  UpdateCostDto,
} from '../dtos/cost.dto';
import { PaginationQueryDto } from '../dtos/pagination.dto';
import { CostService } from './cost.service';

@Controller('cost')
@ApiTags('cost')
@ApiCookieAuth('access_token')
@AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.accountant)
@Roles(UserRole.admin)
export class CostController {
  constructor(private readonly costService: CostService) {}

  @Get()
  @ApiOperation({
    summary: 'List costs',
    description: 'Get paginated cost list.',
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
    description: 'Search by category (contains, case-insensitive)',
    example: 'marketing',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: String,
    description: 'Filter by year (e.g. 2025). Use with month.',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Filter by month 1-12. Use with year.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated cost list with data and meta.',
  })
  async getCosts(
    @Query() query: PaginationQueryDto,
    @Query('search') search?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.costService.getCosts({
      ...query,
      search,
      year,
      month,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get cost by id',
    description: 'Get a single cost record by id.',
  })
  @ApiParam({ name: 'id', description: 'Cost id' })
  @ApiResponse({ status: 200, description: 'Cost found.' })
  @ApiResponse({ status: 404, description: 'Cost not found.' })
  async getCostById(@Param('id') id: string) {
    return this.costService.getCostById(id);
  }

  @Post()
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.accountant)
  @ApiOperation({
    summary: 'Create cost',
    description: 'Create a new cost record.',
  })
  @ApiBody({ type: CreateCostDto, description: 'Cost create payload' })
  @ApiResponse({ status: 201, description: 'Cost created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  async createCost(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateCostDto,
  ) {
    return this.costService.createCost(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch()
  @ApiOperation({
    summary: 'Update cost',
    description: 'Update a cost record.',
  })
  @ApiBody({
    type: UpdateCostDto,
    description: 'Cost update payload (id required)',
  })
  @ApiResponse({ status: 200, description: 'Cost updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Cost not found.' })
  async updateCost(
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateCostDto,
  ) {
    return this.costService.updateCost(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch('status/bulk')
  @ApiOperation({
    summary: 'Bulk update cost payment status',
    description: 'Update payment status for multiple cost records.',
  })
  @ApiBody({
    type: CostBulkStatusUpdateDto,
    description: 'Bulk payment status update payload',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated payment status for selected costs.',
    type: Object,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error.',
  })
  @ApiResponse({
    status: 404,
    description: 'At least one cost record was not found.',
  })
  async updateCostStatuses(
    @CurrentUser() user: JwtPayload,
    @Body() data: CostBulkStatusUpdateDto,
  ): Promise<CostBulkStatusUpdateResult> {
    return this.costService.updateCostStatuses(data.costIds, data.status, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @AllowStaffRolesOnAdminRoutes(StaffRole.assistant, StaffRole.accountant)
  @ApiOperation({
    summary: 'Delete cost',
    description: 'Delete a cost record by id.',
  })
  @ApiParam({ name: 'id', description: 'Cost id' })
  @ApiResponse({ status: 200, description: 'Cost deleted.' })
  @ApiResponse({ status: 404, description: 'Cost not found.' })
  async deleteCost(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.costService.deleteCost(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
