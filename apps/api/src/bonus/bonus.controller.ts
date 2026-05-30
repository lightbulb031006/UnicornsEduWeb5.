import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { PaginationQueryDto } from '../dtos/pagination.dto';
import { CreateBonusDto, UpdateBonusDto } from '../dtos/bonus.dto';
import { BonusService } from './bonus.service';

@Controller('bonus')
@ApiTags('bonus')
@ApiCookieAuth('access_token')
@AllowStaffRolesOnAdminRoutes(
  StaffRole.admin,
  StaffRole.assistant,
  StaffRole.accountant_expense,
)
@Roles(UserRole.admin)
export class BonusController {
  constructor(private readonly bonusService: BonusService) {}

  @Get()
  @ApiOperation({
    summary: 'List bonuses',
    description: 'Get paginated bonus list.',
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
    name: 'staffId',
    required: false,
    type: String,
    description: 'Filter by staff id',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    description: 'Filter by month key (YYYY-MM)',
    example: '2026-03',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by payment status',
    example: 'pending',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated bonus list with data and meta.',
  })
  async getBonuses(
    @Query() query: PaginationQueryDto,
    @Query('staffId') staffId?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
  ) {
    return this.bonusService.getBonuses({
      ...query,
      staffId,
      month,
      status,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get bonus by id',
    description: 'Get a single bonus record by id.',
  })
  @ApiParam({ name: 'id', description: 'Bonus id' })
  @ApiResponse({ status: 200, description: 'Bonus found.' })
  @ApiResponse({ status: 404, description: 'Bonus not found.' })
  async getBonusById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.bonusService.getBonusById(id);
  }

  @Post()
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.admin,
    StaffRole.assistant,
    StaffRole.accountant_expense,
  )
  @ApiOperation({
    summary: 'Create bonus',
    description: 'Create a new bonus record.',
  })
  @ApiBody({ type: CreateBonusDto, description: 'Bonus create payload' })
  @ApiResponse({ status: 201, description: 'Bonus created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  async createBonus(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateBonusDto,
  ) {
    return this.bonusService.createBonus(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch()
  @ApiOperation({
    summary: 'Update bonus',
    description: 'Update a bonus record.',
  })
  @ApiBody({
    type: UpdateBonusDto,
    description: 'Bonus update payload (id required)',
  })
  @ApiResponse({ status: 200, description: 'Bonus updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 404, description: 'Bonus not found.' })
  async updateBonus(
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateBonusDto,
  ) {
    return this.bonusService.updateBonus(data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.admin,
    StaffRole.assistant,
    StaffRole.accountant_expense,
  )
  @ApiOperation({
    summary: 'Delete bonus',
    description: 'Delete a bonus record by id.',
  })
  @ApiParam({ name: 'id', description: 'Bonus id' })
  @ApiResponse({ status: 200, description: 'Bonus deleted.' })
  @ApiResponse({ status: 404, description: 'Bonus not found.' })
  async deleteBonus(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.bonusService.deleteBonus(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
