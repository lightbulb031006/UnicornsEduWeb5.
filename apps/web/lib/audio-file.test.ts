import { describe, expect, it } from "vitest";
import { audioFileError } from "./audio-file";

const file = (type: string, size = 1024) => ({ type, size, name: "x" });

describe("audioFileError", () => {
  it("nhận MP3, M4A, WAV dưới 20MB", () => {
    expect(audioFileError(file("audio/mpeg"))).toBeNull();
    expect(audioFileError(file("audio/x-m4a"))).toBeNull();
    expect(audioFileError(file("audio/wav", 20 * 1024 * 1024))).toBeNull();
  });

  it("từ chối định dạng khác", () => {
    expect(audioFileError(file("audio/ogg"))).toBe(
      "Audio chỉ hỗ trợ MP3, M4A/AAC hoặc WAV.",
    );
  });

  it("từ chối file vượt 20MB", () => {
    expect(audioFileError(file("audio/mpeg", 20 * 1024 * 1024 + 1))).toBe(
      "Audio vượt quá giới hạn 20MB.",
    );
  });

  it("đoán theo đuôi khi trình duyệt không báo kiểu (Windows với .m4a)", () => {
    expect(audioFileError({ type: "", size: 10, name: "bai-nghe.M4A" })).toBeNull();
    expect(audioFileError({ type: "", size: 10, name: "bai-nghe.ogg" })).not.toBeNull();
  });
});
