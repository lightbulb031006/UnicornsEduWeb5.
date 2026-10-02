import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type ReceiptImageDataUris = {
  logoMain: string;
  logoMath: string;
};

/**
 * Logo Toán dùng cho biên lai; logo_main_sm vẫn dùng riêng cho email xác thực.
 * Tái tạo bằng pipeline xử lý ảnh nội bộ khi cần cập nhật asset.
 */
@Injectable()
export class ReceiptAssetsService {
  private readonly logger = new Logger(ReceiptAssetsService.name);

  getReceiptImageDataUris(): ReceiptImageDataUris | null {
    try {
      const read = (file: string) => {
        const buf = readFileSync(this.resolveAssetPath(file));
        return `data:image/png;base64,${buf.toString('base64')}`;
      };
      return {
        logoMain: read('logo_main_sm.png'),
        logoMath: read('logo_math_sm.png'),
      };
    } catch (error) {
      this.logger.warn(
        `Không đọc được ảnh biên lai (logo/stamp): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private resolveAssetPath(file: string): string {
    const dirs = [
      join(process.cwd(), 'dist', 'mail', 'assets'),
      join(process.cwd(), 'src', 'mail', 'assets'),
    ];
    for (const dir of dirs) {
      const full = join(dir, file);
      if (existsSync(full)) {
        return full;
      }
    }
    throw new Error(`Không tìm thấy ${file} trong mail/assets`);
  }
}
