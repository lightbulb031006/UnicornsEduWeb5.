import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
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
import { ParseClassIdPipe } from 'src/common/pipes/parse-entity-id.pipe';
import { ClassCoverImageDto } from 'src/dtos/class.dto';
import {
  buildImageUploadFileFilter,
  DEFAULT_MAX_IMAGE_BYTES,
  type UploadableFile,
} from 'src/storage/supabase-storage';
import { ClassCoverService } from './class-cover.service';
import { CLASS_COVER_FIELD_LABEL } from './class-cover.storage';

const coverUploadInterceptor = FileInterceptor('image', {
  limits: { fileSize: DEFAULT_MAX_IMAGE_BYTES },
  fileFilter: buildImageUploadFileFilter({
    defaultFieldLabel: CLASS_COVER_FIELD_LABEL,
    labelsByFieldName: { image: CLASS_COVER_FIELD_LABEL },
  }),
});

@Controller('class/:id/cover-image')
@ApiTags('class')
@ApiCookieAuth('access_token')
// Mở cho mọi staff; quyền xem/đổi theo từng lớp kiểm tra trong ClassCoverService.
@Roles(UserRole.staff, UserRole.admin)
export class ClassCoverController {
  constructor(private readonly classCoverService: ClassCoverService) {}

  @Get()
  @ApiOperation({
    summary: 'Get class cover image',
    description:
      'Ảnh bìa lớp (signed URL) và cờ canManage cho người gọi. Ai xem được chi tiết lớp thì xem được ảnh bìa.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({ status: 200, type: ClassCoverImageDto })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  getCover(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
  ): Promise<ClassCoverImageDto> {
    return this.classCoverService.getCover(user.id, user.roleType, id);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(coverUploadInterceptor)
  @ApiOperation({
    summary: 'Upload/replace class cover image',
    description:
      'Admin và trợ lí: mọi lớp. Gia sư đứng lớp và Quản lý lớp: chỉ lớp của mình. JPG/PNG/WEBP, tối đa 5MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, type: ClassCoverImageDto })
  @ApiResponse({ status: 400, description: 'Missing or invalid image.' })
  @ApiResponse({
    status: 403,
    description: 'Not allowed to manage this class cover.',
  })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  uploadCover(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
    @UploadedFile() file?: UploadableFile,
  ): Promise<ClassCoverImageDto> {
    return this.classCoverService.upload(user.id, user.roleType, id, file);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove class cover image',
    description: 'Gỡ ảnh bìa; thẻ lớp quay về mascot. Quyền như upload.',
  })
  @ApiParam({ name: 'id', description: 'Class id' })
  @ApiResponse({ status: 200, type: ClassCoverImageDto })
  @ApiResponse({
    status: 403,
    description: 'Not allowed to manage this class cover.',
  })
  @ApiResponse({ status: 404, description: 'Class not found.' })
  removeCover(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseClassIdPipe()) id: string,
  ): Promise<ClassCoverImageDto> {
    return this.classCoverService.remove(user.id, user.roleType, id);
  }
}
