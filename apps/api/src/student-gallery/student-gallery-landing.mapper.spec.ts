import { mapLandingStudentGallery } from './student-gallery-landing.mapper';

describe('mapLandingStudentGallery', () => {
  const originalEnv = process.env.SUPABASE_URL;

  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalEnv;
    }
  });

  it('maps watermarked public URLs only', () => {
    const result = mapLandingStudentGallery([
      {
        id: 'g1',
        caption: null,
        imageWatermarkedPath: 'student/UNIST-1/g1.jpg',
        sortOrder: 0,
      },
      {
        id: 'g2',
        caption: null,
        imageWatermarkedPath: null,
        sortOrder: 1,
      },
    ]);

    expect(result).toEqual([
      {
        id: 'g1',
        caption: null,
        imagePath: 'student/UNIST-1/g1.jpg',
        imageUrl:
          'https://example.supabase.co/storage/v1/object/public/student-gallery-public/student/UNIST-1/g1.jpg',
        sortOrder: 0,
      },
      {
        id: 'g2',
        caption: null,
        imagePath: null,
        imageUrl: null,
        sortOrder: 1,
      },
    ]);
  });
});
