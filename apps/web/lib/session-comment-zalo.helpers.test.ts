import { describe, expect, it } from "vitest";
import {
  attendanceStatusTemplateLabel,
  buildSessionCommentZaloText,
  formatStudentCommentBlock,
  resolveStudentCommentLines,
  richTextToPlainTextPreservingStructure,
} from "./session-comment-zalo.helpers";

const baseInput = {
  className: "Lớp A",
  date: "2026-06-24",
  startTime: "18:00",
  endTime: "20:00",
  lessonContent: "<p>Nội dung bài học</p>",
  homework: "<p>Bài tập</p>",
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
  });
});
