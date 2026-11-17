import { FileInterceptor } from '@nestjs/platform-express';
import {
  buildImageUploadFileFilter,
  DEFAULT_MAX_IMAGE_BYTES,
} from '../storage/supabase-storage';

/** Field `image` multipart cho ảnh minh chứng thành tích (staff + student). */
export const achievementImageUploadInterceptor = FileInterceptor('image', {
  limits: { fileSize: DEFAULT_MAX_IMAGE_BYTES },
  fileFilter: buildImageUploadFileFilter({
    defaultFieldLabel: 'Ảnh minh chứng',
    labelsByFieldName: { image: 'Ảnh minh chứng' },
  }),
});
