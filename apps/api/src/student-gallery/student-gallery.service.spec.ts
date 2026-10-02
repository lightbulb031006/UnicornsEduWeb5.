import { BadRequestException } from '@nestjs/common';
import { StudentGalleryService } from './student-gallery.service';

describe('StudentGalleryService.assertCompleteReorder', () => {
  const service = new StudentGalleryService({} as never);

  it('accepts a complete permutation', () => {
    expect(() =>
      service.assertCompleteReorder(['a', 'b', 'c'], ['c', 'a', 'b']),
    ).not.toThrow();
  });

  it('rejects missing or extra ids', () => {
    expect(() => service.assertCompleteReorder(['a', 'b'], ['a'])).toThrow(
      BadRequestException,
    );
    expect(() => service.assertCompleteReorder(['a'], ['a', 'b'])).toThrow(
      BadRequestException,
    );
  });

  it('rejects unknown ids', () => {
    expect(() => service.assertCompleteReorder(['a', 'b'], ['a', 'x'])).toThrow(
      BadRequestException,
    );
  });
});
