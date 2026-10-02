import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { StaffRole, UserRole } from 'generated/enums';
import { AllowStaffRolesOnAdminRoutes } from '../auth/decorators/allow-staff-roles-on-admin.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateStudentGalleryItemDto,
  ReorderStudentGalleryDto,
  UpdateStudentGalleryItemDto,
} from '../dtos/student-gallery.dto';
import { ParseStudentIdPipe } from '../common/pipes/parse-entity-id.pipe';
import {
  buildImageUploadFileFilter,
  DEFAULT_MAX_IMAGE_BYTES,
} from '../storage/supabase-storage';
import { StudentGalleryService } from './student-gallery.service';

const imageUploadInterceptor = FileInterceptor('image', {
  limits: { fileSize: DEFAULT_MAX_IMAGE_BYTES },
  fileFilter: buildImageUploadFileFilter({
    defaultFieldLabel: 'Ảnh gallery',
    labelsByFieldName: { image: 'Ảnh gallery' },
  }),
});

@ApiTags('student-gallery')
@ApiCookieAuth('access_token')
@Controller('student/:studentId/gallery')
@Roles(UserRole.admin)
// Mutations (create/update/delete/upload/reorder) stay admin + assistant only;
// customer_care/accountant/accountant_income can view (see the `list()` override) but not edit.
@AllowStaffRolesOnAdminRoutes(StaffRole.assistant)
export class StudentGalleryController {
  constructor(private readonly galleryService: StudentGalleryService) {}

  @Get()
  // Viewing must match whoever can view the student profile itself
  // (GET student/:id also allows accountant + accountant_income on admin routes).
  @AllowStaffRolesOnAdminRoutes(
    StaffRole.assistant,
    StaffRole.customer_care,
    StaffRole.accountant,
    StaffRole.accountant_income,
  )
  @ApiOperation({ summary: 'List student gallery items' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiResponse({
    status: 200,
    description: 'Gallery items ordered by sortOrder.',
  })
  list(@Param('studentId', new ParseStudentIdPipe()) studentId: string) {
    return this.galleryService.list(studentId);
  }

  @Post()
  @ApiOperation({ summary: 'Create student gallery item' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiBody({ type: CreateStudentGalleryItemDto })
  @ApiResponse({ status: 201, description: 'Created gallery item.' })
  create(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Body() body: CreateStudentGalleryItemDto,
  ) {
    return this.galleryService.create(studentId, body);
  }

  @Patch(':itemId')
  @ApiOperation({ summary: 'Update student gallery caption/sortOrder' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiParam({ name: 'itemId', description: 'Gallery item UUID' })
  @ApiBody({ type: UpdateStudentGalleryItemDto })
  update(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateStudentGalleryItemDto,
  ) {
    return this.galleryService.update(studentId, itemId, body);
  }

  @Delete(':itemId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete student gallery item (and storage image)' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiParam({ name: 'itemId', description: 'Gallery item UUID' })
  remove(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.galleryService.remove(studentId, itemId);
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Reorder student gallery items' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiBody({ type: ReorderStudentGalleryDto })
  reorder(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Body() body: ReorderStudentGalleryDto,
  ) {
    return this.galleryService.reorder(studentId, body);
  }

  @Post(':itemId/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(imageUploadInterceptor)
  @ApiOperation({ summary: 'Upload/replace student gallery image' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiParam({ name: 'itemId', description: 'Gallery item UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  uploadImage(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.galleryService.uploadImage(studentId, itemId, file);
  }

  @Delete(':itemId/image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear student gallery image' })
  @ApiParam({ name: 'studentId', description: 'Student id (UNIST-…)' })
  @ApiParam({ name: 'itemId', description: 'Gallery item UUID' })
  deleteImage(
    @Param('studentId', new ParseStudentIdPipe()) studentId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.galleryService.deleteImage(studentId, itemId);
  }
}
