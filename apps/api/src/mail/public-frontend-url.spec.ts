import { ServiceUnavailableException } from '@nestjs/common';
import { resolvePublicFrontendUrl } from './public-frontend-url';

describe('resolvePublicFrontendUrl', () => {
  it('keeps the configured local origin outside production', () => {
    expect(
      resolvePublicFrontendUrl({
        configuredUrl: 'http://localhost:3000/',
        nodeEnv: 'development',
      }),
    ).toBe('http://localhost:3000');
  });

  it('uses a safe production FRONTEND_URL', () => {
    expect(
      resolvePublicFrontendUrl({
        configuredUrl: 'https://it.unicornsedu.com/',
        nodeEnv: 'production',
        requestHost: 'evil.example',
        requestProtocol: 'https',
      }),
    ).toBe('https://it.unicornsedu.com');
  });

  it('derives the public origin from BACKEND_URL when FRONTEND_URL is localhost', () => {
    expect(
      resolvePublicFrontendUrl({
        configuredUrl: 'http://localhost:3000',
        backendUrl: 'https://jp.unicornsedu.com/api',
        nodeEnv: 'production',
      }),
    ).toBe('https://jp.unicornsedu.com');
  });

  it('uses the proxied public host when production env still points at localhost', () => {
    expect(
      resolvePublicFrontendUrl({
        configuredUrl: 'http://localhost:3000',
        backendUrl: 'http://localhost:3001',
        requestHost: 'it.uniedu.vn',
        requestProtocol: 'https',
        nodeEnv: 'production',
      }),
    ).toBe('https://it.uniedu.vn');
  });

  it('uses VPS_PUBLIC_HOST when FRONTEND_URL is localhost', () => {
    expect(
      resolvePublicFrontendUrl({
        configuredUrl: 'http://localhost:3000',
        publicHost: 'it.uniedu.vn',
        requestHost: 'localhost',
        requestProtocol: 'http',
        nodeEnv: 'production',
      }),
    ).toBe('https://it.uniedu.vn');
  });

  it('refuses an untrusted host instead of emailing that origin', () => {
    expect(() =>
      resolvePublicFrontendUrl({
        configuredUrl: 'http://localhost:3000',
        requestHost: 'evil.example',
        requestProtocol: 'https',
        nodeEnv: 'production',
      }),
    ).toThrow(ServiceUnavailableException);
  });
});
