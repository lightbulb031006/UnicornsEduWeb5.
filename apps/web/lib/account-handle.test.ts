import { describe, expect, it } from "vitest";
import { validateAccountHandle } from "./account-handle";

describe("validateAccountHandle (16/11)", () => {
  it("trim, giữ hoa thường", () => {
    expect(validateAccountHandle("  NguyenVanA.2010 ")).toEqual({
      ok: true,
      value: "NguyenVanA.2010",
    });
  });

  it("biên 3 và 50 ký tự hợp lệ", () => {
    expect(validateAccountHandle("abc").ok).toBe(true);
    expect(validateAccountHandle("a".repeat(50)).ok).toBe(true);
  });

  it.each(["", "  ", "ab", "a".repeat(51)])("sai độ dài (%j)", (raw) => {
    expect(validateAccountHandle(raw)).toEqual({
      ok: false,
      message: "Tên đăng nhập phải dài 3–50 ký tự.",
    });
  });

  it.each(["nguyen van a", "a\tb12", "hs@unicorns.edu.vn", "@hs01"])(
    "chặn khoảng trắng / @ (%j)",
    (raw) => {
      expect(validateAccountHandle(raw)).toEqual({
        ok: false,
        message: "Tên đăng nhập không được chứa khoảng trắng hoặc ký tự @.",
      });
    },
  );
});
