import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const guard = new ApiKeyGuard();
  const originalLandingApiKey = process.env.LANDING_API_KEY;

  function createContext(apiKey?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: apiKey == null ? {} : { 'x-api-key': apiKey },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  afterEach(() => {
    if (originalLandingApiKey === undefined) {
      delete process.env.LANDING_API_KEY;
    } else {
      process.env.LANDING_API_KEY = originalLandingApiKey;
    }
  });

  it('rejects when LANDING_API_KEY is not configured', () => {
    delete process.env.LANDING_API_KEY;

    expect(() => guard.canActivate(createContext('secret-key'))).toThrow(
      new UnauthorizedException('Landing API key is not configured.'),
    );
  });

  it('rejects when the API key header is missing', () => {
    process.env.LANDING_API_KEY = 'secret-key';

    expect(() => guard.canActivate(createContext())).toThrow(
      new UnauthorizedException('Missing API key.'),
    );
  });

  it('rejects when the API key length does not match', () => {
    process.env.LANDING_API_KEY = 'secret-key';

    expect(() => guard.canActivate(createContext('short'))).toThrow(
      new UnauthorizedException('Invalid API key.'),
    );
  });

  it('rejects when the API key value does not match', () => {
    process.env.LANDING_API_KEY = 'secret-key';

    expect(() => guard.canActivate(createContext('secret-kez'))).toThrow(
      new UnauthorizedException('Invalid API key.'),
    );
  });

  it('allows requests with a matching API key', () => {
    process.env.LANDING_API_KEY = 'secret-key';

    expect(guard.canActivate(createContext('secret-key'))).toBe(true);
  });
});
