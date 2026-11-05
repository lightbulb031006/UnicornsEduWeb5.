import { describe, expect, it } from "vitest";
import type { QuestionSlotDto } from "@/dtos/attempt.dto";
import {
  buildExamLayout,
  isElectiveConflict,
  itExamBreakdown,
  itExamPart,
  orderExamQuestions,
  materialHeaders,
} from "./exam-layout";

type Q = {
  type: "single_choice" | "true_false_group" | "essay";
  slot: QuestionSlotDto;
};
const sc: Q = { type: "single_choice", slot: "required" };
const tf = (slot: QuestionSlotDto = "required"): Q => ({
  type: "true_false_group",
  slot,
});

describe("buildExamLayout", () => {
  it("đề chuẩn 24 + 2 + 2 + 2: Phần II đánh số lại, hai nhóm tự chọn cùng dải số", () => {
    const qs = [
      ...Array.from({ length: 24 }, () => sc),
      tf(),
      tf(),
      tf("elective_1"),
      tf("elective_1"),
      tf("elective_2"),
      tf("elective_2"),
    ];
    const layout = buildExamLayout(qs, "absolute_it", {
      elective_1: "Khoa học máy tính",
      elective_2: null,
    });
    expect(layout[0].partHeader).toBe("PHẦN I");
    expect(layout[23].number).toBe(24);
    expect(layout[24]).toMatchObject({ partHeader: "PHẦN II", number: 1, shortLabel: "II.1" });
    expect(layout.slice(24).map((v) => v.number)).toEqual([1, 2, 3, 4, 3, 4]);
    expect(layout[26].groupHeader).toBe("Tự chọn 1 — Khoa học máy tính");
    expect(layout[27].groupHeader).toBeNull();
    expect(layout[28]).toMatchObject({ groupHeader: "Tự chọn 2", shortLabel: "TC2·3" });
    expect(new Set(layout.map((v) => v.shortLabel)).size).toBe(30);
  });

  it("đề chỉ trắc nghiệm: không tiêu đề phần", () => {
    const layout = buildExamLayout([sc, sc], "absolute_it");
    expect(layout.map((v) => v.partHeader)).toEqual([null, null]);
  });

  it("equal_100: đánh số liên tục", () => {
    const layout = buildExamLayout([sc, tf()], "equal_100");
    expect(layout.map((v) => v.shortLabel)).toEqual(["1", "2"]);
  });
});

describe("isElectiveConflict", () => {
  it("chỉ true khi cả hai nhóm đều có lựa chọn", () => {
    expect(
      isElectiveConflict([
        { slot: "elective_1", tfChoices: [true, null, null, null] },
        { slot: "elective_2", tfChoices: [null, null, null, null] },
      ]),
    ).toBe(false);
    expect(
      isElectiveConflict([
        { slot: "elective_1", tfChoices: [true, null, null, null] },
        { slot: "elective_2", tfChoices: [null, false, null, null] },
      ]),
    ).toBe(true);
  });
});

describe("orderExamQuestions", () => {
  it("đưa trắc nghiệm lên trước, Đúng/Sai theo bắt buộc → TC1 → TC2, giữ thứ tự gốc", () => {
    const input = [
      { id: "tf-e2", type: "true_false_group", slot: "elective_2" },
      { id: "tf-r1", type: "true_false_group", slot: "required" },
      { id: "sc-1", type: "single_choice", slot: "required" },
      { id: "tf-e1", type: "true_false_group", slot: "elective_1" },
      { id: "sc-2", type: "single_choice", slot: "required" },
      { id: "tf-r2", type: "true_false_group", slot: "required" },
    ] as const;
    expect(orderExamQuestions([...input]).map((q) => q.id)).toEqual([
      "sc-1",
      "sc-2",
      "tf-r1",
      "tf-r2",
      "tf-e1",
      "tf-e2",
    ]);
  });
});

describe("itExamBreakdown", () => {
  it("đề 0525 đủ form: 24 trắc nghiệm + 2 bắt buộc + 2 câu mỗi nhóm = 10 điểm", () => {
    const qs = [
      ...Array.from({ length: 24 }, () => ({ type: "single_choice", slot: "required" }) as const),
      ...Array.from({ length: 2 }, () => ({ type: "true_false_group", slot: "required" }) as const),
      ...Array.from({ length: 2 }, () => ({ type: "true_false_group", slot: "elective_1" }) as const),
      ...Array.from({ length: 2 }, () => ({ type: "true_false_group", slot: "elective_2" }) as const),
    ];
    expect(itExamBreakdown(qs)).toEqual({
      part1: 24,
      required2: 2,
      elective1: 2,
      elective2: 2,
      maxPoints: 1000,
    });
  });

  it("không có nhóm tự chọn thì cộng đủ mọi câu", () => {
    const qs = [
      ...Array.from({ length: 15 }, () => ({ type: "single_choice", slot: "required" }) as const),
      ...Array.from({ length: 6 }, () => ({ type: "true_false_group", slot: "required" }) as const),
    ];
    expect(itExamBreakdown(qs).maxPoints).toBe(975);
  });
});

describe("materialHeaders — Tư liệu dùng chung", () => {
  const R = { id: "r", content: "<p>読解</p>" };
  const L = { id: "l", content: "<p>聴解</p>" };
  const of = (m: typeof R | null) => ({ sharedMaterial: m });

  it("hiện tư liệu một lần trước câu đầu khối, kèm dải số câu", () => {
    const headers = materialHeaders(
      [of(null), of(R), of(R), of(R), of(null), of(L), of(L)],
      (q) => q.sharedMaterial,
    );
    expect(headers).toEqual([
      null,
      { content: "<p>読解</p>", firstNumber: 2, lastNumber: 4 },
      null,
      null,
      null,
      { content: "<p>聴解</p>", firstNumber: 6, lastNumber: 7 },
      null,
    ]);
  });

  it("tư liệu chỉ một câu vẫn hiện", () => {
    expect(materialHeaders([of(R)], (q) => q.sharedMaterial)).toEqual([
      { content: "<p>読解</p>", firstNumber: 1, lastNumber: 1 },
    ]);
  });
});

describe("itExamPart", () => {
  it("nhóm Đúng/Sai vào Phần II, trắc nghiệm vào Phần I", () => {
    expect(itExamPart("true_false_group")).toBe("II");
    expect(itExamPart("single_choice")).toBe("I");
  });

  it("loại câu ngoài hồ sơ IT giữ ở Phần I như trước", () => {
    for (const type of ["essay", "true_false", "fill_blank", "ordering"] as const) {
      expect(itExamPart(type)).toBe("I");
    }
  });
});
