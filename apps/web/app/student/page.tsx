"use client";

import UpgradedSelect, { type UpgradedSelectOption } from "@/components/ui/UpgradedSelect";
import type { UpdateMyStudentProfileDto } from "@/dtos/profile.dto";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    StudentBalancePopup,
    StudentDetailRow,
    StudentExamCard,
    StudentInfoCard,
    StudentWalletCard,
    StudentWalletHistoryPopup,
} from "@/components/admin/student";
import ParentReceiptEmailSwitch from "@/components/student/ParentReceiptEmailSwitch";
import { StudentDashboardSkeleton } from "@/components/student/StudentDashboardSkeleton";
import OjProgressSection from "@/components/student/OjProgressSection";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import type {
    StudentGender,
    StudentSelfClassItem,
    StudentSelfDetail,
    StudentStatus,
} from "@/dtos/student.dto";
import {
    getMyStudentSePayStaticQr,
    getMyStudentDetail,
    getMyStudentWalletHistory,
    updateMyStudentProfile,
} from "@/lib/apis/auth.api";
import { formatCurrency } from "@/lib/class.helpers";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<StudentStatus, string> = {
    active: "Đang học",
    inactive: "Ngừng theo dõi",
};

const GENDER_LABELS: Record<StudentGender, string> = {
    male: "Nam",
    female: "Nữ",
};

const GENDER_OPTIONS: UpgradedSelectOption[] = [
    { value: "male", label: "Nam" },
    { value: "female", label: "Nữ" },
];

const STUDENT_PROFILE_FORM_ID = "student-self-profile-form";
const primaryButtonClassName =
    "inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";
const ghostButtonClassName =
    "inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";
const fieldLabelClassName =
    "text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted";
const inputClassName =
    "w-full rounded-xl border border-border-default bg-bg-surface px-3.5 py-3 text-sm text-text-primary shadow-sm transition-colors placeholder:text-text-muted/80 focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-70";
const textareaClassName = `${inputClassName} min-h-28 resize-y`;

type StudentProfileDraft = {
    fullName: string;
    email: string;
    school: string;
    province: string;
    birthYearInput: string;
    parentName: string;
    parentPhone: string;
    parentEmail: string;
    gender: StudentGender;
    goal: string;
};

function formatDate(iso?: string | null): string {
    if (!iso) return "—";
    try {
        return new Intl.DateTimeFormat("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }).format(new Date(iso));
    } catch {
        return "—";
    }
}

function normalizeStatus(status?: StudentStatus): StudentStatus {
    return status === "inactive" ? "inactive" : "active";
}

function normalizeGender(gender?: StudentGender): StudentGender {
    return gender === "female" ? "female" : "male";
}

function statusBadgeClass(status: StudentStatus): string {
    return status === "active"
        ? "bg-success/10 text-success ring-success/20"
        : "bg-error/10 text-error ring-error/20";
}

function getClassStatusLabel(status?: StudentSelfClassItem["class"]["status"]): string {
    if (status === "running") return "Đang mở";
    if (status === "ended") return "Đã kết thúc";
    return "—";
}

function getTuitionSourceLabel(source?: StudentSelfClassItem["tuitionPackageSource"]): string {
    if (source === "custom") return "Mức riêng";
    if (source === "class") return "Theo lớp";
    return "Chưa thiết lập";
}

function getTuitionSourceClass(source?: StudentSelfClassItem["tuitionPackageSource"]): string {
    if (source === "custom") {
        return "bg-primary/10 text-primary ring-primary/20";
    }

    if (source === "class") {
        return "bg-info/10 text-info ring-info/20";
    }

    return "bg-bg-tertiary text-text-secondary ring-border-default";
}

function formatTuitionPerSession(value?: number | null): string {
    return value != null ? formatCurrency(value) : "Chưa thiết lập";
}

function formatTuitionPackage(item: StudentSelfClassItem): string {
    if (
        item.effectiveTuitionPackageTotal != null &&
        item.effectiveTuitionPackageSession != null
    ) {
        return `${formatCurrency(item.effectiveTuitionPackageTotal)} / ${item.effectiveTuitionPackageSession} buổi`;
    }

    if (item.effectiveTuitionPackageTotal != null) {
        return formatCurrency(item.effectiveTuitionPackageTotal);
    }

    if (item.effectiveTuitionPackageSession != null) {
        return `${item.effectiveTuitionPackageSession} buổi`;
    }

    return "Không áp dụng";
}

function normalizeOptionalText(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

function buildStudentProfileDraft(student: StudentSelfDetail): StudentProfileDraft {
    return {
        fullName: student.fullName ?? "",
        email: student.email ?? "",
        school: student.school ?? "",
        province: student.province ?? "",
        birthYearInput: student.birthYear == null ? "" : String(student.birthYear),
        parentName: student.parentName ?? "",
        parentPhone: student.parentPhone ?? "",
        parentEmail: student.parentEmail ?? "",
        gender: normalizeGender(student.gender),
        goal: student.goal ?? "",
    };
}

function buildStudentProfilePayload(draft: StudentProfileDraft): UpdateMyStudentProfileDto {
    const birthYear = draft.birthYearInput.trim();

    return {
        full_name: normalizeOptionalText(draft.fullName),
        email: normalizeOptionalText(draft.email),
        school: normalizeOptionalText(draft.school),
        province: normalizeOptionalText(draft.province),
        birth_year: birthYear ? Number(birthYear) : undefined,
        parent_name: normalizeOptionalText(draft.parentName),
        parent_phone: normalizeOptionalText(draft.parentPhone),
        parent_email: normalizeOptionalText(draft.parentEmail),
        gender: draft.gender,
        goal: normalizeOptionalText(draft.goal),
    };
}

function isStudentProfileDirty(student: StudentSelfDetail, draft: StudentProfileDraft): boolean {
    const payload = buildStudentProfilePayload(draft);

    return (
        payload.full_name !== normalizeOptionalText(student.fullName ?? "") ||
        payload.email !== normalizeOptionalText(student.email ?? "") ||
        payload.school !== normalizeOptionalText(student.school ?? "") ||
        payload.province !== normalizeOptionalText(student.province ?? "") ||
        payload.birth_year !== (student.birthYear ?? undefined) ||
        payload.parent_name !== normalizeOptionalText(student.parentName ?? "") ||
        payload.parent_phone !== normalizeOptionalText(student.parentPhone ?? "") ||
        payload.parent_email !== normalizeOptionalText(student.parentEmail ?? "") ||
        payload.gender !== normalizeGender(student.gender) ||
        payload.goal !== normalizeOptionalText(student.goal ?? "")
    );
}

function EditableField({
    label,
    children,
    className = "",
}: {
    label: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <label className={`flex flex-col gap-2 text-sm text-text-secondary ${className}`}>
            <span className={fieldLabelClassName}>{label}</span>
            {children}
        </label>
    );
}

export default function StudentSelfPage() {
    const queryClient = useQueryClient();
    const [balancePopupMode, setBalancePopupMode] = useState<"topup" | "withdraw" | null>(null);
    const [walletHistoryOpen, setWalletHistoryOpen] = useState(false);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileDraft, setProfileDraft] = useState<StudentProfileDraft>({
        fullName: "",
        email: "",
        school: "",
        province: "",
        birthYearInput: "",
        parentName: "",
        parentPhone: "",
        parentEmail: "",
        gender: "male",
        goal: "",
    });

    const {
        data: student,
        isLoading,
        isFetching: isStudentFetching,
        isError,
        error,
    } = useQuery<StudentSelfDetail>({
        queryKey: ["student", "self", "detail"],
        queryFn: getMyStudentDetail,
        retry: false,
        staleTime: 60_000,
    });

    const receiptEmailMutation = useMutation({
        mutationFn: (enabled: boolean) =>
            updateMyStudentProfile({ parent_receipt_email_enabled: enabled }),
        onMutate: async (enabled) => {
            await queryClient.cancelQueries({ queryKey: ["student", "self", "detail"] });
            const previous = queryClient.getQueryData<StudentSelfDetail>([
                "student",
                "self",
                "detail",
            ]);
            if (previous) {
                queryClient.setQueryData<StudentSelfDetail>(["student", "self", "detail"], {
                    ...previous,
                    parentReceiptEmailEnabled: enabled,
                });
            }
            return { previous };
        },
        onError: (_error, _enabled, context) => {
            if (context?.previous) {
                queryClient.setQueryData(["student", "self", "detail"], context.previous);
            }
            toast.error("Không thể cập nhật cài đặt gửi biên lai.");
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["student", "self", "detail"] }),
                queryClient.invalidateQueries({ queryKey: ["profile", "full"] }),
            ]);
            toast.success("Đã cập nhật cài đặt gửi biên lai.");
        },
    });

    const {
        data: sePayStaticQr,
        isLoading: isSePayStaticQrLoading,
        error: sePayStaticQrError,
    } = useQuery({
        queryKey: ["student", "self", "sepay-static-qr"],
        queryFn: getMyStudentSePayStaticQr,
        enabled: balancePopupMode === "topup" && Boolean(student?.id),
        retry: false,
        staleTime: 5 * 60_000,
    });

    const classItems = useMemo(
        () =>
            (student?.studentClasses ?? []).toSorted((a, b) =>
                (a.class?.name ?? "").localeCompare(b.class?.name ?? "", "vi"),
            ),
        [student],
    );

    if (isLoading) {
        return <StudentDashboardSkeleton />;
    }

    if (isError || !student) {
        const message =
            (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "Không tải được thông tin học sinh hiện tại.";

        return (
            <div className="rounded-[1.75rem] border border-error/30 bg-error/10 px-5 py-6 shadow-sm">
                <p className="text-sm font-medium text-error">{message}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                        href="/"
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                        Về trang chủ
                    </Link>
                    <Link
                        href="/user-profile"
                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                        Xem hồ sơ chung
                    </Link>
                </div>
            </div>
        );
    }

    const normalizedStatus = normalizeStatus(student.status);
    const normalizedGender = normalizeGender(student.gender);
    const primaryChipClass = statusBadgeClass(normalizedStatus);
    const initials = (student.fullName?.trim() || student.email || "?").charAt(0).toUpperCase();
    const contactEmail = student.email?.trim() || "Chưa có email";
    const profileDirty = isStudentProfileDirty(student, profileDraft);
    const isSavingProfile = false;
    const parentReceiptEmailEnabled = student.parentReceiptEmailEnabled !== false;
    const isReceiptTogglePending = receiptEmailMutation.isPending;
    const sePayStaticQrErrorMessage =
        (sePayStaticQrError as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ??
        (sePayStaticQrError ? "Không tải được QR SePay. Vui lòng thử lại sau." : null);

    const handleStartProfileEdit = () => {
        setProfileDraft(buildStudentProfileDraft(student));
        setIsEditingProfile(true);
    };

    const handleCancelProfileEdit = () => {
        setProfileDraft(buildStudentProfileDraft(student));
        setIsEditingProfile(false);
    };

    const handleProfileSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const trimmedName = profileDraft.fullName.trim();
        if (!trimmedName) {
            toast.error("Họ và tên là bắt buộc.");
            return;
        }

        const trimmedBirthYear = profileDraft.birthYearInput.trim();
        if (trimmedBirthYear) {
            const parsedBirthYear = Number(trimmedBirthYear);
            const currentYear = new Date().getFullYear();

            if (
                !Number.isInteger(parsedBirthYear) ||
                parsedBirthYear < 1900 ||
                parsedBirthYear > currentYear
            ) {
                toast.error(`Năm sinh phải nằm trong khoảng 1900-${currentYear}.`);
                return;
            }
        }

        setIsEditingProfile(false);
        runBackgroundSave({
            loadingMessage: "Đang lưu thông tin của bạn...",
            successMessage: "Đã cập nhật thông tin cơ bản của bạn.",
            errorMessage: "Không thể cập nhật thông tin học sinh.",
            action: () => updateMyStudentProfile(buildStudentProfilePayload(profileDraft)),
            onSuccess: async () => {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["profile", "full"] }),
                    queryClient.invalidateQueries({ queryKey: ["student", "self", "detail"] }),
                ]);
            },
        });
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <StudentBalancePopup
                key={`${student.id}-${balancePopupMode ?? "closed"}`}
                open={balancePopupMode !== null}
                mode={balancePopupMode ?? "topup"}
                onClose={() => setBalancePopupMode(null)}
                student={student}
                invalidateQueryKeys={[
                    ["student", "self", "detail"],
                    ["student", "self", "wallet-history"],
                ]}
                allowNegativeBalance={false}
                directBalanceChangeEnabled={false}
                defaultTopUpMethod="sepay"
                successTargetLabel="tài khoản của bạn"
                sePayStaticQr={sePayStaticQr ?? null}
                isSePayStaticQrLoading={isSePayStaticQrLoading}
                sePayStaticQrErrorMessage={sePayStaticQrErrorMessage}
                errorMessages={{
                    topup: "Không thể tạo mã QR nạp ví của bạn.",
                    withdraw: "Không thể rút tiền khỏi tài khoản của bạn.",
                }}
                blockedNegativeBalanceMessage="Số dư hiện tại không đủ để thực hiện giao dịch rút tiền này."
                copyOverrides={{
                    topup: {
                        description:
                            "Quét QR SePay tĩnh và chuyển khoản số tiền cần nạp. Webhook SePay sẽ tự động cập nhật ví sau khi ngân hàng xác nhận.",
                    },
                }}
            />
            <StudentWalletHistoryPopup
                key={`${student.id}-wallet-history-${walletHistoryOpen ? "open" : "closed"}`}
                open={walletHistoryOpen}
                onClose={() => setWalletHistoryOpen(false)}
                studentId={student.id}
                studentName={student.fullName?.trim() || "Tài khoản của bạn"}
                currentBalance={student.accountBalance ?? 0}
                queryKeyBase={["student", "self", "wallet-history"]}
                loadTransactions={({ limit }) => getMyStudentWalletHistory({ limit })}
                emptyDescription="Ví của bạn chưa có giao dịch nào được ghi nhận."
                errorDescription="Hệ thống chưa đọc được lịch sử ví của bạn."
            />

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-border-default bg-bg-surface/90 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-text-muted shadow-sm">
                    <span className="size-2 rounded-full bg-primary" aria-hidden />
                    Hồ sơ học sinh cá nhân
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {isEditingProfile ? (
                        <>
                            <button
                                type="button"
                                onClick={handleCancelProfileEdit}
                                className={ghostButtonClassName}
                            >
                                Hủy
                            </button>
                            <button
                                type="submit"
                                form={STUDENT_PROFILE_FORM_ID}
                                disabled={isSavingProfile || !profileDirty}
                                className={primaryButtonClassName}
                            >
                                Lưu thông tin
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={handleStartProfileEdit}
                            className={primaryButtonClassName}
                        >
                            Chỉnh sửa thông tin
                        </button>
                    )}
                    <Link
                        href="/user-profile"
                        className={ghostButtonClassName}
                    >
                        Mở hồ sơ chung
                    </Link>
                </div>
            </div>

            <QueryRefreshStrip
                active={isStudentFetching}
                label="Đang cập nhật hồ sơ của bạn..."
                className="mb-3"
            />
            <section
                className={cn(
                    "relative overflow-hidden rounded-[1.5rem] border border-border-default bg-bg-surface p-3.5 shadow-sm transition-opacity duration-200 sm:rounded-[1.75rem] sm:p-5",
                    isStudentFetching && "opacity-70",
                )}
            >
                <div className="pointer-events-none absolute -left-16 top-6 size-40 rounded-full bg-primary/10 blur-3xl" aria-hidden />
                <div className="pointer-events-none absolute bottom-0 right-0 size-52 rounded-full bg-info/10 blur-3xl" aria-hidden />

                <div className="relative">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 flex-1 items-start gap-3.5 sm:gap-4">
                            <div className="relative shrink-0">
                                <div className="flex size-14 items-center justify-center rounded-[1.25rem] border border-border-default bg-bg-secondary text-lg font-semibold text-text-primary shadow-sm sm:size-20 sm:rounded-2xl sm:text-3xl">
                                    {initials}
                                </div>
                                <span
                                    className={`absolute -bottom-1 -right-1 block size-3.5 rounded-full border-2 border-bg-surface ${normalizedStatus === "active" ? "bg-success" : "bg-error"
                                        }`}
                                    aria-hidden
                                />
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted">
                                    Thông tin học sinh
                                </p>
                                <div className="mt-2 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <h1 className="min-w-0 text-2xl font-semibold leading-tight text-text-primary sm:truncate">
                                            {student.fullName?.trim() || "Học sinh"}
                                        </h1>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${primaryChipClass}`}>
                                            {STATUS_LABELS[normalizedStatus]}
                                        </span>
                                        <span className="inline-flex rounded-full bg-bg-tertiary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                                            {GENDER_LABELS[normalizedGender]}
                                        </span>

                                    </div>
                                </div>

                                <div className="mt-4 grid gap-2 sm:hidden">
                                    <div className="rounded-2xl border border-border-default bg-bg-primary/80 px-4 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                            Liên hệ chính
                                        </p>
                                        <p className="mt-1 break-all text-sm font-medium text-text-primary">
                                            {contactEmail}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="hidden shrink-0 items-center gap-2 sm:flex xl:flex-col xl:items-stretch">
                            <div className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-sm text-text-secondary">
                                {contactEmail}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3.5 sm:mt-5 sm:gap-4">
                        <div className="grid min-w-0 gap-3.5 md:grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.1fr)] sm:gap-4">
                            {isEditingProfile ? (
                                <form
                                    id={STUDENT_PROFILE_FORM_ID}
                                    onSubmit={handleProfileSubmit}
                                    className="contents"
                                >
                                    <StudentInfoCard title="Thông tin cơ bản" className="border-primary/20">
                                        <div className="space-y-4">


                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <EditableField label="Họ và tên" className="sm:col-span-2">
                                                    <input
                                                        name="full_name"
                                                        autoComplete="name"
                                                        value={profileDraft.fullName}
                                                        onChange={(event) =>
                                                            setProfileDraft((current) => ({
                                                                ...current,
                                                                fullName: event.target.value,
                                                            }))
                                                        }
                                                        className={inputClassName}
                                                        placeholder="Ví dụ: Nguyễn Văn A"
                                                        required
                                                        disabled={isSavingProfile}
                                                    />
                                                </EditableField>

                                                <EditableField label="Email liên hệ">
                                                    <input
                                                        name="email"
                                                        type="email"
                                                        autoComplete="email"
                                                        spellCheck={false}
                                                        value={profileDraft.email}
                                                        onChange={(event) =>
                                                            setProfileDraft((current) => ({
                                                                ...current,
                                                                email: event.target.value,
                                                            }))
                                                        }
                                                        className={inputClassName}
                                                        placeholder="student@example.com"
                                                        disabled={isSavingProfile}
                                                    />
                                                </EditableField>

                                                <EditableField label="Năm sinh">
                                                    <input
                                                        name="birth_year"
                                                        type="number"
                                                        inputMode="numeric"
                                                        min={1900}
                                                        max={new Date().getFullYear()}
                                                        value={profileDraft.birthYearInput}
                                                        onChange={(event) =>
                                                            setProfileDraft((current) => ({
                                                                ...current,
                                                                birthYearInput: event.target.value,
                                                            }))
                                                        }
                                                        className={inputClassName}
                                                        placeholder="2010"
                                                        disabled={isSavingProfile}
                                                    />
                                                </EditableField>

                                                <EditableField label="Trường">
                                                    <input
                                                        name="school"
                                                        autoComplete="organization"
                                                        value={profileDraft.school}
                                                        onChange={(event) =>
                                                            setProfileDraft((current) => ({
                                                                ...current,
                                                                school: event.target.value,
                                                            }))
                                                        }
                                                        className={inputClassName}
                                                        placeholder="THPT ABC"
                                                        disabled={isSavingProfile}
                                                    />
                                                </EditableField>

                                                <EditableField label="Tỉnh / Thành phố">
                                                    <input
                                                        name="province"
                                                        autoComplete="address-level1"
                                                        value={profileDraft.province}
                                                        onChange={(event) =>
                                                            setProfileDraft((current) => ({
                                                                ...current,
                                                                province: event.target.value,
                                                            }))
                                                        }
                                                        className={inputClassName}
                                                        placeholder="Hà Nội"
                                                        disabled={isSavingProfile}
                                                    />
                                                </EditableField>

                                                <EditableField label="Giới tính">
                                                    <UpgradedSelect
                                                        value={profileDraft.gender}
                                                        onValueChange={(nextValue) =>
                                                            setProfileDraft((current) => ({
                                                                ...current,
                                                                gender: nextValue as StudentGender,
                                                            }))
                                                        }
                                                        options={GENDER_OPTIONS}
                                                        disabled={isSavingProfile}
                                                        buttonClassName={inputClassName}
                                                    />
                                                </EditableField>

                                                <EditableField label="Mục tiêu học tập" className="sm:col-span-2">
                                                    <textarea
                                                        name="goal"
                                                        rows={4}
                                                        value={profileDraft.goal}
                                                        onChange={(event) =>
                                                            setProfileDraft((current) => ({
                                                                ...current,
                                                                goal: event.target.value,
                                                            }))
                                                        }
                                                        className={textareaClassName}
                                                        placeholder="Ví dụ: Thủ khoa đầu vào chuyên tin, Giải nhất HSGQG môn Tin"
                                                        disabled={isSavingProfile}
                                                    />
                                                </EditableField>
                                            </div>
                                        </div>
                                    </StudentInfoCard>

                                    <StudentInfoCard title="Liên hệ phụ huynh" className="border-primary/20">
                                        <div className="space-y-4">
                                            <div className="grid gap-3">
                                                <EditableField label="Họ tên phụ huynh">
                                                    <input
                                                        name="parent_name"
                                                        autoComplete="off"
                                                        value={profileDraft.parentName}
                                                        onChange={(event) =>
                                                            setProfileDraft((current) => ({
                                                                ...current,
                                                                parentName: event.target.value,
                                                            }))
                                                        }
                                                        className={inputClassName}
                                                        placeholder="Nguyễn Thị B"
                                                        disabled={isSavingProfile}
                                                    />
                                                </EditableField>

                                                <EditableField label="Số điện thoại phụ huynh">
                                                    <input
                                                        name="parent_phone"
                                                        type="tel"
                                                        autoComplete="tel"
                                                        value={profileDraft.parentPhone}
                                                        onChange={(event) =>
                                                            setProfileDraft((current) => ({
                                                                ...current,
                                                                parentPhone: event.target.value,
                                                            }))
                                                        }
                                                        className={inputClassName}
                                                        placeholder="0912345678"
                                                        disabled={isSavingProfile}
                                                    />
                                                </EditableField>

                                                <EditableField label="Email phụ huynh">
                                                    <input
                                                        name="parent_email"
                                                        type="email"
                                                        autoComplete="email"
                                                        spellCheck={false}
                                                        value={profileDraft.parentEmail}
                                                        onChange={(event) =>
                                                            setProfileDraft((current) => ({
                                                                ...current,
                                                                parentEmail: event.target.value,
                                                            }))
                                                        }
                                                        className={inputClassName}
                                                        placeholder="parent@example.com"
                                                        disabled={isSavingProfile}
                                                    />
                                                </EditableField>
                                            </div>

                                            <ParentReceiptEmailSwitch
                                                enabled={parentReceiptEmailEnabled}
                                                disabled={isReceiptTogglePending}
                                                onToggle={(enabled) => receiptEmailMutation.mutate(enabled)}
                                            />

                                            <div className="rounded-[1.15rem] border border-border-default bg-bg-secondary/60 px-4 py-4">
                                                <p className={fieldLabelClassName}>Trạng thái hồ sơ</p>
                                                <div className="mt-3 flex items-center justify-between gap-3">
                                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${primaryChipClass}`}>
                                                        {STATUS_LABELS[normalizedStatus]}
                                                    </span>
                                                    <span className="text-xs text-text-muted">
                                                        Trung tâm quản lý
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="rounded-[1.15rem] border border-border-default bg-bg-surface px-4 py-4">
                                                <p className={fieldLabelClassName}>Lần cập nhật gần nhất</p>
                                                <p className="mt-2 text-sm font-medium text-text-primary">
                                                    {formatDate(student.updatedAt)}
                                                </p>
                                            </div>
                                        </div>
                                    </StudentInfoCard>
                                </form>
                            ) : (
                                <>
                                    <StudentInfoCard title="Thông tin cơ bản">
                                        <dl className="divide-y divide-border-subtle">
                                            <StudentDetailRow label="Email" value={student.email?.trim() || "—"} />
                                            <StudentDetailRow label="Trường" value={student.school?.trim() || "—"} />
                                            <StudentDetailRow label="Tỉnh / Thành phố" value={student.province?.trim() || "—"} />
                                            <StudentDetailRow label="Năm sinh" value={student.birthYear ?? "—"} />
                                            <StudentDetailRow label="Cập nhật gần nhất" value={formatDate(student.updatedAt)} />
                                            <StudentDetailRow label="Mục tiêu học tập" value={student.goal?.trim() || "—"} />
                                        </dl>
                                    </StudentInfoCard>

                                    <StudentInfoCard title="Liên hệ phụ huynh">
                                        <dl className="divide-y divide-border-subtle">
                                            <StudentDetailRow label="Họ tên" value={student.parentName?.trim() || "—"} />
                                            <StudentDetailRow label="Số điện thoại" value={student.parentPhone?.trim() || "—"} />
                                            <StudentDetailRow
                                                label="Email phụ huynh"
                                                value={student.parentEmail?.trim() || "—"}
                                            />
                                            <StudentDetailRow
                                                label="Trạng thái"
                                                value={
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${primaryChipClass}`}>
                                                        {STATUS_LABELS[normalizedStatus]}
                                                    </span>
                                                }
                                            />
                                        </dl>
                                        <div className="mt-4">
                                            <ParentReceiptEmailSwitch
                                                enabled={parentReceiptEmailEnabled}
                                                disabled={isReceiptTogglePending}
                                                onToggle={(enabled) => receiptEmailMutation.mutate(enabled)}
                                            />
                                        </div>
                                    </StudentInfoCard>
                                </>
                            )}

                            <div className="grid min-w-0 gap-y-3.5 md:col-span-1 md:grid-cols-2 md:gap-4 xl:col-span-1 xl:block xl:space-y-4">
                                <StudentWalletCard
                                    balance={student.accountBalance ?? 0}
                                    onTopUp={() => setBalancePopupMode("topup")}
                                    onOpenHistory={() => setWalletHistoryOpen(true)}
                                />
                                <StudentExamCard
                                    key={student.id}
                                    studentId={student.id}
                                    editable
                                    selfService
                                />
                            </div>
                        </div>

                        <div className="rounded-[1.25rem] border border-border-default bg-bg-secondary/50 p-3.5 sm:rounded-2xl sm:p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted sm:mb-4 sm:text-xs">
                                        Danh sách lớp học
                                    </h2>
                                    <p className="max-w-2xl text-sm text-text-secondary">
                                        Học phí được hiển thị để bạn theo dõi mức đang áp dụng cho từng lớp. Mọi điều chỉnh vẫn do trung tâm xử lý.
                                    </p>
                                </div>
                            </div>

                            {classItems.length > 0 ? (
                                <>
                                    <div className="mt-4 grid gap-3 lg:hidden md:grid-cols-1">
                                        {classItems.map((item) => (
                                            <div
                                                key={item.class.id}
                                                className="rounded-[1.1rem] border border-border-default bg-bg-surface px-3.5 py-3 shadow-sm"
                                            >
                                                <div className="flex min-w-0 flex-col gap-2 min-[380px]:flex-row min-[380px]:items-start">
                                                    <span
                                                        className={`inline-block size-2 shrink-0 rounded-full ${item.class.status === "running"
                                                            ? "bg-success"
                                                            : item.class.status === "ended"
                                                                ? "bg-error"
                                                                : "bg-border-default"
                                                            }`}
                                                        aria-hidden
                                                    />
                                                    <p className="min-w-0 break-words font-medium text-text-primary">{item.class.name}</p>
                                                    <span
                                                        className={`inline-flex w-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ring-1 ${getTuitionSourceClass(item.tuitionPackageSource)}`}
                                                    >
                                                        {getTuitionSourceLabel(item.tuitionPackageSource)}
                                                    </span>
                                                </div>
                                                <div className="mt-3 grid gap-2 text-sm text-text-secondary">
                                                    <div className="flex flex-col gap-1 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between min-[380px]:gap-3">
                                                        <span>Trạng thái lớp</span>
                                                        <span className="font-medium text-text-primary">
                                                            {getClassStatusLabel(item.class.status)}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col gap-1 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between min-[380px]:gap-3">
                                                        <span>Học phí / buổi</span>
                                                        <span className="font-medium tabular-nums text-text-primary">
                                                            {formatTuitionPerSession(item.effectiveTuitionPerSession)}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col gap-1 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between min-[380px]:gap-3">
                                                        <span>Gói học phí</span>
                                                        <span className="break-words font-medium text-text-primary min-[380px]:text-right">
                                                            {formatTuitionPackage(item)}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col gap-1 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between min-[380px]:gap-3">
                                                        <span>Số buổi đã vào học</span>
                                                        <span className="font-medium tabular-nums text-text-primary">
                                                            {item.totalAttendedSession ?? "—"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-4 hidden overflow-x-auto rounded-[1.1rem] border border-border-default bg-bg-surface lg:block">
                                        <div className="min-w-[920px]">
                                            <div className="grid grid-cols-[minmax(0,1.35fr)_150px_180px_230px_150px] gap-3 border-b border-border-default bg-bg-secondary/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                                <span>Lớp học</span>
                                                <span>Trạng thái</span>
                                                <span>Học phí / buổi</span>
                                                <span>Gói học phí</span>
                                                <span className="text-right">Số buổi đã vào học</span>
                                            </div>
                                            <div className="divide-y divide-border-subtle">
                                                {classItems.map((item) => (
                                                    <div
                                                        key={item.class.id}
                                                        className="grid grid-cols-[minmax(0,1.35fr)_150px_180px_230px_150px] gap-3 px-4 py-3 text-sm"
                                                    >
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <span
                                                                className={`inline-block size-2 shrink-0 rounded-full ${item.class.status === "running"
                                                                    ? "bg-success"
                                                                    : item.class.status === "ended"
                                                                        ? "bg-error"
                                                                        : "bg-border-default"
                                                                    }`}
                                                                aria-hidden
                                                            />
                                                            <div className="min-w-0">
                                                                <span className="block truncate font-medium text-text-primary">
                                                                    {item.class.name}
                                                                </span>
                                                                <span
                                                                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ring-1 ${getTuitionSourceClass(item.tuitionPackageSource)}`}
                                                                >
                                                                    {getTuitionSourceLabel(item.tuitionPackageSource)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <span className="text-text-secondary">
                                                            {getClassStatusLabel(item.class.status)}
                                                        </span>
                                                        <span className="font-medium tabular-nums text-text-primary">
                                                            {formatTuitionPerSession(item.effectiveTuitionPerSession)}
                                                        </span>
                                                        <span className="text-text-primary">
                                                            {formatTuitionPackage(item)}
                                                        </span>
                                                        <span className="text-right font-medium tabular-nums text-text-primary">
                                                            {item.totalAttendedSession ?? "—"}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="mt-4 rounded-[1.1rem] border border-border-default bg-bg-surface px-4 py-8 text-center">
                                    <p className="text-sm font-medium text-text-primary">
                                        Hiện chưa có lớp học nào được liên kết với hồ sơ của bạn.
                                    </p>
                                    <p className="mt-1 text-sm text-text-muted">
                                        Khi hệ thống gán lớp, danh sách ở đây sẽ tự cập nhật theo dữ liệu backend.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="grid gap-3 md:grid-cols-1 xl:grid-cols-3">
                            <div className="rounded-[1.15rem] border border-border-default bg-bg-surface px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                    Số dư hiện tại
                                </p>
                                <p className={`mt-2 text-lg font-semibold tabular-nums ${(student.accountBalance ?? 0) < 0 ? "text-error" : "text-text-primary"}`}>
                                    {formatCurrency(student.accountBalance ?? 0)}
                                </p>
                            </div>
                            <div className="rounded-[1.15rem] border border-border-default bg-bg-surface px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                    Lớp đang liên kết
                                </p>
                                <p className="mt-2 text-lg font-semibold text-text-primary">
                                    {classItems.length}
                                </p>
                            </div>
                            <div className="rounded-[1.15rem] border border-border-default bg-bg-surface px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                    Cập nhật hồ sơ
                                </p>
                                <p className="mt-2 text-sm font-medium text-text-primary">
                                    {formatDate(student.updatedAt)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <OjProgressSection studentName={student.fullName ?? ""} />
        </div>
    );
}
