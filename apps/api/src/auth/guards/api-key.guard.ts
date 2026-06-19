import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { LANDING_API_KEY_HEADER } from '../decorators/api-key.decorator';

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expectedKey = process.env.LANDING_API_KEY?.trim();
    if (!expectedKey) {
      throw new UnauthorizedException('Landing API key is not configured.');
    }

    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const headerValue =
      request.headers[LANDING_API_KEY_HEADER] ??
      request.headers[LANDING_API_KEY_HEADER.toLowerCase()];
    const providedKey = (
      Array.isArray(headerValue) ? headerValue[0] : headerValue
    )?.trim();

    if (!providedKey) {
      throw new UnauthorizedException('Missing API key.');
    }

    if (!this.safeEqual(providedKey, expectedKey)) {
      throw new UnauthorizedException('Invalid API key.');
    }

    return true;
  }

  private safeEqual(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
