import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
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
} from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import {
  type RegulationItemDto,
  CreateRegulationDto,
  UpdateRegulationDto,
} from 'src/dtos/regulation.dto';
import { RegulationService } from './regulation.service';

@Controller('regulations')
@ApiTags('regulations')
@ApiCookieAuth('access_token')
export class RegulationController {
  constructor(private readonly regulationService: RegulationService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.staff)
  @ApiOperation({
    summary: 'List regulations for the current actor',
    description:
      'Admin receives the full list. Other staff (including sale_customer_care_head) only receive regulations matching their role tags.',
  })
  @ApiResponse({
    status: 200,
    description: 'Regulation list for the current actor.',
  })
  async getRegulations(
    @CurrentUser() user: JwtPayload,
  ): Promise<RegulationItemDto[]> {
    return this.regulationService.getRegulations(user);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Create a regulation',
    description:
      'Create a new regulation post for the notes-subject regulations tab.',
  })
  @ApiBody({
    type: CreateRegulationDto,
    description: 'Regulation payload.',
  })
  @ApiResponse({
    status: 201,
    description: 'Regulation created.',
  })
  async createRegulation(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateRegulationDto,
  ): Promise<RegulationItemDto> {
    return this.regulationService.createRegulation(user, data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Update a regulation',
    description:
      'Update an existing regulation post for the notes-subject regulations tab.',
  })
  @ApiParam({
    name: 'id',
    description: 'Regulation id',
  })
  @ApiBody({
    type: UpdateRegulationDto,
    description: 'Regulation fields to update.',
  })
  @ApiResponse({
    status: 200,
    description: 'Regulation updated.',
  })
  async updateRegulation(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() data: UpdateRegulationDto,
  ): Promise<RegulationItemDto> {
    return this.regulationService.updateRegulation(id, user, data, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Delete a regulation',
    description:
      'Hard delete an existing regulation post from the notes-subject regulations tab.',
  })
  @ApiParam({
    name: 'id',
    description: 'Regulation id',
  })
  @ApiResponse({
    status: 200,
    description: 'Regulation deleted.',
  })
  @ApiResponse({
    status: 404,
    description: 'Regulation not found.',
  })
  async deleteRegulation(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RegulationItemDto> {
    return this.regulationService.deleteRegulation(id, user, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }
}
