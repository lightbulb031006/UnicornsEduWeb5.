import { describe, expect, it } from "vitest";
import type { AttemptQuestionDto } from "@/dtos/attempt.dto";
import type { PracticeStatsStudentRowDto } from "@/dtos/practice-stats.dto";
import {
  matchesResultsFilter,
  nextPendingStudent,
  outcomeCounts,
  rowScoreLabel,
} from "./practice-results";
import { parseScoreInput, scoreInputValue } from "./attempt-score";

function row(over: Partial<PracticeStatsStudentRowDto>): PracticeStatsStudentRowDto {
  return {
    studentId: "s",
    studentName: "An",
    score: null,
    scoreMax: null,
    scoredAttemptNo: null,
    latestAttemptNo: null,
    attemptCount: 0,
    durationMs: null,
    status: "not_started",
    ...over,
  };
}

function question(over: Partial<AttemptQuestionDto>): AttemptQuestionDto {
  return {
    questionId: "q",
    order: 0,
    pointsPossible: 10,
    type: "single_choice",
    slot: "required",
    content: "",
    options: ["a", "b"],
    essayInputSize: null,
    tfLabelStyle: null,
    choiceIndex: null,
    tfChoices: null,
    blankCount: null,
    blankAnswers: null,
    orderAnswer: null,
    sharedMaterial: null,
    audio: null,
    essayAnswer: null,
    markedForReview: false,
    ...over,
  };
}

describe("rowScoreLabel", () => {
  it("chờ chấm: điểm lượt đã chấm trước + lượt đang chờ", () => {
    expect(
      rowScoreLabel(
        row({
          score: 80,
          scoreMax: 100,
          scoredAttemptNo: 2,
          latestAttemptNo: 3,
          attemptCount: 3,
          status: "pending_essay",
        }),
        "equal_100",
        100,
      ),
    ).toBe("80/100 · lượt 3 chờ chấm");
  });

  it("một lượt đã chấm: không ghi số lượt", () => {
    expect(
      rowScoreLabel(
        row({ score: 875, scoreMax: 1000, scoredAttemptNo: 1, attemptCount: 1, status: "graded" }),
        "absolute_it",
        1000,
      ),
    ).toBe("8,75/10,00");
  });

  it("lượt đầu chờ chấm, chưa có điểm", () => {
    expect(
      rowScoreLabel(
        row({ latestAttemptNo: 1, attemptCount: 1, status: "pending_essay" }),
        "equal_100",
        100,
      ),
    ).toBe("— · lượt 1 chờ chấm");
  });
});

describe("matchesResultsFilter", () => {
  it("đang làm lượt đầu thuộc Chưa làm; đang làm lại mà có điểm thuộc Đã chấm", () => {
    const first = row({ status: "in_progress" });
    const retry = row({ status: "in_progress", score: 50, attemptCount: 1 });
    expect(matchesResultsFilter(first, "chua-lam")).toBe(true);
    expect(matchesResultsFilter(retry, "da-cham")).toBe(true);
    expect(matchesResultsFilter(retry, "cho-cham")).toBe(false);
  });
});

describe("nextPendingStudent", () => {
  const rows = [
    row({ studentId: "a", status: "pending_essay" }),
    row({ studentId: "b", status: "graded" }),
    row({ studentId: "c", status: "pending_essay" }),
  ];
  it("lấy học sinh chờ chấm sau học sinh hiện tại, vòng lại đầu", () => {
    expect(nextPendingStudent(rows, "a")?.studentId).toBe("c");
    expect(nextPendingStudent(rows, "c")?.studentId).toBe("a");
  });
  it("chỉ còn chính học sinh hiện tại → null", () => {
    expect(nextPendingStudent(rows.slice(0, 2), "a")).toBeNull();
  });
});

describe("outcomeCounts", () => {
  it("tách đúng / sai / bỏ trống / chờ chấm; nhóm tự chọn không làm không tính bỏ trống", () => {
    const counts = outcomeCounts([
      question({ isCorrect: true, choiceIndex: 0 }),
      question({ isCorrect: false, choiceIndex: 1 }),
      question({ isCorrect: false }),
      question({ type: "essay", pointsAwarded: null, essayAnswer: "x" }),
      question({ type: "essay", pointsAwarded: 4 }),
      question({
        type: "true_false_group",
        slot: "elective_1",
        tfChoices: [true, null, null, null],
        isCorrect: false,
      }),
      question({ type: "true_false_group", slot: "elective_1", tfChoices: [], isCorrect: false }),
      question({ type: "true_false_group", slot: "elective_2", tfChoices: [], isCorrect: false }),
    ]);
    expect(counts).toEqual({
      correct: 1,
      partial: 1,
      wrong: 2,
      pending: 1,
      blank: 2,
      not_chosen: 1,
    });
  });
});

describe("parseScoreInput", () => {
  it("IT: nhận dấu phẩy, tối đa 2 chữ số thập phân", () => {
    expect(parseScoreInput("0,25", "absolute_it")).toBe(25);
    expect(parseScoreInput("1.5", "absolute_it")).toBe(150);
    expect(parseScoreInput("0,125", "absolute_it")).toBeNull();
    expect(scoreInputValue(25, "absolute_it")).toBe("0,25");
  });
  it("JP/ENG: chỉ số nguyên", () => {
    expect(parseScoreInput("7", "equal_100")).toBe(7);
    expect(parseScoreInput("7,5", "equal_100")).toBeNull();
    expect(parseScoreInput("-1", "equal_100")).toBeNull();
    expect(parseScoreInput("", "equal_100")).toBeNull();
  });
});
