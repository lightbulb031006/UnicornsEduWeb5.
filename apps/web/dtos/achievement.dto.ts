export type AchievementLevel =
  | "HSG_QUOC_GIA"
  | "DUYEN_HAI"
  | "TRAI_HE_HUNG_VUONG"
  | "HSG_TINH_THANH_PHO"
  | "DO_CHUYEN_TIN"
  | "TIN_HOC_TRE"
  | "KHAC";

export const ACHIEVEMENT_LEVEL_OPTIONS: Array<{
  value: AchievementLevel;
  label: string;
}> = [
  { value: "HSG_QUOC_GIA", label: "HSG Quốc gia" },
  { value: "DUYEN_HAI", label: "Duyên hải ĐB Bắc Bộ" },
  { value: "TRAI_HE_HUNG_VUONG", label: "Trại hè Hùng Vương" },
  { value: "HSG_TINH_THANH_PHO", label: "HSG Tỉnh-Thành phố" },
  { value: "DO_CHUYEN_TIN", label: "Đỗ Chuyên Tin" },
  { value: "TIN_HOC_TRE", label: "Tin học trẻ" },
  { value: "KHAC", label: "Khác" },
];

export type AchievementDto = {
  id: string;
  /** Staff freeform title; student derived `${award} · ${exam}`. */
  title: string;
  award?: string | null;
  exam?: string | null;
  year?: number | null;
  level?: AchievementLevel | null;
  courseLabel?: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateStaffAchievementPayload = {
  title: string;
  sortOrder?: number;
};

export type UpdateStaffAchievementPayload = {
  title?: string;
  sortOrder?: number;
};

export type CreateStudentAchievementPayload = {
  award: string;
  exam: string;
  year: number;
  level: AchievementLevel;
  courseLabel?: string | null;
  sortOrder?: number;
};

export type UpdateStudentAchievementPayload = Partial<CreateStudentAchievementPayload>;

/** @deprecated Use CreateStaffAchievementPayload / CreateStudentAchievementPayload */
export type CreateAchievementPayload = CreateStaffAchievementPayload;

/** @deprecated Use UpdateStaffAchievementPayload / UpdateStudentAchievementPayload */
export type UpdateAchievementPayload = UpdateStaffAchievementPayload;

export type ReorderAchievementsPayload = {
  orderedIds: string[];
};

export type AchievementOwnerRef =
  | { kind: "staff"; mode: "admin"; staffId: string }
  | { kind: "staff"; mode: "self" }
  | { kind: "student"; mode: "admin"; studentId: string };
