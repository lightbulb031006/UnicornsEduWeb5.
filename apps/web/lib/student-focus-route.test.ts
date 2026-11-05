import { describe, expect, it } from "vitest";
import { isAttemptRoute } from "./student-focus-route";

describe("isAttemptRoute", () => {
  it("nhận trang lượt làm", () => {
    expect(isAttemptRoute("/student/classes/UNICL-1/assignments/a1/attempts/t1")).toBe(true);
    expect(isAttemptRoute("/student/classes/UNICL-1/assignments/a1/attempts/t1/")).toBe(true);
  });

  it("không nhận trang khác của học sinh", () => {
    expect(isAttemptRoute("/student/classes/UNICL-1/assignments/a1")).toBe(false);
    expect(isAttemptRoute("/student/classes/UNICL-1")).toBe(false);
    expect(isAttemptRoute("/student")).toBe(false);
    expect(isAttemptRoute(null)).toBe(false);
  });
});
