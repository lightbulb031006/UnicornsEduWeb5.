"use client";

import { useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    EditStudentClassesPopup,
    EditStudentPopup,
    StudentBalancePopup,
    StudentDetailRow,
    StudentInfoCard,
    STUDENT_DETAIL_BASIC_INFO_OPEN_KEY,
    STUDENT_DETAIL_PARENT_CONTACT_OPEN_KEY,
    StudentExamCard,
    StudentWalletHistoryPopup,
    StudentWalletCard,
    StudentClassTuitionPopup,
    StudentDevicePopup,
} from "@/components/admin/student";
import { UserLinkedProfileLinks } from "@/components/admin/user";
import ParentReceiptEmailSwitch from "@/components/student/ParentReceiptEmailSwitch";
import OjProgressSection from "@/components/student/OjProgressSection";
import AchievementListEditor from "@/components/shared/achievement/AchievementListEditor";
import StudentGalleryEditor from "@/components/shared/student-gallery/StudentGalleryEditor";
import PreviewableUserAvatar from "@/components/ui/PreviewableUserAvatar";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import { STUDENT_CUSTOMER_SOURCE_LABELS, type StudentDetail, type StudentGender, type StudentStatus } from "@/dtos/student.dto";
import { StudentLevelBadge } from "@/components/ui/LevelBadge";
import {
    buildAdminLikePath,
    resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import { resolveStudentAdminCapabilities, resolveUserAdminCapabilities } from "@/lib/admin-shell-access";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as studentApi from "@/lib/apis/student.api";
import { pickAvatarUrl } from "@/lib/avatar";
import { formatCurrency } from "@/lib/class.helpers";
import { cn } from "@/lib/utils";
import { forceLogoutStudent } from "@/lib/apis/auth.api";
import { formatVnDate } from "@/lib/formatters";

const STATUS_LABELS: Record<StudentStatus, string> = {
    active: "Đang học",
    inactive: "Nghỉ học",
};

const GENDER_LABELS: Record<StudentGender, string> = {
    male: "Nam",
    female: "Nữ",
};

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
        return formatVnDate(new Date(iso));
    } catch {
        return "—";
  }
}

function formatCustomerCareProfitPercent(value?: number | null): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return `${Math.round(value * 100)}%`;
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

function formatTuitionPackageLabel(params: {
    packageTotal?: number | null;
    packageSession?: number | null;
    studentTuitionPerSession?: number | null;
}) {
    const { packageTotal, packageSession, studentTuitionPerSession } = params;

    if (packageTotal != null || packageSession != null) {
        return `${formatCurrency(packageTotal)} / ${packageSession ?? "—"} buổi`;
    }

    if (studentTuitionPerSession != null) {
        return `${formatCurrency(studentTuitionPerSession)} / buổi`;
    }

    return "Chưa cấu hình";
}

function getTuitionPackageSourceLabel(source?: "custom" | "class" | "unset") {
    if (source === "custom") return "Gói riêng";
    if (source === "class") return "Theo lớp";
    return null;
}

export default function AdminStudentDetailPage() {
    const params = useParams();
    const id = typeof params?.id === "string" ? params.id : "";
    const { back, push } = useRouter();
    const pathname = usePathname();
    const routeBase = resolveAdminLikeRouteBase(pathname);
    const [editPopupOpen, setEditPopupOpen] = useState(false);
    const [classesPopupOpen, setClassesPopupOpen] = useState(false);
    const [balancePopupMode, setBalancePopupMode] = useState<"topup" | "withdraw" | null>(null);
    const [walletHistoryOpen, setWalletHistoryOpen] = useState(false);
    const [devicePopupOpen, setDevicePopupOpen] = useState(false);
    const [editingPackageForClassId, setEditingPackageForClassId] = useState<string | null>(null);
    const queryClient = useQueryClient();
    const { data: fullProfile } = useQuery({
        queryKey: ["auth", "full-profile"],
        queryFn: getFullProfile,
        retry: false,
        staleTime: 60_000,
    });
    const {
        isCustomerCareReadOnlyView,
        canManageStudent,
        canEditStudentProfile,
        canEditCustomerCareProfitPercent,
        canCreateWalletQr,
        canDirectlyAdjustWallet,
        canDirectlyWithdrawWallet,
        canRequestDirectTopUp,
        canEditStudentClassTuition,
    } = resolveStudentAdminCapabilities(fullProfile, routeBase);
    const { canManageUsers } = resolveUserAdminCapabilities(fullProfile, routeBase);
    const backLabel = isCustomerCareReadOnlyView
        ? "Quay lại trang CSKH"
        : "Quay lại danh sách học sinh";
    const handleBack = () => {
        if (isCustomerCareReadOnlyView) {
            push("/staff/customer-care-detail");
            return;
        }

        back();
    };

    const {
        data: student,
        isLoading,
        isFetching: isStudentFetching,
        isError,
        error,
    } = useQuery<StudentDetail>({
        queryKey: ["student", "detail", id],
        queryFn: () => studentApi.getStudentById(id),
        enabled: !!id,
    });

    const receiptEmailMutation = useMutation({
        mutationFn: (enabled: boolean) =>
            studentApi.updateStudentById(id, { parent_receipt_email_enabled: enabled }),
        onMutate: async (enabled) => {
            await queryClient.cancelQueries({ queryKey: ["student", "detail", id] });
            const previous = queryClient.getQueryData<StudentDetail>(["student", "detail", id]);
            if (previous) {
                queryClient.setQueryData<StudentDetail>(["student", "detail", id], {
                    ...previous,
                    parentReceiptEmailEnabled: enabled,
                });
            }
            return { previous };
        },
        onError: (_error, _enabled, context) => {
            if (context?.previous) {
                queryClient.setQueryData(["student", "detail", id], context.previous);
            }
            toast.error("Không thể cập nhật cài đặt gửi biên lai.");
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["student", "detail", id] });
            toast.success("Đã cập nhật cài đặt gửi biên lai.");
        },
    });

    const forceLogoutMutation = useMutation({
        mutationFn: () => {
            if (!student?.userId) {
                throw new Error("Student userId not available");
            }
            return forceLogoutStudent(student.userId);
        },
        onSuccess: async () => {
            toast.success("Đã buộc đăng xuất học sinh.");
        },
        onError: (err: unknown) => {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                "Không thể buộc đăng xuất.";
            toast.error(msg);
        },
    });

    const uploadAvatarMutation = useMutation({
        mutationFn: (file: File) => studentApi.uploadStudentAvatar(id, file),
        onSuccess: async (data) => {
            queryClient.setQueryData(["student", "detail", id], data);
            toast.success("Đã cập nhật ảnh đại diện.");
        },
        onError: () => toast.error("Không thể tải ảnh đại diện."),
    });

    const deleteAvatarMutation = useMutation({
        mutationFn: () => studentApi.deleteStudentAvatar(id),
        onSuccess: async (data) => {
            queryClient.setQueryData(["student", "detail", id], data);
            toast.success("Đã xoá ảnh đại diện.");
        },
        onError: () => toast.error("Không thể xoá ảnh đại diện."),
    });

    const {
        data: sePayStaticQr,
        isLoading: isSePayStaticQrLoading,
        error: sePayStaticQrError,
    } = useQuery({
        queryKey: ["student", "detail", id, "sepay-static-qr"],
        queryFn: () => studentApi.getStudentSePayStaticQr(id),
        enabled: balancePopupMode === "topup" && Boolean(id) && canCreateWalletQr,
        retry: false,
        staleTime: 5 * 60_000,
    });

    const classItemsWithTuition = useMemo(
        () =>
            (student?.studentClasses ?? [])
                .flatMap((item) => {
                    const classId = item.class?.id;
                    const className = item.class?.name?.trim();

                    if (!classId || !className) {
                        return [];
                    }

                    return [
                        {
                            classId,
                            className,
                            classStatus: item.class.status ?? null,
                            packageTotal: item.effectiveTuitionPackageTotal ?? null,
                            packageSession: item.effectiveTuitionPackageSession ?? null,
                            tuitionPackageLabel: formatTuitionPackageLabel({
                                packageTotal: item.effectiveTuitionPackageTotal,
                                packageSession: item.effectiveTuitionPackageSession,
                                studentTuitionPerSession: item.effectiveTuitionPerSession,
                            }),
                            tuitionPackageSourceLabel: getTuitionPackageSourceLabel(item.tuitionPackageSource),
                            tuitionPerSession: item.effectiveTuitionPerSession ?? null,
                            attendedSessions: item.totalAttendedSession ?? null,
                        },
                    ];
                })
                .sort((a, b) => a.className.localeCompare(b.className, "vi")),
        [student],
    );

    const removeClassMutation = useMutation({
        mutationFn: async (classId: string) => {
            const nextClassIds = classItemsWithTuition
                .filter((item) => item.classId !== classId)
                .map((item) => item.classId);

            await studentApi.updateStudentClasses(id, {
                class_ids: nextClassIds,
            });

            return classId;
        },
        onSuccess: async (classId) => {
            toast.success("Đã gỡ lớp khỏi học sinh.");
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["student", "detail", id] }),
                queryClient.invalidateQueries({ queryKey: ["student", "list"] }),
                queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
                queryClient.invalidateQueries({ queryKey: ["class", "detail", classId] }),
            ]);
        },
        onError: (err: unknown) => {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                (err as Error)?.message ??
                "Không thể gỡ lớp khỏi học sinh.";
            toast.error(msg);
        },
    });

    const handleTopUp = () => setBalancePopupMode("topup");

    const handleWithdraw = () => setBalancePopupMode("withdraw");

    if (isLoading) {
        return (
            <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 pb-8 sm:p-6" aria-busy="true">
                <div className="mb-4 h-8 w-44 animate-pulse rounded bg-bg-tertiary" />
                <div className="rounded-[1.75rem] border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
                    <div className="h-24 animate-pulse rounded-2xl bg-bg-secondary" />
                    <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className="space-y-4">
                            <div className="h-56 animate-pulse rounded-2xl bg-bg-secondary" />
                            <div className="h-52 animate-pulse rounded-2xl bg-bg-secondary" />
                        </div>
                        <div className="space-y-4">
                            <div className="h-40 animate-pulse rounded-2xl bg-bg-secondary" />
                            <div className="h-64 animate-pulse rounded-2xl bg-bg-secondary" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!id || isError || !student) {
        const message = !id
            ? "Thiếu mã học sinh."
            : (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "Không tìm thấy hoặc không tải được hồ sơ học sinh.";

        return (
            <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 pb-8 sm:p-6">
                <button
                    type="button"
                    onClick={handleBack}
                    className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:px-0"
                >
                    <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span>{backLabel}</span>
                </button>

                <div className="rounded-2xl border border-error/30 bg-error/10 px-4 py-6 text-error" role="alert">
                    <p>{message}</p>
                </div>
            </div>
        );
    }

    const normalizedStatus = normalizeStatus(student.status);
    const normalizedGender = normalizeGender(student.gender);
    const primaryChipClass = statusBadgeClass(normalizedStatus);
    const parentReceiptEmailEnabled = student.parentReceiptEmailEnabled !== false;
    const isReceiptTogglePending = receiptEmailMutation.isPending;
    const initials = (student.fullName?.trim() || student.email || "?").charAt(0).toUpperCase();
    const studentAvatarUrl = pickAvatarUrl(student.avatarUrl);
    const avatarBusy =
        uploadAvatarMutation.isPending || deleteAvatarMutation.isPending;
    const canEditAvatar = canEditStudentProfile && Boolean(student.userId);
    const contactEmail = student.email?.trim() || "Chưa có email";
    const sePayStaticQrErrorMessage =
        (sePayStaticQrError as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ??
        (sePayStaticQrError ? "Không tải được QR SePay. Vui lòng thử lại sau." : null);

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
            <button
                type="button"
                onClick={handleBack}
                className="mb-3 inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-bg-secondary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:mb-4 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-0 sm:shadow-none"
            >
                <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>{backLabel}</span>
            </button>

            {canEditStudentProfile ? (
                <EditStudentPopup
                    key={`${student.id}-${student.updatedAt ?? "stable"}-${editPopupOpen ? "open" : "closed"}`}
                    open={editPopupOpen}
                    onClose={() => setEditPopupOpen(false)}
                    student={student}
                    canEditCustomerCareProfitPercent={canEditCustomerCareProfitPercent}
                    canEditAchievementsAndGallery={canManageStudent}
                />
            ) : null}
            {canManageStudent ? (
                <EditStudentClassesPopup
                    key={`${student.id}-${student.updatedAt ?? "stable"}-classes-${classesPopupOpen ? "open" : "closed"}`}
                    open={classesPopupOpen}
                    onClose={() => setClassesPopupOpen(false)}
                    student={student}
                />
            ) : null}
            {balancePopupMode && (canCreateWalletQr || canDirectlyAdjustWallet || canDirectlyWithdrawWallet || canRequestDirectTopUp) ? (
                <StudentBalancePopup
                    key={`${student.id}-${student.updatedAt ?? "stable"}-balance-${balancePopupMode ?? "closed"}`}
                    open={balancePopupMode !== null}
                    mode={balancePopupMode ?? "topup"}
                    onClose={() => setBalancePopupMode(null)}
                    student={student}
                    sePayStaticQr={sePayStaticQr ?? null}
                    isSePayStaticQrLoading={isSePayStaticQrLoading}
                    sePayStaticQrErrorMessage={sePayStaticQrErrorMessage}
                    submitBalanceChange={
                        canRequestDirectTopUp || canDirectlyWithdrawWallet
                            ? (amount, reason) =>
                                amount > 0 && canRequestDirectTopUp && !canDirectlyAdjustWallet
                                    ? studentApi.createStudentWalletDirectTopUpRequest(student.id, {
                                        amount,
                                        reason: reason ?? "",
                                    })
                                    : studentApi.updateStudentAccountBalance({
                                        student_id: student.id,
                                        amount,
                                        reason: reason ?? "",
                                    })
                            : undefined
                    }
                    directBalanceChangeEnabled={
                        balancePopupMode === "withdraw"
                            ? canDirectlyAdjustWallet || canDirectlyWithdrawWallet
                            : canDirectlyAdjustWallet || canRequestDirectTopUp
                    }
                    directReasonRequired={
                        balancePopupMode === "withdraw"
                            ? canDirectlyAdjustWallet || canDirectlyWithdrawWallet
                            : canDirectlyAdjustWallet || canRequestDirectTopUp
                    }
                    directBalanceChangeLoadingMessage={
                        balancePopupMode === "topup" && canRequestDirectTopUp && !canDirectlyAdjustWallet
                            ? "Đang gửi yêu cầu nạp thẳng..."
                            : undefined
                    }
                    directBalanceChangeSuccessMessage={
                        balancePopupMode === "topup" && canRequestDirectTopUp && !canDirectlyAdjustWallet
                            ? "Đã gửi yêu cầu nạp thẳng tới admin."
                            : undefined
                    }
                    directReasonLabel={
                        balancePopupMode === "topup" && canRequestDirectTopUp && !canDirectlyAdjustWallet
                            ? "Lý do nạp thẳng"
                            : undefined
                    }
                    directReasonPlaceholder={
                        balancePopupMode === "topup" && canRequestDirectTopUp && !canDirectlyAdjustWallet
                            ? "Ví dụ: Phụ huynh chuyển khoản ngoài SePay, cần đối soát thủ công"
                            : undefined
                    }
                    defaultTopUpMethod="sepay"
                    showTopUpMethodTabs={canDirectlyAdjustWallet || canRequestDirectTopUp}
                    copyOverrides={{
                        topup: {
                            ...(canRequestDirectTopUp && !canDirectlyAdjustWallet
                                ? {
                                      submitLabel: "Gửi yêu cầu nạp thẳng",
                                      title: "Yêu cầu nạp thẳng",
                                  }
                                : {}),
                            description: canDirectlyAdjustWallet
                                ? "QR SePay tĩnh để phụ huynh chuyển khoản, hoặc dùng Nạp thẳng khi admin cần ghi nhận thủ công."
                                : canRequestDirectTopUp
                                    ? "QR SePay tĩnh để phụ huynh chuyển khoản, hoặc gửi yêu cầu nạp thẳng tới admin khi cần ghi nhận thủ công."
                                : "QR SePay tĩnh để phụ huynh chuyển khoản. Webhook SePay sẽ tự động cập nhật ví sau khi ngân hàng xác nhận.",
                        },
                    }}
                />
            ) : null}
            {canManageStudent ? (
                <StudentWalletHistoryPopup
                    open={walletHistoryOpen}
                    onClose={() => setWalletHistoryOpen(false)}
                    studentId={student.id}
                    studentName={student.fullName?.trim() || "Học sinh"}
                    currentBalance={student.accountBalance ?? 0}
                />
            ) : null}
            {canManageStudent ? (
                <StudentDevicePopup
                    open={devicePopupOpen}
                    onClose={() => setDevicePopupOpen(false)}
                    studentId={student.id}
                    studentName={student.fullName?.trim() || "Học sinh"}
                />
            ) : null}
            {canEditStudentClassTuition && editingPackageForClassId ? (() => {
                const item = classItemsWithTuition.find((classItem) => classItem.classId === editingPackageForClassId);

                return (
                    <StudentClassTuitionPopup
                        open
                        onClose={() => setEditingPackageForClassId(null)}
                        classId={editingPackageForClassId}
                        className={item?.className ?? ""}
                        studentId={student.id}
                        initialPackageTotal={item?.packageTotal ?? null}
                        initialPackageSession={item?.packageSession ?? null}
                        onSuccess={() => setEditingPackageForClassId(null)}
                    />
                );
            })() : null}

            <section className="relative overflow-hidden rounded-[1.5rem] border border-border-default bg-bg-surface p-3.5 shadow-sm sm:rounded-[1.75rem] sm:p-5">
                <div className="pointer-events-none absolute -left-16 top-6 size-40 rounded-full bg-primary/10 blur-3xl" aria-hidden />
                <div className="pointer-events-none absolute bottom-0 right-0 size-52 rounded-full bg-warning/10 blur-3xl" aria-hidden />

                <div className={cn("relative transition-opacity", isStudentFetching && "opacity-70")}>
                    <QueryRefreshStrip
                        active={isStudentFetching}
                        label="Đang cập nhật hồ sơ học sinh..."
                        className="mb-4"
                    />
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 flex-1 items-start gap-3.5 sm:gap-4">
                            <div className="relative flex shrink-0 flex-col items-center gap-2">
                                <div className="relative">
                                    <PreviewableUserAvatar
                                        src={studentAvatarUrl}
                                        fallback={initials}
                                        alt={`Avatar ${student.fullName?.trim() || "học sinh"}`}
                                        displayName={student.fullName?.trim() || "Học sinh"}
                                        className="size-14 rounded-[1.25rem] bg-bg-secondary text-lg font-semibold text-text-primary ring-1 ring-border-default sm:size-20 sm:rounded-2xl sm:text-3xl"
                                        buttonClassName="rounded-[1.25rem] sm:rounded-2xl"
                                    />
                                    <span
                                        className={`absolute -bottom-1 -right-1 block size-3.5 rounded-full border-2 border-bg-surface ${normalizedStatus === "active" ? "bg-success" : "bg-error"
                                            }`}
                                        aria-hidden
                                    />
                                </div>
                                {canEditAvatar ? (
                                    <div className="flex max-w-[9.5rem] flex-col items-center gap-1">
                                        <label className="cursor-pointer text-[11px] font-medium text-primary hover:underline">
                                            {uploadAvatarMutation.isPending
                                                ? "Đang tải…"
                                                : studentAvatarUrl
                                                  ? "Đổi ảnh"
                                                  : "Tải ảnh"}
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp"
                                                className="sr-only"
                                                disabled={avatarBusy}
                                                onChange={(event) => {
                                                    const file = event.target.files?.[0];
                                                    event.target.value = "";
                                                    if (file) uploadAvatarMutation.mutate(file);
                                                }}
                                            />
                                        </label>
                                        {studentAvatarUrl ? (
                                            <button
                                                type="button"
                                                disabled={avatarBusy}
                                                onClick={() => deleteAvatarMutation.mutate()}
                                                className="text-[11px] font-medium text-text-muted hover:text-danger disabled:opacity-50"
                                            >
                                                {deleteAvatarMutation.isPending
                                                    ? "Đang xoá…"
                                                    : "Xoá ảnh"}
                                            </button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted">
                                    Thông tin học sinh
                                </p>                                <div className="mt-2 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <h1 className="min-w-0 text-2xl font-semibold leading-tight text-text-primary sm:truncate">
                                            {student.fullName?.trim() || "Học sinh"}
                                        </h1>
                                        {canEditStudentProfile ? (
                                            <button
                                                type="button"
                                                onClick={() => setEditPopupOpen(true)}
                                                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-surface text-text-muted transition hover:bg-bg-tertiary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:size-8"
                                                aria-label="Chỉnh sửa thông tin học sinh"
                                                title="Chỉnh sửa"
                                            >
                                                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586Z" />
                                                </svg>
                                            </button>
                                        ) : null}
                                        {canManageUsers && student.userId ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (confirm("Buộc đăng xuất học sinh này? Thiết bị hiện tại sẽ bị ngắt kết nối.")) {
                                                        forceLogoutMutation.mutate();
                                                    }
                                                }}
                                                disabled={forceLogoutMutation.isPending}
                                                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-surface text-text-muted transition hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:size-8 disabled:opacity-50"
                                                aria-label="Buộc đăng xuất học sinh"
                                                title="Buộc đăng xuất"
                                            >
                                                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                                </svg>
                                            </button>
                                        ) : null}
                                        {canManageStudent ? (
                                            <button
                                                type="button"
                                                onClick={() => setDevicePopupOpen(true)}
                                                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-surface text-text-muted transition hover:bg-bg-tertiary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:size-8"
                                                aria-label="Quản trị thiết bị"
                                                title="Quản trị thiết bị"
                                            >
                                                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        ) : null}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <span
                                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${primaryChipClass}`}
                                        >
                                            {STATUS_LABELS[normalizedStatus]}
                                        </span>
                                        <span className="inline-flex rounded-full bg-bg-tertiary px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-border-default">
                                            {GENDER_LABELS[normalizedGender]}
                                        </span>
                                        <StudentLevelBadge fullName={student.fullName} />
                                        {isCustomerCareReadOnlyView ? (
                                            <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                                CSKH
                                            </span>
                                        ) : null}
                                    </div>
                                    {canManageUsers && student.userId ? (
                                        <div className="mt-3">
                                            <UserLinkedProfileLinks
                                                routeBase={routeBase}
                                                userId={student.userId}
                                                showManageLink
                                            />
                                        </div>
                                    ) : null}
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
                        <div className="grid min-w-0 gap-3.5 sm:grid-cols-2 sm:gap-4">
                            <StudentWalletCard
                                className="min-w-0"
                                balance={student.accountBalance ?? 0}
                                onTopUp={canCreateWalletQr || canDirectlyAdjustWallet ? handleTopUp : undefined}
                                onWithdraw={canDirectlyWithdrawWallet ? handleWithdraw : undefined}
                                onOpenHistory={canManageStudent ? () => setWalletHistoryOpen(true) : undefined}
                            />
                            <StudentExamCard
                                className="min-w-0"
                                key={student.id}
                                studentId={student.id}
                            />
                        </div>

                        <div className="grid min-w-0 gap-3.5 sm:grid-cols-2 sm:gap-4">
                            <StudentInfoCard
                                title="Thông tin cơ bản"
                                collapsible
                                defaultOpen={false}
                                storageKey={STUDENT_DETAIL_BASIC_INFO_OPEN_KEY}
                            >
                                <dl className="divide-y divide-border-subtle">
                                    <StudentDetailRow label="Email" value={student.email?.trim() || "—"} />
                                    <StudentDetailRow label="Trường" value={student.school?.trim() || "—"} />
                                    <StudentDetailRow
                                        label="Nguồn khách"
                                        value={
                                            student.customerSource
                                                ? student.customerSource === "other" && student.customerSourceNote?.trim()
                                                    ? `${STUDENT_CUSTOMER_SOURCE_LABELS.other} · ${student.customerSourceNote.trim()}`
                                                    : STUDENT_CUSTOMER_SOURCE_LABELS[student.customerSource]
                                                : "Chưa gán"
                                        }
                                    />
                                    <StudentDetailRow label="Tỉnh / Thành phố" value={student.province?.trim() || "—"} />
                                    <StudentDetailRow
                                        label="CSKH phụ trách"
                                        value={
                                            student.customerCare?.staff
                                                ? `${student.customerCare.staff.fullName}${student.customerCare.staff.status === "inactive" ? " · Ngừng hoạt động" : ""}`
                                                : "—"
                                        }
                                    />
                                    <StudentDetailRow
                                        label="Tỷ lệ lợi nhuận CSKH"
                                        value={formatCustomerCareProfitPercent(student.customerCare?.profitPercent)}
                                    />
                                    <StudentDetailRow label="Năm sinh" value={student.birthYear ?? "—"} />
                                    <StudentDetailRow label="Ngày tạo hồ sơ" value={formatDate(student.createdAt)} />
                                    <StudentDetailRow label="Ngày ngừng theo dõi" value={formatDate(student.dropOutDate)} />
                                    <StudentDetailRow label="Mục tiêu học tập" value={student.goal?.trim() || "—"} />
                                </dl>
                            </StudentInfoCard>

                            <StudentInfoCard
                                title="Liên hệ phụ huynh"
                                collapsible
                                defaultOpen={false}
                                storageKey={STUDENT_DETAIL_PARENT_CONTACT_OPEN_KEY}
                            >
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
                                            <span
                                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${primaryChipClass}`}
                                            >
                                                {STATUS_LABELS[normalizedStatus]}
                                            </span>
                                        }
                                    />
                                </dl>
                                {canEditStudentProfile ? (
                                    <div className="mt-4">
                                        <ParentReceiptEmailSwitch
                                            enabled={parentReceiptEmailEnabled}
                                            disabled={isReceiptTogglePending}
                                            onToggle={(enabled) => receiptEmailMutation.mutate(enabled)}
                                        />
                                    </div>
                                ) : (
                                    <p className="mt-4 border-t border-border-subtle pt-3 text-sm text-text-secondary">
                                        Gửi biên lai qua email:{" "}
                                        <span className="font-medium text-text-primary">
                                            {parentReceiptEmailEnabled ? "Bật" : "Tắt"}
                                        </span>
                                    </p>
                                )}
                            </StudentInfoCard>
                        </div>

                        <StudentInfoCard title="Thành tích">
                            <AchievementListEditor
                                owner={{
                                    kind: "student",
                                    mode: "admin",
                                    studentId: student.id,
                                }}
                                editable={canManageStudent}
                                heading=""
                            />
                        </StudentInfoCard>

                        <StudentInfoCard title="Feedback">
                            <StudentGalleryEditor
                                studentId={student.id}
                                editable={canManageStudent}
                                heading=""
                            />
                        </StudentInfoCard>

                        {/* <StudentInfoCard title="Phân bổ lớp học"> */}
                        <div className="rounded-[1.25rem] border border-border-default bg-bg-secondary/50 p-3.5 sm:rounded-2xl sm:p-4">
                            {isCustomerCareReadOnlyView ? (
                                <div className="mb-4 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-6 text-text-secondary">
                                    Bạn đang xem hồ sơ theo quyền CSKH. Có thể chỉnh sửa thông tin hồ sơ (trừ tỷ lệ lợi nhuận CSKH); danh sách lớp, gói học phí và chỉnh số dư ví vẫn bị khóa.
                                </div>
                            ) : null}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <h2
                                        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted sm:mb-4 sm:text-xs"
                                    >
                                        Danh sách lớp học
                                    </h2>
                                </div>
                                {canManageStudent ? (
                                    <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-col sm:items-end">
                                        <button
                                            type="button"
                                            onClick={() => setClassesPopupOpen(true)}
                                            className="inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-[var(--ue-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:w-auto"
                                            aria-label="Điều chỉnh lớp"
                                            title="Điều chỉnh lớp"
                                        >
                                            <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M12 4v16m8-8H4"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                ) : null}
                            </div>

                            {classItemsWithTuition.length > 0 ? (
                                <>
                                    <div className="mt-4 space-y-3 xl:hidden">
                                        {classItemsWithTuition.map((item) => (
                                            <div
                                                key={item.classId}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() =>
                                                    push(
                                                        buildAdminLikePath(
                                                            routeBase,
                                                            `classes/${encodeURIComponent(item.classId)}`,
                                                        ),
                                                    )
                                                }
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        push(
                                                            buildAdminLikePath(
                                                                routeBase,
                                                                `classes/${encodeURIComponent(item.classId)}`,
                                                            ),
                                                        );
                                                    }
                                                }}
                                                className="group relative cursor-pointer rounded-[1.1rem] border border-border-default bg-bg-surface px-3.5 py-3 shadow-sm transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                            >
                                                {canManageStudent ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void removeClassMutation.mutateAsync(item.classId);
                                                        }}
                                                        disabled={removeClassMutation.isPending}
                                                        className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
                                                        aria-label={`Gỡ lớp ${item.className}`}
                                                        title="Gỡ lớp"
                                                    >
                                                        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                ) : null}
                                                <div className="flex flex-col gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className={`inline-block size-2 shrink-0 rounded-full ${
                                                                    item.classStatus === "running"
                                                                        ? "bg-success"
                                                                        : item.classStatus === "ended"
                                                                            ? "bg-error"
                                                                            : "bg-border-default"
                                                                }`}
                                                                aria-hidden
                                                            />
                                                            <p className="font-medium text-text-primary">{item.className}</p>
                                                        </div>
                                                        <div className="mt-2 flex flex-col gap-1.5 text-sm text-text-secondary">
                                                            {canEditStudentClassTuition ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setEditingPackageForClassId(item.classId);
                                                                    }}
                                                                    className="inline-flex w-full items-center gap-2 rounded-xl border border-border-default bg-secondary/20 px-3 py-2.5 text-left transition-colors duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                                                    aria-label={`Chỉnh gói học phí: ${item.className}`}
                                                                    title="Chỉnh gói học phí"
                                                                >
                                                                    <span className="min-w-0 flex-1">
                                                                        <span className="text-text-secondary">Gói học phí: </span>
                                                                        <span className="font-medium text-text-primary">
                                                                            {item.tuitionPackageLabel}
                                                                        </span>
                                                                    </span>
                                                                    <svg className="size-4 shrink-0 text-current opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                    </svg>
                                                                </button>
                                                            ) : (
                                                                <span className="inline-flex w-full items-center gap-2 rounded-xl border border-border-default bg-secondary/20 px-3 py-2.5 text-left">
                                                                    <span className="min-w-0 flex-1">
                                                                        <span className="text-text-secondary">Gói học phí: </span>
                                                                        <span className="font-medium text-text-primary">
                                                                            {item.tuitionPackageLabel}
                                                                        </span>
                                                                    </span>
                                                                </span>
                                                            )}
                                                            <span>
                                                                Học phí/buổi:{" "}
                                                                <span className="font-medium text-text-primary tabular-nums">
                                                                    {item.tuitionPerSession != null ? formatCurrency(item.tuitionPerSession) : "—"}
                                                                </span>
                                                            </span>
                                                            <span>
                                                                Số buổi:{" "}
                                                                <span className="font-medium text-text-primary tabular-nums">
                                                                    {item.attendedSessions ?? "—"}
                                                                </span>
                                                            </span>
                                                            {item.tuitionPackageSourceLabel ? (
                                                                <span className="inline-flex w-fit rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary ring-1 ring-border-default">
                                                                    {item.tuitionPackageSourceLabel}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-4 hidden overflow-x-auto xl:block">
                                        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-border-default bg-bg-secondary">
                                                    <th scope="col" className="px-4 py-3 font-medium text-text-primary">
                                                        Lớp
                                                    </th>
                                                    <th scope="col" className="px-4 py-3 font-medium text-text-primary">
                                                        Gói học phí
                                                    </th>
                                                    <th scope="col" className="px-4 py-3 font-medium text-text-primary tabular-nums">
                                                        Học phí/buổi
                                                    </th>
                                                    <th scope="col" className="px-4 py-3 font-medium text-text-primary tabular-nums">
                                                        Số buổi
                                                    </th>
                                                    {canManageStudent ? (
                                                        <th scope="col" className="w-12 px-2 py-3">
                                                            <span className="sr-only">Gỡ lớp</span>
                                                        </th>
                                                    ) : null}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {classItemsWithTuition.map((item) => (
                                                    <tr
                                                        key={item.classId}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() =>
                                                            push(
                                                                buildAdminLikePath(
                                                                    routeBase,
                                                                    `classes/${encodeURIComponent(item.classId)}`,
                                                                ),
                                                            )
                                                        }
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                push(
                                                                    buildAdminLikePath(
                                                                        routeBase,
                                                                        `classes/${encodeURIComponent(item.classId)}`,
                                                                    ),
                                                                );
                                                            }
                                                        }}
                                                        className="group cursor-pointer border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                                    >
                                                        <td className="px-4 py-3 text-text-primary">
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className={`inline-block size-2 shrink-0 rounded-full ${
                                                                        item.classStatus === "running"
                                                                            ? "bg-success"
                                                                            : item.classStatus === "ended"
                                                                                ? "bg-error"
                                                                                : "bg-border-default"
                                                                    }`}
                                                                    aria-hidden
                                                                />
                                                                <span className="block truncate">{item.className}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-text-secondary">
                                                            {canEditStudentClassTuition ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setEditingPackageForClassId(item.classId);
                                                                    }}
                                                                    className="inline-flex w-full max-w-full items-center gap-2 rounded-xl border border-border-default bg-secondary/20 py-2 pl-3 pr-2.5 text-left transition-colors duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                                                    aria-label={`Chỉnh gói học phí: ${item.className}`}
                                                                    title="Chỉnh gói học phí"
                                                                >
                                                                    <span className="min-w-0 flex-1 space-y-0.5">
                                                                        <p className="truncate font-medium text-text-primary">{item.tuitionPackageLabel}</p>
                                                                        {item.tuitionPackageSourceLabel ? (
                                                                            <p className="text-xs font-medium text-text-muted">
                                                                                {item.tuitionPackageSourceLabel}
                                                                            </p>
                                                                        ) : null}
                                                                    </span>
                                                                    <svg className="size-4 shrink-0 text-current opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                    </svg>
                                                                </button>
                                                            ) : (
                                                                <div className="inline-flex w-full max-w-full items-center gap-2 rounded-xl border border-border-default bg-secondary/20 py-2 pl-3 pr-2.5 text-left">
                                                                    <span className="min-w-0 flex-1 space-y-0.5">
                                                                        <p className="truncate font-medium text-text-primary">{item.tuitionPackageLabel}</p>
                                                                        {item.tuitionPackageSourceLabel ? (
                                                                            <p className="text-xs font-medium text-text-muted">
                                                                                {item.tuitionPackageSourceLabel}
                                                                            </p>
                                                                        ) : null}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 tabular-nums font-semibold text-text-primary">
                                                            {item.tuitionPerSession != null ? formatCurrency(item.tuitionPerSession) : "—"}
                                                        </td>
                                                        <td className="px-4 py-3 tabular-nums font-semibold text-text-primary">
                                                            {item.attendedSessions ?? "—"}
                                                        </td>
                                                        {canManageStudent ? (
                                                            <td className="px-2 py-3 text-right">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        void removeClassMutation.mutateAsync(item.classId);
                                                                    }}
                                                                    disabled={removeClassMutation.isPending}
                                                                    className="rounded p-1.5 text-text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-error/10 hover:text-error focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
                                                                    aria-label={`Gỡ lớp ${item.className}`}
                                                                    title="Gỡ lớp"
                                                                >
                                                                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            </td>
                                                        ) : null}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <div className="mt-4 rounded-2xl border border-dashed border-border-default bg-bg-surface px-4 py-4">
                                    <p className="text-sm text-text-muted">
                                        {canManageStudent
                                            ? "Học sinh này chưa được gán lớp nào. Dùng nút phía trên để thêm lớp đầu tiên."
                                            : "Học sinh này hiện chưa có lớp nào để theo dõi."}
                                    </p>
                                </div>
                            )}
                        </div>
                        {/* </StudentInfoCard> */}
                    </div>
                </div>
            </section>

            <OjProgressSection studentName={student.fullName ?? ""} />
        </div>
    );
}
