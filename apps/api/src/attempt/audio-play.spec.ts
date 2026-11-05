import { attemptAudioView } from './audio-play';

const asset = (maxPlays: number | null, allowSeek = true) => ({
  id: 'au-1',
  url: 'https://signed/au-1',
  maxPlays,
  allowSeek,
});

describe('attemptAudioView', () => {
  it('audio không giới hạn trong lượt đang làm: trả URL, cho tua theo cấu hình', () => {
    expect(attemptAudioView(asset(null, false), 0, true)).toEqual({
      id: 'au-1',
      url: 'https://signed/au-1',
      maxPlays: null,
      allowSeek: false,
      playsUsed: 0,
    });
  });

  it('audio giới hạn trong lượt đang làm: giấu URL (phải xin qua endpoint phát), kèm số lần đã nghe', () => {
    expect(attemptAudioView(asset(2, false), 1, true)).toEqual({
      id: 'au-1',
      url: null,
      maxPlays: 2,
      allowSeek: false,
      playsUsed: 1,
    });
  });

  it('xem lại sau nộp: không giới hạn, cho tua', () => {
    expect(attemptAudioView(asset(1, false), 1, false)).toEqual({
      id: 'au-1',
      url: 'https://signed/au-1',
      maxPlays: null,
      allowSeek: true,
      playsUsed: 1,
    });
  });
});
