import { maskEmailAddress } from './mask-email.util';

describe('maskEmailAddress', () => {
  it('keeps only the last 4 characters before @ and the domain', () => {
    expect(maskEmailAddress('nguyenvana2026@gmail.com')).toBe(
      '...2026@gmail.com',
    );
  });

  it('keeps a short local part as-is behind the ellipsis', () => {
    expect(maskEmailAddress(' ab@x.vn ')).toBe('...ab@x.vn');
  });

  it('returns an empty string for values that are not an email', () => {
    expect(maskEmailAddress('')).toBe('');
    expect(maskEmailAddress('no-at-sign')).toBe('');
    expect(maskEmailAddress('@gmail.com')).toBe('');
    expect(maskEmailAddress('abc@')).toBe('');
  });
});
