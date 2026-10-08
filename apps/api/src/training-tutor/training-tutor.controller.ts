import { Controller, Get, Param, Query } from '@nestjs/common';
import {
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
import { ParseStaffIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import { PaginationQueryDto } from 'src/dtos/pagination.dto';
import { TrainingTutorListQueryDto } from 'src/dtos/training-tutor.dto';
import { TrainingTutorService } from './training-tutor.service';

@ApiTags('training-tutors')
@Controller('training/tutors')
@ApiCookieAuth('access_token')
@Roles(UserRole.staff, UserRole.admin)
export class TrainingTutorController {
  constructor(private readonly trainingTutorService: TrainingTutorService) {}

  @Get()
  @ApiOperation({
    summary: 'Ban Đào Tạo: danh sách gia sư (gồm cả inactive)',
    description:
      'Chỉ trả field allowlist: id, fullName, status, email, phone, avatarUrl, university, highSchool, achievementCount.',
  })
  @ApiResponse({ status: 200, description: 'Paginated tutor summaries.' })
  @ApiResponse({ status: 403, description: 'Không phải Ban Đào Tạo.' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: TrainingTutorListQueryDto,
  ) {
    return this.trainingTutorService.listTutors(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Ban Đào Tạo: hồ sơ gia sư + lớp đang/đã dạy',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({
    status: 200,
    description: 'Tutor detail without hidden fields.',
  })
  @ApiResponse({ status: 403, description: 'Không phải Ban Đào Tạo.' })
  @ApiResponse({ status: 404, description: 'Không phải gia sư.' })
  detail(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
  ) {
    return this.trainingTutorService.getTutor(user, staffId);
  }

  @Get(':id/sessions')
  @ApiOperation({
    summary: 'Ban Đào Tạo: buổi gia sư đã dạy (không có tiền)',
  })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated sessions: date, time, class.',
  })
  @ApiResponse({ status: 403, description: 'Không phải Ban Đào Tạo.' })
  @ApiResponse({ status: 404, description: 'Không phải gia sư.' })
  sessions(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.trainingTutorService.listTutorSessions(user, staffId, query);
  }

  @Get(':id/achievements')
  @ApiOperation({ summary: 'Ban Đào Tạo: thành tích gia sư (chỉ đọc)' })
  @ApiParam({ name: 'id', description: 'Staff id (UNISTAFF-…)' })
  @ApiResponse({ status: 200, description: 'Achievements in profile order.' })
  @ApiResponse({ status: 403, description: 'Không phải Ban Đào Tạo.' })
  @ApiResponse({ status: 404, description: 'Không phải gia sư.' })
  achievements(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseStaffIdPipe()) staffId: string,
  ) {
    return this.trainingTutorService.listTutorAchievements(user, staffId);
  }
}
