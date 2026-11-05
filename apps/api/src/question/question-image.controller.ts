import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StaffRole, UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from '../auth/decorators/allow-staff-roles-on-admin.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UploadQuestionImageDto } from '../dtos/question-image.dto';
import {
  buildImageUploadFileFilter,
  DEFAULT_MAX_IMAGE_BYTES,
  type UploadableFile,
} from '../storage/supabase-storage';
import { QuestionImageService } from './question-image.service';

const imageUploadInterceptor = FileInterceptor('file', {
  limits: { fileSize: DEFAULT_MAX_IMAGE_BYTES },
  fileFilter: buildImageUploadFileFilter({ defaultFieldLabel: 'Ảnh' }),
});

@ApiTags('question-image')
@ApiCookieAuth('access_token')
@Controller('question-images')
@Roles(UserRole.admin)
@AllowStaffRolesOnAdminRoutes(
  StaffRole.assistant,
  StaffRole.teacher,
  StaffRole.lesson_plan,
  StaffRole.lesson_plan_head,
)
export class QuestionImageController {
  constructor(private readonly service: QuestionImageService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(imageUploadInterceptor)
  @ApiOperation({
    summary: 'Tải ảnh nội dung câu hỏi / Bộ câu hỏi',
    description:
      'JPEG, PNG hoặc WEBP, tối đa 5MB, lưu ở bucket private `question-images`. Trả `{ path, url }`: HTML lưu `<img data-question-image="{path}">`, API tự ký URL vào `src` mỗi lần trả nội dung.',
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
  @ApiResponse({ status: 201, description: 'Ảnh đã tải lên.' })
  @ApiBadRequestResponse({ description: 'Thiếu file hoặc sai định dạng' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền soạn câu của khoá.',
  })
  @ApiResponse({ status: 413, description: 'File vượt 5MB.' })
  upload(
    @Body() body: UploadQuestionImageDto,
    @UploadedFile() file: UploadableFile | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.upload(body.courseId, file, {
      userId: user.id,
      roleType: user.roleType,
    });
  }
}
