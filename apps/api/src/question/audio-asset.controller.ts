import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from '../auth/decorators/allow-staff-roles-on-admin.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateAudioLimitsDto, UploadAudioDto } from '../dtos/audio-asset.dto';
import { AudioAssetService, type AudioUploadFile } from './audio-asset.service';
import { AUDIO_MAX_BYTES, isAllowedAudioMime } from './audio-rules';

const audioUploadInterceptor = FileInterceptor('file', {
  limits: { fileSize: AUDIO_MAX_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedAudioMime(file.mimetype)) {
      callback(
        new BadRequestException('Audio chỉ hỗ trợ MP3, M4A/AAC hoặc WAV.'),
        false,
      );
      return;
    }
    callback(null, true);
  },
});

@ApiTags('audio-asset')
@ApiCookieAuth('access_token')
@Controller('audio-assets')
@Roles(UserRole.admin)
@AllowStaffRolesOnAdminRoutes(
  StaffRole.assistant,
  StaffRole.teacher,
  StaffRole.lesson_plan,
  StaffRole.lesson_plan_head,
)
export class AudioAssetController {
  constructor(private readonly service: AudioAssetService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(audioUploadInterceptor)
  @ApiOperation({
    summary: 'Tải audio tư liệu lên (JP)',
    description:
      'MP3, M4A/AAC hoặc WAV, tối đa 20MB. Trả `{ id, originalName, url }` — gắn vào câu / tư liệu dùng chung qua `audioId`. Asset bất biến: thay audio = tải bản mới.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'courseId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        courseId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Audio đã tải lên.' })
  @ApiBadRequestResponse({
    description: 'Thiếu file, sai định dạng, hồ sơ không bật audio',
  })
  @ApiResponse({ status: 413, description: 'File vượt 20MB.' })
  upload(
    @Body() body: UploadAudioDto,
    @UploadedFile() file: AudioUploadFile | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.upload(body.courseId, file, {
      userId: user.id,
      roleType: user.roleType,
    });
  }

  @Patch(':id/limits')
  @ApiOperation({
    summary: 'Đặt giới hạn nghe của audio (JP)',
    description:
      'Số lần nghe trong lượt làm (null / 1 / 2) và cho tua hay không. Áp cho cả lượt đang làm; ôn nhẹ và xem lại sau nộp không giới hạn.',
  })
  @ApiParam({ name: 'id', description: 'Audio ID' })
  @ApiBody({ type: UpdateAudioLimitsDto })
  @ApiResponse({ status: 200, description: 'Audio sau khi cập nhật.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy audio.' })
  updateLimits(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAudioLimitsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateLimits(id, body, {
      userId: user.id,
      roleType: user.roleType,
    });
  }
}
