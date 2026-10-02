import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from 'generated/enums';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  StaffFixedSalaryOverridesQueryDto,
  StaffFixedSalaryPayablesQueryDto,
  UpsertRoleFixedSalaryDefaultsDto,
  UpsertRoleFixedSalaryOperatingRatesDto,
  UpsertStaffFixedSalaryAmountDto,
  UpsertStaffFixedSalaryOperatingRateDto,
} from '../dtos/fixed-salary-settings.dto';
import { FixedSalaryCloseService } from './fixed-salary-close.service';
import { FixedSalarySettingsService } from './fixed-salary-settings.service';

@Controller('fixed-salary-settings')
@ApiTags('fixed-salary-settings')
@ApiCookieAuth('access_token')
@Roles(UserRole.admin)
export class FixedSalarySettingsController {
  constructor(
    private readonly fixedSalarySettingsService: FixedSalarySettingsService,
    private readonly fixedSalaryCloseService: FixedSalaryCloseService,
  ) {}

  @Get('role-defaults')
  @ApiOperation({
    summary: 'List role default fixed salaries',
    description:
      'Return the default fixed salary amount for every fixed-salary StaffRole (teacher excluded). Unconfigured roles return null amount (not 0). Independent of fixed-salary operating percent.',
  })
  @ApiResponse({
    status: 200,
    description:
      'One row per fixed-salary StaffRole (teacher excluded), including unconfigured roles with null amount.',
  })
  async getRoleDefaults() {
    return this.fixedSalarySettingsService.getRoleDefaults();
  }

  @Put('role-defaults')
  @ApiOperation({
    summary: 'Upsert role default fixed salaries',
    description:
      'Create, update, or clear default fixed salary amounts by role. Clearing an amount does not change that role’s operating percent. Each changed role writes action-history. Tax rates and teacher session allowance are unchanged.',
  })
  @ApiBody({
    type: UpsertRoleFixedSalaryDefaultsDto,
    description: 'Role default fixed salary payload (amount only).',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated list of role default fixed salaries.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (negative amount, duplicate roleType).',
  })
  async upsertRoleDefaults(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertRoleFixedSalaryDefaultsDto,
  ) {
    return this.fixedSalarySettingsService.upsertRoleDefaults(dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('role-operating-rates')
  @ApiOperation({
    summary: 'List role default fixed-salary operating percents',
    description:
      'Return the default operating deduction percent for lương cứng of every fixed-salary StaffRole (teacher excluded). Unconfigured roles return null (not 0). This percent is not used for teacher session allowance or class-teacher % vận hành.',
  })
  @ApiResponse({
    status: 200,
    description:
      'One row per fixed-salary StaffRole (teacher excluded), including unconfigured roles with null operatingRatePercent.',
  })
  async getRoleOperatingRates() {
    return this.fixedSalarySettingsService.getRoleOperatingRates();
  }

  @Put('role-operating-rates')
  @ApiOperation({
    summary: 'Upsert role default fixed-salary operating percents',
    description:
      'Create, update, or clear default operating percents by role. Clearing a percent does not change that role’s salary amount. Each changed role writes action-history. Teacher session allowance is unchanged.',
  })
  @ApiBody({
    type: UpsertRoleFixedSalaryOperatingRatesDto,
    description: 'Role default operating-rate payload (percent only).',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated list of role default operating percents.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (percent outside 0–100, duplicate roleType).',
  })
  async upsertRoleOperatingRates(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertRoleFixedSalaryOperatingRatesDto,
  ) {
    return this.fixedSalarySettingsService.upsertRoleOperatingRates(dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Get('staff-overrides')
  @ApiOperation({
    summary: 'List resolved staff fixed-salary overrides',
    description:
      'Return staff who currently hold at least one role. Exact staffId skips the active-only filter so the staff edit dialog can load overrides for inactive staff. List/search still returns active staff only. Each (staff, fixed-salary role) pair resolves lương cứng and % vận hành independently (teacher is omitted). Override row wins (including 0); otherwise role default; otherwise unconfigured. Search is by name, handle, or id.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'staffId', required: false, type: String, description: 'Exact staff id. When set, search and the active-only filter are skipped so the edit dialog can load overrides for inactive staff too.' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description:
      'Staff list with one independent row per current fixed-salary role (teacher omitted) and resolved values per axis.',
  })
  async getStaffOverrides(@Query() query: StaffFixedSalaryOverridesQueryDto) {
    return this.fixedSalarySettingsService.getStaffOverrides(query);
  }

  @Put('staff-overrides/amount')
  @ApiOperation({
    summary: 'Upsert or clear a staff fixed-salary amount override',
    description:
      'Writes only the amount axis for one (staff, role) pair. Null deletes the amount override so the role default applies again. 0 is stored as an intentional exclusion. Does not create or change the operating-rate override. Staff must currently hold the role. Writes action-history.',
  })
  @ApiBody({ type: UpsertStaffFixedSalaryAmountDto })
  @ApiResponse({ status: 200, description: 'Resolved staff row after the write.' })
  @ApiResponse({
    status: 400,
    description: 'Staff does not currently hold the role, or amount is invalid.',
  })
  async upsertStaffAmountOverride(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertStaffFixedSalaryAmountDto,
  ) {
    return this.fixedSalarySettingsService.upsertStaffAmountOverride(dto, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Put('staff-overrides/operating-rate')
  @ApiOperation({
    summary: 'Upsert or clear a staff fixed-salary operating-rate override',
    description:
      'Writes only the % vận hành axis for one (staff, role) pair. Null deletes that override. 0% is stored. Does not create or change the amount override. Staff must currently hold the role. Writes action-history.',
  })
  @ApiBody({ type: UpsertStaffFixedSalaryOperatingRateDto })
  @ApiResponse({ status: 200, description: 'Resolved staff row after the write.' })
  @ApiResponse({
    status: 400,
    description:
      'Staff does not currently hold the role, or percent is outside 0–100.',
  })
  async upsertStaffOperatingRateOverride(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertStaffFixedSalaryOperatingRateDto,
  ) {
    return this.fixedSalarySettingsService.upsertStaffOperatingRateOverride(
      dto,
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  @Get('payables')
  @ApiOperation({
    summary: 'List frozen fixed-salary payables for a month',
    description:
      'Return every lương cứng payable already generated for the month (YYYY-MM). Defaults to the current Asia/Ho_Chi_Minh month. Does not generate new rows.',
  })
  @ApiQuery({ name: 'month', required: false, type: String, example: '2026-09' })
  @ApiResponse({
    status: 200,
    description: 'Payables for the requested month, including frozen amounts and rates.',
  })
  @ApiResponse({ status: 400, description: 'month is not YYYY-MM.' })
  async listPayables(@Query() query: StaffFixedSalaryPayablesQueryDto) {
    return this.fixedSalaryCloseService.listPayables(query.month);
  }

  @Post('close-month')
  @ApiOperation({
    summary: 'Close the current month’s fixed salaries',
    description:
      'Generate pending lương cứng payables for the current Asia/Ho_Chi_Minh month. One row per (active staff, current fixed-salary role) with applied amount > 0. Teacher is skipped even if leftover config exists. Snapshots gross, operating %, tax %, deduction amounts, and net using calculateDeductionAmounts (operating on gross, then tax on remainder). Idempotent: unique (staff, role, month) at the database; reruns skip existing rows without changing them. Manual close always runs this path. The day-28 cron uses a separate automatic entry that skips the whole month when any payable already exists.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Close result: createdCount, skippedCount (already existed), and the full payable list for the month.',
  })
  async closeCurrentMonth() {
    return this.fixedSalaryCloseService.closeCurrentMonth();
  }
}
