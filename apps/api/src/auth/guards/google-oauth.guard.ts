import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

/** Giá trị `state` OAuth: học sinh chọn đăng xuất mọi thiết bị rồi đăng nhập. */
export const GOOGLE_FORCE_DEVICE_STATE = 'force_device';

/**
 * Bước mở OAuth Google. `?force_device=1` (màn bị chặn `device_blocked`) đi
 * qua `state` tới callback. Không cần ký: cờ chỉ có tác dụng sau khi Google đã
 * xác thực đúng chủ tài khoản, giả cờ thì tối đa tự đá máy cũ của chính mình.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    return req.query?.force_device === '1'
      ? { state: GOOGLE_FORCE_DEVICE_STATE }
      : undefined;
  }
}
