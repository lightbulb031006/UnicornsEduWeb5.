import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from 'generated/enums';
import { CourseAccessService } from '../class/course-access.service';
import type { QuestionImageDto } from '../dtos/question-image.dto';
import { QUESTION_IMAGE_STORAGE_BUCKET } from '../storage/media-buckets';
import {
  createSignedStorageUrl,
  uploadStorageObject,
  validateImageFile,
  type UploadableFile,
} from '../storage/supabase-storage';

const IMAGE_URL_TTL_SECONDS = 6 * 60 * 60;
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type ImageActor = { userId?: string; roleType?: UserRole };

@Injectable()
export class QuestionImageService {
  constructor(private readonly courseAccess: CourseAccessService) {}

  /** Tải ảnh nội dung câu hỏi lên bucket private; ảnh bất biến (thay = tải bản mới). */
  async upload(
    courseId: string,
    file: UploadableFile | undefined,
    actor: ImageActor,
  ): Promise<QuestionImageDto> {
    await this.courseAccess.assertCourseExists(courseId);
    if (!actor.userId) {
      throw new BadRequestException('Missing actor for image write');
    }
    const courseActor = await this.courseAccess.resolveActor(
      actor.userId,
      actor.roleType ?? UserRole.staff,
    );
    await this.courseAccess.assertCanWriteCourseQuestions(
      courseActor,
      courseId,
    );
    if (!file) throw new BadRequestException('Chưa chọn ảnh.');
    validateImageFile(file, 'Ảnh');

    const path = `${courseId}/${randomUUID()}.${EXTENSION_BY_MIME[file.mimetype]}`;
    await uploadStorageObject({
      bucket: QUESTION_IMAGE_STORAGE_BUCKET,
      path,
      body: file.buffer,
      contentType: file.mimetype,
      upsert: false,
    });
    const url = await createSignedStorageUrl({
      bucket: QUESTION_IMAGE_STORAGE_BUCKET,
      path,
      expiresIn: IMAGE_URL_TTL_SECONDS,
    });
    return { path, url };
  }
}
