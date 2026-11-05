import { describe, expect, it } from "vitest";
import {
  audioPlaysLeft,
  formatAudioTime,
  listenLimitNote,
  openAudio,
} from "./attempt-audio";

const limited = {
  id: "au-1",
  url: null,
  maxPlays: 2,
  allowSeek: false,
  playsUsed: 1,
};

describe("audioPlaysLeft", () => {
  it("không giới hạn → null", () => {
    expect(audioPlaysLeft({ ...limited, maxPlays: null })).toBeNull();
  });

  it("còn lượt = tối đa − đã nghe", () => {
    expect(audioPlaysLeft(limited)).toBe(1);
  });

  it("không âm khi đã nghe vượt (đổi giới hạn sau khi học sinh nghe)", () => {
    expect(audioPlaysLeft({ ...limited, maxPlays: 1, playsUsed: 2 })).toBe(0);
  });
});

describe("openAudio", () => {
  it("URL thường (ôn nhẹ, xem trước) thành audio không giới hạn, cho tua", () => {
    expect(openAudio("https://x/a.mp3")).toEqual({
      id: "https://x/a.mp3",
      url: "https://x/a.mp3",
      maxPlays: null,
      allowSeek: true,
      playsUsed: 0,
    });
  });

  it("không có URL → không có audio", () => {
    expect(openAudio(null)).toBeNull();
    expect(openAudio(undefined)).toBeNull();
  });
});

describe("formatAudioTime", () => {
  it("phút:giây, giây luôn hai chữ số", () => {
    expect(formatAudioTime(0)).toBe("0:00");
    expect(formatAudioTime(15.7)).toBe("0:15");
    expect(formatAudioTime(125)).toBe("2:05");
  });

  it("chưa biết thời lượng (NaN / Infinity) → 0:00", () => {
    expect(formatAudioTime(Number.NaN)).toBe("0:00");
    expect(formatAudioTime(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("listenLimitNote", () => {
  it("không giới hạn, cho tua → không nhắc", () => {
    expect(listenLimitNote({ maxPlays: null, allowSeek: true })).toBeNull();
  });

  it("giới hạn lượt và cấm tua → nhắc cả hai", () => {
    expect(listenLimitNote({ maxPlays: 2, allowSeek: false })).toBe(
      "Học sinh: nghe tối đa 2 lần · không tua được",
    );
  });

  it("chỉ cấm tua", () => {
    expect(listenLimitNote({ maxPlays: null, allowSeek: false })).toBe(
      "Học sinh: không tua được",
    );
  });
});
