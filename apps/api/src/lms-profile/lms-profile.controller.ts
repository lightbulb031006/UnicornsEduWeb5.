import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AppConfigResponseDto } from '../dtos/app-config.dto';
import { LmsProfileService } from './lms-profile.service';

@ApiTags('public')
@Controller('public')
export class LmsProfileController {
  constructor(private readonly lmsProfile: LmsProfileService) {}

  @Public()
  @Get('app-config')
  @ApiOperation({
    summary: 'Hồ sơ môn của instance',
    description:
      'Cấu hình câu hỏi theo `LMS_PROFILE` của API: loại câu được phép, số phương án, thang điểm, có nhóm tự chọn hay không. Web dùng thay cho env riêng.',
  })
  @ApiResponse({ status: 200, type: AppConfigResponseDto })
  getAppConfig(): AppConfigResponseDto {
    return this.lmsProfile.config;
  }
}
