import { describe, expect, it } from "vitest";
import {
  attendanceStatusTemplateLabel,
  buildSessionCommentZaloText,
  findSessionReviewFormError,
  formatHomeworkDueAtLabel,
  formatStudentCommentBlock,
  resolveSessionCommentDisplayContent,
  resolveStudentCommentLines,
  richTextToPlainTextPreservingStructure,
  stripLegacyStudentCommentsSection,
} from "./session-comment-zalo.helpers";

const baseInput = {
  className: "Lớp A",
  date: "2026-06-24",
  startTime: "18:00",
  endTime: "20:00",
  lessonContent: "<p>Nội dung bài học</p>",
  homework: "<p>Bài tập</p>",
  tutorial: "<p>Tutorial buổi</p>",
};

describe("attendanceStatusTemplateLabel", () => {
  it("maps attendance statuses to lowercase template labels", () => {
    expect(attendanceStatusTemplateLabel("present")).toBe("học");
    expect(attendanceStatusTemplateLabel("excused")).toBe("nghỉ phép");
    expect(attendanceStatusTemplateLabel("absent")).toBe("vắng");
  });
});

describe("richTextToPlainTextPreservingStructure", () => {
  it("keeps bullet list items", () => {
    const html =
      "<ul><li><p>Làm tốt bài tập</p></li><li><p>Cần luyện thêm vòng lặp</p></li></ul>";

    expect(richTextToPlainTextPreservingStructure(html)).toBe(
      "- Làm tốt bài tập\n- Cần luyện thêm vòng lặp",
    );
  });

  it("keeps the URL when link label differs from href", () => {
    const html = '<p>Xem tài liệu <a href="https://example.com/tutorial">tại đây</a></p>';

    expect(richTextToPlainTextPreservingStructure(html)).toBe(
      "Xem tài liệu tại đây (https://example.com/tutorial)",
    );
  });

  it("does not duplicate the URL when link label equals href", () => {
    const html = '<p><a href="https://example.com/tutorial">https://example.com/tutorial</a></p>';

    expect(richTextToPlainTextPreservingStructure(html)).toBe(
      "https://example.com/tutorial",
    );
  });

  it("keeps links inside list items", () => {
    const html =
      '<ul><li><p>Tài liệu: <a href="https://example.com/doc">đọc thêm</a></p></li></ul>';

    expect(richTextToPlainTextPreservingStructure(html)).toBe(
      "- Tài liệu: đọc thêm (https://example.com/doc)",
    );
  });
});

describe("resolveStudentCommentLines", () => {
  it("returns dash for present without notes", () => {
    expect(resolveStudentCommentLines("present", "")).toEqual(["—"]);
  });

  it("returns teacher notes for present", () => {
    expect(resolveStudentCommentLines("present", "<p>Tham gia tích cực</p>")).toEqual([
      "Tham gia tích cực",
    ]);
  });

  it("returns empty comment lines for absent without notes", () => {
    expect(resolveStudentCommentLines("absent", "")).toEqual([]);
  });

  it("prefers teacher notes for absent when provided", () => {
    expect(resolveStudentCommentLines("absent", "<p>Báo ốm</p>")).toEqual(["Báo ốm"]);
  });

  it("always includes Vắng có phép for excused", () => {
    expect(resolveStudentCommentLines("excused", "")).toEqual(["Vắng có phép"]);
  });

  it("prepends Vắng có phép before extra notes for excused", () => {
    expect(resolveStudentCommentLines("excused", "<p>Đi thi học kỳ</p>")).toEqual([
      "Vắng có phép",
      "Đi thi học kỳ",
    ]);
  });
});

describe("formatStudentCommentBlock", () => {
  it("shows status inline on the student name line", () => {
    expect(formatStudentCommentBlock("Nguyễn Văn A", "present", ["Làm tốt", "Cần cải thiện"])).toBe(
      "Nguyễn Văn A (học)\n  - Làm tốt\n  - Cần cải thiện",
    );
  });

  it("returns only the name line when there are no comments", () => {
    expect(formatStudentCommentBlock("Lê Văn C", "absent", [])).toBe("Lê Văn C (vắng)");
  });

  it("normalizes existing bullet prefixes before indenting", () => {
    expect(
      formatStudentCommentBlock("Nguyễn Văn A", "present", [
        "- Làm tốt bài tập",
        "- Cần luyện thêm vòng lặp",
      ]),
    ).toBe(
      "Nguyễn Văn A (học)\n  - Làm tốt bài tập\n  - Cần luyện thêm vòng lặp",
    );
  });
});

describe("buildSessionCommentZaloText", () => {
  it("lists every student with status and multiline comments in section 3", () => {
    const text = buildSessionCommentZaloText({
      ...baseInput,
      students: [
        {
          fullName: "Nguyễn Văn A",
          status: "present",
          notes:
            "<ul><li><p>Làm tốt bài tập</p></li><li><p>Cần luyện thêm vòng lặp</p></li></ul>",
        },
        {
          fullName: "Trần Thị B",
          status: "excused",
          notes: "",
        },
        {
          fullName: "Lê Văn C",
          status: "absent",
          notes: "",
        },
        {
          fullName: "Phạm Thị D",
          status: "present",
          notes: "",
        },
      ],
    });

    expect(text).toContain("3️⃣ Nhận xét từng học sinh");
    expect(text).toContain(
      "Nguyễn Văn A (học)\n  - Làm tốt bài tập\n  - Cần luyện thêm vòng lặp",
    );
    expect(text).toContain("Trần Thị B (nghỉ phép)\n  - Vắng có phép");
    expect(text).toContain("Lê Văn C (vắng)");
    expect(text).toContain("Phạm Thị D (học)\n  - —");
    expect(text).toContain("5️⃣ Tutorial các buổi học");
    expect(text).toContain("Tutorial buổi");
  });
});

describe("buildSessionCommentZaloText — structured review", () => {
  const review = {
    progressStatus: "partial" as const,
    progressDone: "Vòng lặp for",
    progressRemaining: "Vòng lặp while – hết giờ\nBài 3 – HS hỏi nhiều",
    hasInClassTest: true,
    inClassTestContent: "Từ vựng N5 bài 3",
    inClassTestTotal: 10,
    homeworkDueAt: "2026-06-26T13:00:00.000Z",
    nextSessionPlan: "Vòng lặp while",
    hasRetest: false,
    retestContent: null,
  };
  const presentStudent = {
    fullName: "Nguyễn Văn A",
    status: "present" as const,
    testCorrectCount: 8,
    testComment: "Nhớ tốt",
    strengths: "Tập trung\n- Hỏi bài chủ động",
    improvements: "Chữ viết",
    homeworkQuality: "needs_revision" as const,
    homeworkComment: "Sai 2 câu",
  };

  it("renders the new template in order for the whole class", () => {
    const text = buildSessionCommentZaloText({
      ...baseInput,
      ordinal: 12,
      makeupOriginalDate: "2026-06-20",
      review,
      students: [
        presentStudent,
        { fullName: "Trần B", status: "absent", strengths: "bỏ qua" },
      ],
    });

    expect(text).toBe(
      [
        "📚 NHẬN XÉT BUỔI HỌC",
        "🏫 Lớp: Lớp A",
        "📅 Buổi 12 – 24/06/2026 | 18:00 - 20:00 (bù ngày 20/06)",
        "",
        "📖 Nội dung:",
        "Nội dung bài học",
        "",
        "📊 Tiến độ: Một phần",
        "• Đã xong: Vòng lặp for",
        "• Chưa xong:",
        "  - Vòng lặp while – hết giờ",
        "  - Bài 3 – HS hỏi nhiều",
        "",
        "🧪 Kiểm tra trong buổi: Từ vựng N5 bài 3 (10 câu)",
        "",
        "━━━━━━━━━━━━━━━",
        "👤 Nguyễn Văn A (học)",
        "🧪 Kết quả: 8/10 câu – 80% · Nhớ tốt",
        "✅ Điểm tốt:",
        "• Tập trung",
        "• Hỏi bài chủ động",
        "⚠️ Cần cải thiện:",
        "• Chữ viết",
        "📝 Chất lượng BTVN buổi trước: Cần sửa – Sai 2 câu",
        "",
        "👤 Trần B (vắng)",
        "",
        "━━━━━━━━━━━━━━━",
        "📌 BTVN được giao:",
        "Bài tập",
        "⏰ Hạn: 20:00 26/06/2026",
        "",
        "🔜 Buổi sau: Vòng lặp while",
        "🔁 Kiểm tra lại: Không",
        "",
        "📎 Tutorial:",
        "Tutorial buổi",
        "",
        "— Gia sư Unicorns Edu",
      ].join("\n"),
    );
  });

  it("omits progress details when completed and BTVN for trial students", () => {
    const text = buildSessionCommentZaloText({
      ...baseInput,
      review: { ...review, progressStatus: "completed", hasInClassTest: false },
      students: [{ ...presentStudent, status: "trial" }],
    });

    expect(text).toContain("📅 24/06/2026 | 18:00 - 20:00");
    expect(text).not.toContain("Đã xong");
    expect(text).not.toContain("🧪");
    expect(text).not.toContain("📝");
    expect(text).toContain("👤 Nguyễn Văn A (học thử)");
  });

  it("keeps the legacy format when progress status is missing", () => {
    const text = buildSessionCommentZaloText({ ...baseInput, students: [] });
    expect(text).toContain("— UniEdu");
  });
});

describe("formatHomeworkDueAtLabel", () => {
  it("formats in Vietnam time", () => {
    expect(formatHomeworkDueAtLabel("2026-06-26T17:30:00.000Z")).toBe(
      "00:30 27/06/2026",
    );
  });
});

describe("findSessionReviewFormError", () => {
  const validReview = {
    progressStatus: "completed" as const,
    nextSessionPlan: "Bài 4",
  };

  it("requires done + remaining for partial progress", () => {
    expect(
      findSessionReviewFormError({ ...validReview, progressStatus: "partial" }, []),
    ).toBe("Vui lòng nhập phần «Đã xong».");
  });

  it("checks correct count bounds per student", () => {
    expect(
      findSessionReviewFormError(
        {
          ...validReview,
          hasInClassTest: true,
          inClassTestContent: "Mini test",
          inClassTestTotal: 5,
        },
        [{ fullName: "A", status: "present", testCorrectCount: 6 }],
      ),
    ).toBe("Số câu đúng của A phải trong khoảng 0–5.");
  });

  it("requires a reason for excused students", () => {
    expect(
      findSessionReviewFormError(validReview, [
        { fullName: "A", status: "excused", notes: "  " },
      ]),
    ).toBe("Vui lòng nhập lý do nghỉ phép của A.");
  });

  it("skips review fields for excused students and homework for trial", () => {
    expect(
      findSessionReviewFormError(validReview, [
        { fullName: "A", status: "excused", notes: "Ốm" },
        { fullName: "B", status: "trial", strengths: "x", improvements: "y" },
      ]),
    ).toBeNull();
  });
});

describe("Buổi không điểm danh — bỏ nhận xét từng học sinh", () => {
  const students = [
    { fullName: "Nguyễn Văn A", status: "present" as const, notes: "Tốt" },
    { fullName: "Trần Thị B", status: "absent" as const },
  ];

  it("omits section 3 and (vắng) in the legacy format", () => {
    const text = buildSessionCommentZaloText({
      ...baseInput,
      noAttendance: true,
      students,
    });
    expect(text).not.toContain("3️⃣");
    expect(text).not.toContain("(vắng)");
    expect(text).not.toContain("Nguyễn Văn A");
    expect(text).toContain("4️⃣ Bài tập về nhà");
  });

  it("omits student blocks in the structured format", () => {
    const text = buildSessionCommentZaloText({
      ...baseInput,
      review: { progressStatus: "completed" as const },
      noAttendance: true,
      students,
    });
    expect(text).not.toContain("👤");
    expect(text).not.toContain("(vắng)");
  });

  it("keeps every student for sessions with attendance", () => {
    const text = buildSessionCommentZaloText({ ...baseInput, students });
    expect(text).toContain("3️⃣ Nhận xét từng học sinh");
    expect(text).toContain("Trần Thị B (vắng)");
  });

  it("strips section 3 from legacy notes of a no-attendance session", () => {
    const notes = [
      "📚 Nhận xét buổi học lớp A — 24/06/2026",
      "",
      "2️⃣ Nội dung bài học",
      "Nội dung",
      "",
      "3️⃣ Cụ thể từng học sinh",
      "Nguyễn Văn A (có mặt)",
      "Trần Thị B (vắng)",
      "",
      "4️⃣ Bài tập về nhà",
      "Bài tập",
    ].join("\n");
    expect(stripLegacyStudentCommentsSection(notes)).toBe(
      [
        "📚 Nhận xét buổi học lớp A — 24/06/2026",
        "",
        "2️⃣ Nội dung bài học",
        "Nội dung",
        "",
        "4️⃣ Bài tập về nhà",
        "Bài tập",
      ].join("\n"),
    );
    expect(
      resolveSessionCommentDisplayContent({
        date: "2026-06-24",
        notes,
        snapshotNoAttendance: true,
      }).text,
    ).not.toContain("(vắng)");
    expect(
      resolveSessionCommentDisplayContent({ date: "2026-06-24", notes }).text,
    ).toBe(notes);
  });
});
