import { describe, expect, it } from "vitest";
import type { FullProfileDto } from "@/dtos/profile.dto";
import { getProfileCompletion } from "./user-profile-completion";

const baseProfile = {
  id: "user-1",
  email: "a@example.com",
  first_name: "An",
  last_name: "Nguyễn",
  phone: null,
  province: null,
  accountHandle: "an",
  avatarUrl: null,
  roleType: "guest",
} as unknown as FullProfileDto;

describe("getProfileCompletion", () => {
  it("counts only account fields when there is no staff or student record", () => {
    const result = getProfileCompletion(baseProfile);

    expect(result.account).toEqual({ filled: 4, total: 7, percentage: 57 });
    expect(result.staff).toBeNull();
    expect(result.student).toBeNull();
    expect(result.dataConsent).toBeNull();
    expect(result.overall).toEqual(result.account);
    expect(result.staffDataConsentComplete).toBe(true);
  });

  it("requires accepted data consent for staff", () => {
    const result = getProfileCompletion({
      ...baseProfile,
      staffInfo: { id: "staff-1" },
      dataConsentAcceptedAt: null,
    } as unknown as FullProfileDto);

    expect(result.staffDataConsentComplete).toBe(false);
    expect(result.dataConsent).toEqual({ filled: 0, total: 1, percentage: 0 });
    expect(result.staff?.total).toBe(13);
    expect(result.overall.total).toBe(20);
  });

  it("adds the student block to the overall total", () => {
    const result = getProfileCompletion({
      ...baseProfile,
      studentInfo: { id: "student-1", fullName: "Bình", goal: "IELTS 7.5" },
    } as unknown as FullProfileDto);

    expect(result.student).toEqual({ filled: 2, total: 11, percentage: 18 });
    expect(result.overall).toEqual({ filled: 6, total: 18, percentage: 33 });
  });
});
