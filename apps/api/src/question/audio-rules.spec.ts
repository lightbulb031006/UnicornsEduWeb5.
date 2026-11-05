import { AUDIO_MAX_BYTES, audioFileError, audioExtension } from './audio-rules';

describe('audioFileError', () => {
  it('nhận mp3, m4a, wav trong giới hạn dung lượng', () => {
    for (const mimetype of [
      'audio/mpeg',
      'audio/mp4',
      'audio/x-m4a',
      'audio/wav',
    ]) {
      expect(audioFileError({ mimetype, size: 1024 })).toBeNull();
    }
  });
  it('từ chối định dạng iOS Safari không phát được (ogg) và file không phải audio', () => {
    expect(audioFileError({ mimetype: 'audio/ogg', size: 1024 })).toBe(
      'Audio chỉ hỗ trợ MP3, M4A/AAC hoặc WAV.',
    );
    expect(audioFileError({ mimetype: 'image/png', size: 1024 })).toBe(
      'Audio chỉ hỗ trợ MP3, M4A/AAC hoặc WAV.',
    );
  });
  it('từ chối file quá 20MB', () => {
    expect(AUDIO_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(
      audioFileError({ mimetype: 'audio/mpeg', size: 20 * 1024 * 1024 + 1 }),
    ).toBe('Audio vượt quá giới hạn 20MB.');
  });
  it('thiếu file', () => {
    expect(audioFileError(undefined)).toBe('Vui lòng chọn file audio.');
  });
});

describe('audioExtension', () => {
  it('đuôi file lưu trữ theo định dạng', () => {
    expect(audioExtension('audio/mpeg')).toBe('mp3');
    expect(audioExtension('audio/x-m4a')).toBe('m4a');
    expect(audioExtension('audio/wav')).toBe('wav');
  });
});
