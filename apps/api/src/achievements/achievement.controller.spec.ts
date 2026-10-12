import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AchievementLevel } from 'generated/enums';
import { AchievementService } from './achievement.service';
import { StudentAchievementController } from './achievement.controller';

describe('StudentAchievementController multipart create', () => {
  let app: INestApplication;
  const createStudentAchievement = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StudentAchievementController],
      providers: [
        {
          provide: AchievementService,
          useValue: { createStudentAchievement },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    createStudentAchievement.mockReset();
    createStudentAchievement.mockResolvedValue({ id: 'achievement-id' });
  });

  it('parses fields and the proof image from one multipart request', async () => {
    type MultipartRequest = {
      field(name: string, value: string): MultipartRequest;
      attach(
        name: string,
        data: Buffer,
        options: { filename: string; contentType: string },
      ): MultipartRequest;
      expect(status: number): Promise<unknown>;
    };
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const multipartRequest = request(server).post(
      '/student/UNIST-1234567890/achievements',
    ) as unknown as MultipartRequest;

    await multipartRequest
      .field('award', 'Giải Nhất')
      .field('exam', 'HSG Tỉnh')
      .field('year', '2026')
      .field('level', AchievementLevel.HSG_TINH_THANH_PHO)
      .attach('image', Buffer.from('png-bytes'), {
        filename: 'proof.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(createStudentAchievement).toHaveBeenCalledWith(
      'UNIST-1234567890',
      expect.objectContaining({
        award: 'Giải Nhất',
        exam: 'HSG Tỉnh',
        year: 2026,
        level: AchievementLevel.HSG_TINH_THANH_PHO,
      }),
      expect.objectContaining({
        mimetype: 'image/png',
        size: 9,
      }),
    );
  });
});
