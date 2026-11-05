import {
  collectContentImagePaths,
  isContentImagePath,
  signContentImages,
  stripContentImageSrc,
} from './content-images';

const COURSE = '18a6f355-6bc8-4b2f-ab3e-9fe68b871943';
const IMG = '0b6c4c1e-1d2a-4f7e-9a51-2a6f0c3d9e11';
const PATH = `${COURSE}/${IMG}.png`;

describe('isContentImagePath', () => {
  it('nhận path {courseId}/{uuid}.{jpg|png|webp}', () => {
    expect(isContentImagePath(PATH)).toBe(true);
    expect(isContentImagePath(`${COURSE}/${IMG}.webp`)).toBe(true);
  });

  it('từ chối path lạ (thoát thư mục, đuôi khác, thiếu khoá)', () => {
    expect(isContentImagePath(`../${PATH}`)).toBe(false);
    expect(isContentImagePath(`${COURSE}/${IMG}.svg`)).toBe(false);
    expect(isContentImagePath(`${IMG}.png`)).toBe(false);
  });
});

describe('stripContentImageSrc', () => {
  it('bỏ src (URL có token) của ảnh trong bucket, giữ path', () => {
    const html = `<p>a</p><img src="https://x.supabase.co/sign/abc?token=t" data-question-image="${PATH}" alt="h">`;
    expect(stripContentImageSrc(html)).toBe(
      `<p>a</p><img data-question-image="${PATH}" alt="h">`,
    );
  });

  it('không đụng ảnh ngoài bucket', () => {
    const html = '<img src="https://example.com/a.png">';
    expect(stripContentImageSrc(html)).toBe(html);
  });
});

describe('collectContentImagePaths', () => {
  it('lấy path hợp lệ trong mọi chuỗi lồng nhau, không trùng', () => {
    const html = `<img data-question-image="${PATH}">`;
    const value = {
      items: [{ content: html }, { content: html, other: 1 }],
      bad: `<img data-question-image="../etc/passwd">`,
    };
    expect(collectContentImagePaths(value)).toEqual([PATH]);
  });
});

describe('signContentImages', () => {
  it('gắn src = signed URL vào ảnh, trả bản sao, không đổi input', () => {
    const input = {
      content: `<img data-question-image="${PATH}" alt="h">`,
      at: new Date(0),
    };
    const out = signContentImages(input, new Map([[PATH, 'https://s/u?t=1']]));
    expect(out.content).toBe(
      `<img src="https://s/u?t=1" data-question-image="${PATH}" alt="h">`,
    );
    expect(out.at).toBe(input.at);
    expect(input.content).not.toContain('src=');
  });

  it('path chưa ký được → để ảnh không có src', () => {
    const html = `<img data-question-image="${PATH}">`;
    expect(signContentImages(html, new Map())).toBe(html);
  });
});
