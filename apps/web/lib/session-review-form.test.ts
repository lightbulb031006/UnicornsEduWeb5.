import { describe, expect, it } from "vitest";

import {
  emptySessionReviewForm,
  emptyStudentReviewForm,
  toAttendanceNotes,
  findSessionReviewFormInputError,
  sessionReviewFormFromSession,
  toAttendanceReviewPayload,
  toSessionReviewPayload,
} from "./session-review-form";

describe("toSessionReviewPayload", () => {
  it("null hoá Đã xong/Chưa xong khi tiến độ Hoàn thành", () => {
    const payload = toSessionReviewPayload({
      ...emptySessionReviewForm(),
      progressStatus: "completed",
      progressDone: "Bài 1",
      progressRemaining: "Bài 2",
    });
    expect(payload.progressDone).toBeNull();
    expect(payload.progressRemaining).toBeNull();
  });

  it("bỏ nội dung kiểm tra / kiểm tra lại khi không tick", () => {
    const payload = toSessionReviewPayload({
      ...emptySessionReviewForm(),
      progressStatus: "partial",
      inClassTestContent: "Mini test",
      inClassTestTotal: "10",
      retestContent: "Ôn lại",
    });
    expect(payload.inClassTestContent).toBeNull();
    expect(payload.inClassTestTotal).toBeNull();
    expect(payload.retestContent).toBeNull();
  });

  it("dựng hạn BTVN theo giờ Việt Nam", () => {
    const payload = toSessionReviewPayload({
      ...emptySessionReviewForm(),
      homeworkDueDate: "2026-10-19",
      homeworkDueTime: "20:00:00",
    });
    expect(payload.homeworkDueAt).toBe("2026-10-19T20:00:00+07:00");
  });
});

describe("sessionReviewFormFromSession", () => {
  it("tách hạn BTVN UTC về ngày + giờ Việt Nam", () => {
    const form = sessionReviewFormFromSession({
      progressStatus: "completed",
      homeworkDueAt: "2026-10-19T17:30:00.000Z",
    });
    expect(form.homeworkDueDate).toBe("2026-10-20");
    expect(form.homeworkDueTime).toBe("00:30");
  });

  it("buổi legacy (progressStatus null) trả form rỗng", () => {
    expect(sessionReviewFormFromSession({ progressStatus: null })).toEqual(
      emptySessionReviewForm(),
    );
  });

  it("giữ field đã lưu dù thiếu tiến độ (admin lưu bỏ qua bắt buộc)", () => {
    const form = sessionReviewFormFromSession({
      progressStatus: null,
      nextSessionPlan: "Ôn chương 2",
    });
    expect(form.progressStatus).toBe("");
    expect(form.nextSessionPlan).toBe("Ôn chương 2");
  });
});

describe("findSessionReviewFormInputError", () => {
  it("báo lỗi khi hạn BTVN chỉ có ngày", () => {
    expect(
      findSessionReviewFormInputError({
        ...emptySessionReviewForm(),
        homeworkDueDate: "2026-10-19",
      }),
    ).not.toBeNull();
  });
});

describe("toAttendanceReviewPayload", () => {
  const filled = {
    ...emptyStudentReviewForm(),
    testCorrectCount: "8",
    testComment: "Tốt",
    strengths: "Chăm",
    improvements: "Cẩn thận hơn",
    homeworkQuality: "passed" as const,
    homeworkComment: "Đủ bài",
  };

  it("vắng/nghỉ phép gửi null hết", () => {
    expect(
      Object.values(toAttendanceReviewPayload("absent", filled, true)),
    ).toEqual(Array(6).fill(null));
  });

  it("học thử không có phần BTVN", () => {
    const payload = toAttendanceReviewPayload("trial", filled, true);
    expect(payload.strengths).toBe("Chăm");
    expect(payload.homeworkQuality).toBeNull();
    expect(payload.homeworkComment).toBeNull();
  });

  it("buổi không kiểm tra thì bỏ số câu đúng", () => {
    const payload = toAttendanceReviewPayload("present", filled, false);
    expect(payload.testCorrectCount).toBeNull();
    expect(payload.homeworkQuality).toBe("passed");
  });
});

describe("toAttendanceNotes", () => {
  const form = { ...emptyStudentReviewForm(), excusedReason: "  Ốm  " };

  it("nghỉ phép gửi lý do đã trim", () => {
    expect(toAttendanceNotes("excused", form)).toBe("Ốm");
  });

  it("trạng thái khác gửi null", () => {
    expect(toAttendanceNotes("present", form)).toBeNull();
    expect(toAttendanceNotes("absent", form)).toBeNull();
  });
});
