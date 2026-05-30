import {
  Body,
  Controller,
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
import { AllowAssistantOnAdminRoutes } from '../auth/decorators/allow-assistant-on-admin.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  BulkUpsertStaffTaxDeductionOverridesDto,
  CreateRoleTaxDeductionRateDto,
  CreateStaffTaxDeductionOverrideDto,
  TaxDeductionSettingsQueryDto,
  UpdateRoleTaxDeductionRateDto,
  UpdateStaffTaxDeductionOverrideDto,
} from '../dtos/deduction-settings.dto';
import { DeductionSettingsService } from './deduction-settings.service';

@Controller('deduction-settings/tax')
@ApiTags('deduction-settings')
@ApiCookieAuth('access_token')
@Roles(UserRole.admin)
@AllowAssistantOnAdminRoutes(false)
export class DeductionSettingsController {
  constructor(
    private readonly deductionSettingsService: DeductionSettingsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List tax deduction settings',
    description:
      'Return current effective rates and effective-date history for role defaults and staff overrides.',
  })
  @ApiQuery({
    name: 'asOfDate',
    required: false,
    type: String,
    description:
      'Date used to resolve current effective rates. Defaults to today.',
    example: '2026-04-14',
  })
  @ApiQuery({
    name: 'roleType',
    required: false,
    enum: StaffRole,
    description: 'Optional role filter.',
  })
  @ApiQuery({
    name: 'staffId',
    required: false,
    type: String,
    description: 'Optional staff filter for overrides.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Tax deduction settings grouped by role defaults and staff overrides.',
  })
  async getTaxDeductionSettings(@Query() query: TaxDeductionSettingsQueryDto) {
    return this.deductionSettingsService.getTaxDeductionSettings(query);
  }

  @Post('role-defaults')
  @ApiOperation({
    summary: 'Append role default tax deduction rate',
    description:
      'Create a new effective-dated role default tax rate. Use PATCH to adjust an existing row.',
  })
  @ApiBody({
    type: CreateRoleTaxDeductionRateDto,
    description: 'Role default tax deduction rate payload.',
  })
  @ApiResponse({
    status: 201,
    description: 'Role default tax deduction rate appended.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or duplicate effective date.',
  })
  async appendRoleTaxDeductionRate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRoleTaxDeductionRateDto,
  ) {
    return this.deductionSettingsService.appendRoleTaxDeductionRate(dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch('role-defaults/:id')
  @ApiOperation({
    summary: 'Update role default tax deduction rate',
    description:
      'Adjust an existing role default tax rate in place by changing its rate percent and/or effective date.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Role default tax deduction rate id.',
  })
  @ApiBody({
    type: UpdateRoleTaxDeductionRateDto,
    description: 'Updated role default tax deduction rate payload.',
  })
  @ApiResponse({
    status: 200,
    description: 'Role default tax deduction rate updated.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or duplicate effective date.',
  })
  @ApiResponse({
    status: 404,
    description: 'Role default tax deduction rate not found.',
  })
  async updateRoleTaxDeductionRate(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRoleTaxDeductionRateDto,
  ) {
    return this.deductionSettingsService.updateRoleTaxDeductionRate(id, dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Post('staff-overrides')
  @ApiOperation({
    summary: 'Append staff override tax deduction rate',
    description:
      'Create a new effective-dated staff override tax rate. Use PATCH to adjust an existing row.',
  })
  @ApiBody({
    type: CreateStaffTaxDeductionOverrideDto,
    description: 'Staff override tax deduction rate payload.',
  })
  @ApiResponse({
    status: 201,
    description: 'Staff override tax deduction rate appended.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, staff not found, or duplicate effective date.',
  })
  async appendStaffTaxDeductionOverride(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStaffTaxDeductionOverrideDto,
  ) {
    return this.deductionSettingsService.appendStaffTaxDeductionOverride(dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch('staff-overrides/:id')
  @ApiOperation({
    summary: 'Update staff override tax deduction rate',
    description:
      'Adjust an existing staff override tax rate in place by changing its rate percent and/or effective date.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Staff override tax deduction rate id.',
  })
  @ApiBody({
    type: UpdateStaffTaxDeductionOverrideDto,
    description: 'Updated staff override tax deduction rate payload.',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff override tax deduction rate updated.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or duplicate effective date.',
  })
  @ApiResponse({
    status: 404,
    description: 'Staff override tax deduction rate not found.',
  })
  async updateStaffTaxDeductionOverride(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStaffTaxDeductionOverrideDto,
  ) {
    return this.deductionSettingsService.updateStaffTaxDeductionOverride(
      id,
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Post('staff-overrides/bulk-upsert')
  @ApiOperation({
    summary: 'Bulk upsert staff override tax deduction rates',
    description:
      'Create or update multiple staff-role override tax rates in a single request.',
  })
  @ApiBody({
    type: BulkUpsertStaffTaxDeductionOverridesDto,
    description: 'Bulk upsert payload for staff override tax rates.',
  })
  @ApiResponse({
    status: 201,
    description: 'Bulk upsert completed successfully.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, duplicate role entries, or staff not found.',
  })
  async bulkUpsertStaffTaxDeductionOverrides(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkUpsertStaffTaxDeductionOverridesDto,
  ) {
    return this.deductionSettingsService.bulkUpsertStaffTaxDeductionOverrides(
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }
}
