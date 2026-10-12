import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import {
  assertStorageBucketsAvailable,
  buildImageUploadFileFilter,
  createSignedStorageUrl,
  normalizeHttpHttpsUrl,
} from './supabase-storage';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const mockedCreateClient = jest.mocked(createClient);

describe('supabase-storage helpers', () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    jest.resetAllMocks();
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it('normalizes http/https URLs and rejects unsupported protocols', () => {
    expect(normalizeHttpHttpsUrl(' https://example.com/qr ', 'QR link')).toBe(
      'https://example.com/qr',
    );
    expect(normalizeHttpHttpsUrl('   ', 'QR link')).toBeNull();
    expect(normalizeHttpHttpsUrl(undefined, 'QR link')).toBeUndefined();

    expect(() =>
      normalizeHttpHttpsUrl('javascript:alert(1)', 'QR link'),
    ).toThrow(BadRequestException);
  });

  it('accepts only supported image mime types in multer fileFilter', () => {
    const fileFilter = buildImageUploadFileFilter({
      labelsByFieldName: {
        avatar: 'Ảnh đại diện',
      },
    });

    const okCallback = jest.fn();
    fileFilter(
      {},
      {
        fieldname: 'avatar',
        mimetype: 'image/png',
      },
      okCallback,
    );
    expect(okCallback).toHaveBeenCalledWith(null, true);

    const badCallback = jest.fn();
    fileFilter(
      {},
      {
        fieldname: 'avatar',
        mimetype: 'text/plain',
      },
      badCallback,
    );
    expect(badCallback).toHaveBeenCalled();
    const [error, accepted] = badCallback.mock.calls[0] as [Error, boolean];
    expect(accepted).toBe(false);
    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('fails loudly when a required signed URL has no storage config', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await expect(
      createSignedStorageUrl({
        bucket: 'achievements',
        path: 'student/x/proof.png',
        expiresIn: 60,
        required: true,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('keeps optional signed URLs backward-compatible when storage is unconfigured', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await expect(
      createSignedStorageUrl({
        bucket: 'avatars',
        path: 'users/x/avatar.png',
        expiresIn: 60,
      }),
    ).resolves.toBeNull();
  });

  it('surfaces a signed URL error when the database already has an image path', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    mockedCreateClient.mockReturnValue({
      storage: {
        from: jest.fn().mockReturnValue({
          createSignedUrl: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Object not found' },
          }),
        }),
      },
    } as never);

    await expect(
      createSignedStorageUrl({
        bucket: 'achievements',
        path: 'student/x/proof.png',
        expiresIn: 60,
        required: true,
      }),
    ).rejects.toThrow('Object not found');
  });

  it('checks that achievement buckets exist and have the expected visibility', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    const getBucket = jest
      .fn()
      .mockResolvedValueOnce({ data: { public: false }, error: null })
      .mockResolvedValueOnce({ data: { public: true }, error: null });
    mockedCreateClient.mockReturnValue({
      storage: { getBucket },
    } as never);

    await expect(
      assertStorageBucketsAvailable([
        { name: 'achievements', public: false },
        { name: 'achievements-public', public: true },
      ]),
    ).resolves.toBeUndefined();
    expect(getBucket).toHaveBeenNthCalledWith(1, 'achievements');
    expect(getBucket).toHaveBeenNthCalledWith(2, 'achievements-public');
  });

  it('reports the exact missing bucket instead of a generic upload error', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    mockedCreateClient.mockReturnValue({
      storage: {
        getBucket: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Bucket not found' },
        }),
      },
    } as never);

    await expect(
      assertStorageBucketsAvailable([
        { name: 'achievements-public', public: true },
      ]),
    ).rejects.toThrow('achievements-public');
  });

  it('rejects an achievement bucket with the wrong visibility', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    mockedCreateClient.mockReturnValue({
      storage: {
        getBucket: jest.fn().mockResolvedValue({
          data: { public: true },
          error: null,
        }),
      },
    } as never);

    await expect(
      assertStorageBucketsAvailable([{ name: 'achievements', public: false }]),
    ).rejects.toThrow('private');
  });
});
