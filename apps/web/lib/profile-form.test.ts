import { describe, expect, it } from "vitest";
import type { FullProfileDto } from "@/dtos/profile.dto";
import {
  ACHIEVEMENTS_FIELD_KEY,
  AVATAR_FIELD_KEY,
  DATA_CONSENT_FIELD_KEY,
  buildProfilePatches,
  getProfileFormValues,
  isProfileFormDirty,
  rebaseProfileFormValues,
  isProfileBackBlockedByGate,
  resolveProfileBackHref,
  toDateInputValue,
  validateBirthYear,
  validateProfileForm,
} from "./profile-form";

const completeStaff = {
  cccdNumber: "012345678901",
  ethnicity: "Kinh",
  gender: "male",
  currentAddress: "1 Lê Lợi",
  cccdIssuedDate: "2020-01-02T00:00:00.000Z",
  cccdIssuedPlace: "Cục CS",
  birthDate: "2000-05-17T00:00:00.000Z",
  university: "BK",
  highSchool: "LHP",
  bankAccount: "123",
  bankQrLink: "https://qr.example/x",
};

function makeProfile(overrides: Record<string, unknown> = {}): FullProfileDto {
  return {
    first_name: "An",
    last_name: "Nguyễn",
    email: "an@example.com",
    phone: "0901234567",
    accountHandle: "an",
    province: "HCM",
    avatarUrl: "https://cdn/a.png",
    dataConsentAcceptedAt: "2026-01-01T00:00:00.000Z",
    requiresStaffDataConsent: false,
    staffInfo: null,
    studentInfo: null,
    ...overrides,
  } as unknown as FullProfileDto;
}

describe("validateProfileForm", () => {
  it("không báo thiếu với hồ sơ không phải nhân sự", () => {
    const profile = makeProfile({ phone: null, province: null, avatarUrl: null });
    const result = validateProfileForm(profile, getProfileFormValues(profile));
    expect(result.missingCount).toBe(0);
    expect(result.hasBlockingError).toBe(false);
  });

  it("báo thiếu trường gate nhân sự, avatar và điều khoản theo thứ tự trang", () => {
    const profile = makeProfile({
      avatarUrl: null,
      phone: null,
      dataConsentAcceptedAt: null,
      staffInfo: { ...completeStaff, bankAccount: null },
    });
    const result = validateProfileForm(profile, getProfileFormValues(profile));
    expect(result.orderedKeys).toEqual([
      AVATAR_FIELD_KEY,
      "account.phone",
      "staff.bank_account",
      DATA_CONSENT_FIELD_KEY,
    ]);
    expect(result.missingCount).toBe(4);
    expect(result.hasBlockingError).toBe(false);
  });

  it("gia sư có thành tích nhưng chưa tích sao thì báo thiếu thành tích nổi bật", () => {
    const teacher = makeProfile({
      staffInfo: {
        ...completeStaff,
        roles: ["teacher"],
        achievementCount: 3,
        hasHighlightAchievement: false,
      },
    });
    const result = validateProfileForm(teacher, getProfileFormValues(teacher));
    expect(result.orderedKeys).toEqual([ACHIEVEMENTS_FIELD_KEY]);
    expect(result.errors[ACHIEVEMENTS_FIELD_KEY]?.message).toContain("ngôi sao");
  });

  it("gia sư đã tích sao nhưng dòng sao chưa có ảnh thì báo thiếu minh chứng", () => {
    const teacher = makeProfile({
      staffInfo: {
        ...completeStaff,
        roles: ["teacher"],
        achievementCount: 1,
        hasHighlightAchievement: true,
        hasHighlightAchievementProof: false,
      },
    });
    const result = validateProfileForm(teacher, getProfileFormValues(teacher));
    expect(result.orderedKeys).toEqual([ACHIEVEMENTS_FIELD_KEY]);
    expect(result.errors[ACHIEVEMENTS_FIELD_KEY]?.message).toContain(
      "minh chứng",
    );
    expect(result.hasBlockingError).toBe(false);
  });

  it("gia sư chưa có thành tích thì báo thiếu, role khác không bị yêu cầu", () => {
    const teacher = makeProfile({
      staffInfo: { ...completeStaff, roles: ["teacher"], achievementCount: 0 },
    });
    const teacherResult = validateProfileForm(
      teacher,
      getProfileFormValues(teacher),
    );
    expect(teacherResult.orderedKeys).toEqual([ACHIEVEMENTS_FIELD_KEY]);
    expect(teacherResult.missingCount).toBe(1);
    expect(teacherResult.hasBlockingError).toBe(false);

    for (const staffInfo of [
      {
        ...completeStaff,
        roles: ["teacher"],
        achievementCount: 1,
        hasHighlightAchievement: true,
      },
      { ...completeStaff, roles: ["accountant_income"], achievementCount: 0 },
    ]) {
      const profile = makeProfile({ staffInfo });
      expect(
        validateProfileForm(profile, getProfileFormValues(profile)).missingCount,
      ).toBe(0);
    }
  });

  it("lỗi định dạng và xoá ô không được để trống thì chặn lưu", () => {
    const profile = makeProfile({ staffInfo: completeStaff });
    const values = {
      ...getProfileFormValues(profile),
      "staff.cccd_number": "123",
      "account.accountHandle": " ",
    };
    const result = validateProfileForm(profile, values);
    expect(result.errors["staff.cccd_number"]?.kind).toBe("invalid");
    expect(result.errors["account.accountHandle"]?.kind).toBe("invalid");
    expect(result.hasBlockingError).toBe(true);
  });

  it("trường bắt buộc bị xoá là thiếu, không chặn lưu", () => {
    const profile = makeProfile({ staffInfo: completeStaff });
    const values = { ...getProfileFormValues(profile), "account.first_name": "" };
    const result = validateProfileForm(profile, values);
    expect(result.errors["account.first_name"]?.kind).toBe("missing");
    expect(result.hasBlockingError).toBe(false);
  });
});

describe("buildProfilePatches", () => {
  it("chỉ gửi trường đã đổi, theo nhóm", () => {
    const profile = makeProfile({
      staffInfo: completeStaff,
      studentInfo: { fullName: "An", email: "an@example.com", birthYear: 2008, parentEmail: "p@x.vn" },
    });
    const saved = getProfileFormValues(profile);
    const patches = buildProfilePatches(profile, saved, {
      ...saved,
      "account.phone": " 0909 ",
      "staff.university": "",
      "student.birth_year": "2009",
      "student.parent_email": "",
    });
    expect(patches).toEqual({
      account: { phone: "0909" },
      staff: { university: "" },
      student: { birth_year: 2009, parent_email: null },
    });
  });

  it("không gửi ô `keep` để trống và bỏ nhóm không đổi", () => {
    const profile = makeProfile();
    const saved = getProfileFormValues(profile);
    expect(
      buildProfilePatches(profile, saved, { ...saved, "account.first_name": "" }),
    ).toEqual({});
  });
});

describe("dirty / rebase", () => {
  it("bỏ qua khoảng trắng khi so dirty", () => {
    const saved = { a: "x", b: "" };
    expect(isProfileFormDirty(saved, { a: " x ", b: "" })).toBe(false);
    expect(isProfileFormDirty(saved, { a: "y", b: "" })).toBe(true);
  });

  it("ô chưa sửa nhận giá trị mới, ô đang sửa giữ nguyên", () => {
    expect(
      rebaseProfileFormValues(
        { a: "old", b: "editing" },
        { a: "old", b: "saved-b" },
        { a: "new", b: "server-b" },
      ),
    ).toEqual({ a: "new", b: "editing" });
  });
});

describe("resolveProfileBackHref", () => {
  it("nhận path nội bộ, chặn URL ngoài và vòng lặp về trang hồ sơ", () => {
    expect(resolveProfileBackHref("/staff/classes", "/staff")).toBe("/staff/classes");
    for (const from of [null, "", "https://evil.com", "//evil.com", "/\\evil.com", "/user-profile"]) {
      expect(resolveProfileBackHref(from, "/staff")).toBe("/staff");
    }
  });
});

describe("isProfileBackBlockedByGate", () => {
  const staff = (profileComplete: boolean, tier: string | null = null) =>
    ({
      id: "u1",
      accountHandle: "u1",
      roleType: "staff",
      hasStaffProfile: true,
      access: {
        admin: { canAccess: tier !== null, tier },
        staff: { canAccess: true, profileComplete },
        student: { canAccess: false },
      },
    }) as unknown as Parameters<typeof isProfileBackBlockedByGate>[0];

  it("chặn về staff/admin shell khi session báo hồ sơ chưa đủ", () => {
    expect(isProfileBackBlockedByGate(staff(false), "/staff")).toBe(true);
    expect(isProfileBackBlockedByGate(staff(false), "/admin/dashboard")).toBe(true);
  });

  it("không chặn khi hồ sơ đủ, admin full, hoặc đích ngoài shell nhân sự", () => {
    expect(isProfileBackBlockedByGate(staff(true), "/staff")).toBe(false);
    expect(isProfileBackBlockedByGate(staff(false, "full"), "/admin")).toBe(false);
    expect(isProfileBackBlockedByGate(staff(false), "/student")).toBe(false);
    expect(isProfileBackBlockedByGate(staff(false), "/staffing")).toBe(false);
  });
});

describe("toDateInputValue", () => {
  it("định dạng ISO cho ô ngày, rỗng nếu không hợp lệ", () => {
    expect(toDateInputValue("2000-05-17T00:00:00.000Z")).toBe("2000-05-17");
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue("not-a-date")).toBe("");
  });
});

describe("validateBirthYear", () => {
  it("nhận năm nguyên trong khoảng, từ chối còn lại", () => {
    expect(validateBirthYear("1900", 2026)).toBeNull();
    expect(validateBirthYear("2026", 2026)).toBeNull();
    for (const raw of ["1899", "2027", "2008.5", "abc"]) {
      expect(validateBirthYear(raw, 2026)).toBe(
        "Năm sinh phải là số nguyên từ 1900 đến 2026.",
      );
    }
  });
});
