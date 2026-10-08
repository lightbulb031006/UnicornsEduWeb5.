import type { FullProfileDto } from "@/dtos/profile.dto";
import { resolveCanonicalUserName } from "@/dtos/user-name.dto";

export type CompletionStats = {
  filled: number;
  total: number;
  percentage: number;
};

export type ProfileCompletion = {
  account: CompletionStats;
  staff: CompletionStats | null;
  dataConsent: CompletionStats | null;
  student: CompletionStats | null;
  overall: CompletionStats;
  staffDataConsentComplete: boolean;
};

export function getProfileDisplayName(profile: FullProfileDto): string {
  return (
    resolveCanonicalUserName(profile, profile.staffInfo?.fullName) ||
    profile.accountHandle ||
    profile.email ||
    "—"
  );
}

function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

export function getCompletionStats(values: Array<unknown>): CompletionStats {
  const total = values.length;
  const filled = values.filter(isFilled).length;
  return {
    filled,
    total,
    percentage: total ? Math.round((filled / total) * 100) : 0,
  };
}

/** Độ hoàn thiện từng mục và tổng hồ sơ; mục không áp dụng trả `null`. */
export function getProfileCompletion(
  profile: FullProfileDto,
): ProfileCompletion {
  const storedAvatarPath =
    (profile as FullProfileDto & { avatarPath?: string | null }).avatarPath ??
    null;
  const staffDataConsentComplete =
    !profile.staffInfo ||
    Boolean(
      profile.dataConsentAcceptedAt &&
      profile.requiresStaffDataConsent !== true,
    );

  const accountValues: Array<unknown> = [
    storedAvatarPath ?? profile.avatarUrl,
    profile.first_name,
    profile.last_name,
    profile.email,
    profile.phone,
    profile.accountHandle,
    profile.province,
  ];
  const staffValues: Array<unknown> | null = profile.staffInfo
    ? [
        getProfileDisplayName(profile),
        profile.staffInfo.birthDate,
        profile.staffInfo.university,
        profile.staffInfo.highSchool,
        profile.staffInfo.bankAccount,
        profile.staffInfo.bankQrLink,
        profile.staffInfo.cccdNumber,
        profile.staffInfo.ethnicity,
        profile.staffInfo.gender,
        profile.staffInfo.currentAddress,
        profile.staffInfo.cccdIssuedDate,
        profile.staffInfo.cccdIssuedPlace,
        staffDataConsentComplete,
      ]
    : null;
  const studentValues: Array<unknown> | null = profile.studentInfo
    ? [
        profile.studentInfo.fullName,
        profile.studentInfo.email,
        profile.studentInfo.school,
        profile.studentInfo.province,
        profile.studentInfo.birthYear,
        profile.studentInfo.parentName,
        profile.studentInfo.parentPhone,
        profile.studentInfo.parentEmail,
        profile.studentInfo.gender,
        profile.studentInfo.goal,
        profile.studentInfo.status,
      ]
    : null;

  return {
    account: getCompletionStats(accountValues),
    staff: staffValues ? getCompletionStats(staffValues) : null,
    dataConsent: profile.staffInfo
      ? getCompletionStats([staffDataConsentComplete])
      : null,
    student: studentValues ? getCompletionStats(studentValues) : null,
    overall: getCompletionStats([
      ...accountValues,
      ...(staffValues ?? []),
      ...(studentValues ?? []),
    ]),
    staffDataConsentComplete,
  };
}
