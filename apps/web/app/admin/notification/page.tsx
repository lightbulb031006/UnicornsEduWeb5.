"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowPathIcon,
  CheckIcon,
  DocumentPlusIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import RichTextEditor from "@/components/ui/RichTextEditor";
import type {
  AdminNotificationItem,
  NotificationRecipientOption,
  NotificationTargetStaffRole,
  NotificationTargetUserRole,
  PushNotificationPayload,
  UpdateNotificationPayload,
} from "@/dtos/notification.dto";
import { formatDateTime } from "@/lib/class.helpers";
import * as notificationApi from "@/lib/apis/notification.api";
import { invalidateAdminNotificationScopedQueries } from "@/lib/query-invalidation";
import { sanitizeRichTextContent } from "@/lib/sanitize";

type ComposerMode = "create" | "edit-draft" | "repush";

type NotificationFormState = {
  title: string;
  message: string;
};

type RecipientState = {
  targetAll: boolean;
  targetUserIds: string[];
  targetRoleTypes: NotificationTargetUserRole[];
  targetStaffRoles: NotificationTargetStaffRole[];
};

type AudiencePresetTag =
  | { key: "@all"; label: "@all"; kind: "all" }
  | {
      key: string;
      label: string;
      kind: "roleType";
      value: NotificationTargetUserRole;
    }
  | {
      key: string;
      label: string;
      kind: "staffRole";
      value: NotificationTargetStaffRole;
    };

const EMPTY_FORM: NotificationFormState = {
  title: "",
  message: "",
};

const EMPTY_RECIPIENTS: RecipientState = {
  targetAll: true,
  targetUserIds: [],
  targetRoleTypes: [],
  targetStaffRoles: [],
};

const PRESET_TARGET_TAGS: AudiencePresetTag[] = [
  { key: "@all", label: "@all", kind: "all" },
  { key: "@admin", label: "@admin", kind: "roleType", value: "admin" },
  { key: "@staff", label: "@staff", kind: "roleType", value: "staff" },
  { key: "@teacher", label: "@teacher", kind: "staffRole", value: "teacher" },
  {
    key: "@assistant",
    label: "@assistant",
    kind: "staffRole",
    value: "assistant",
  },
  {
    key: "@accountant_income",
    label: "@accountant_income",
    kind: "staffRole",
    value: "accountant_income",
  },
  {
    key: "@accountant_expense",
    label: "@accountant_expense",
    kind: "staffRole",
    value: "accountant_expense",
  },
  {
    key: "@customer_care",
    label: "@customer_care",
    kind: "staffRole",
    value: "customer_care",
  },
  {
    key: "@training",
    label: "@training",
    kind: "staffRole",
    value: "training",
  },
  {
    key: "@lesson_plan",
    label: "@lesson_plan",
    kind: "staffRole",
    value: "lesson_plan",
  },
  {
    key: "@lesson_plan_head",
    label: "@lesson_plan_head",
    kind: "staffRole",
    value: "lesson_plan_head",
  },
  {
    key: "@communication",
    label: "@communication",
    kind: "staffRole",
    value: "communication",
  },
  {
    key: "@technical",
    label: "@technical",
    kind: "staffRole",
    value: "technical",
  },
];

const INPUT_CLASS =
  "min-h-11 w-full rounded-2xl border border-border-default bg-bg-surface px-4 py-3 text-sm text-text-primary shadow-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus/40";

function hasMeaningfulNotificationContent(message: string): boolean {
  const plainText = message
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plainText.length > 0;
}

function resolveErrorMessage(error: unknown, fallback: string) {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ??
    (error as Error)?.message ??
    fallback
  );
}

function getStatusTone(status: AdminNotificationItem["status"]) {
  if (status === "published") {
    return "border-success/20 bg-success/10 text-success";
  }

  return "border-warning/20 bg-warning/10 text-warning";
}

function getComposerCopy(mode: ComposerMode) {
  switch (mode) {
    case "edit-draft":
      return {
        eyebrow: "Sửa nháp",
        title: "Cập nhật bản nháp",
        description: "Chỉ lưu nội bộ cho đến khi push.",
      };
    case "repush":
      return {
        eyebrow: "Push lại",
        title: "Sửa và push lại",
        description: "Gửi bản cập nhật ngay cho audience đã chọn.",
      };
    default:
      return {
        eyebrow: "Tạo thông báo",
        title: "Soạn thông báo mới",
        description: "Lưu nháp trước, push khi audience đã sẵn sàng.",
      };
  }
}

function getSubmitAriaLabel(mode: ComposerMode, isMutating: boolean) {
  if (isMutating) return "Đang xử lý";
  if (mode === "edit-draft") return "Lưu nháp";
  if (mode === "repush") return "Sửa và push lại";
  return "Tạo nháp";
}

function buildTargetingPayload(recipients: RecipientState) {
  if (recipients.targetAll) {
    return {
      targetAll: true,
      targetRoleTypes: [],
      targetStaffRoles: [],
      targetUserIds: [],
    };
  }

  return {
    targetAll: false,
    targetRoleTypes: recipients.targetRoleTypes,
    targetStaffRoles: recipients.targetStaffRoles,
    targetUserIds: recipients.targetUserIds,
  };
}

function hasExplicitAudienceTargets(recipients: RecipientState) {
  return (
    recipients.targetRoleTypes.length > 0 ||
    recipients.targetStaffRoles.length > 0 ||
    recipients.targetUserIds.length > 0
  );
}

function buildRecipientStateFromItem(item: AdminNotificationItem): {
  recipients: RecipientState;
  selectedUsers: NotificationRecipientOption[];
} {
  const userMap = new Map(item.targetUsers.map((user) => [user.userId, user]));
  return {
    recipients: {
      targetAll: item.targetAll,
      targetRoleTypes: item.targetRoleTypes,
      targetStaffRoles: item.targetStaffRoles,
      targetUserIds: item.targetUserIds,
    },
    selectedUsers: item.targetUserIds.map((userId) => {
      const existing = userMap.get(userId);
      return (
        existing ?? {
          userId,
          roleType: "staff",
          staffRoles: [],
          accountHandle: null,
          email: null,
          displayName: userId,
        }
      );
    }),
  };
}

function buildAudienceLabels(item: AdminNotificationItem) {
  if (item.targetAll) {
    return ["@all"];
  }

  const userMap = new Map(item.targetUsers.map((user) => [user.userId, user]));
  const labels = Array.from(
    new Set([
      ...item.targetRoleTypes.map((role) => `@${role}`),
      ...item.targetStaffRoles.map((role) => `@${role}`),
      ...item.targetUserIds.map(
        (userId) => `@${userMap.get(userId)?.displayName ?? userId}`,
      ),
    ]),
  );

  if (labels.length <= 6) {
    return labels;
  }

  return [...labels.slice(0, 5), `+${labels.length - 5}`];
}

function formatRecipientUserLabel(user: NotificationRecipientOption) {
  return `@${
    user.displayName ?? user.email ?? user.accountHandle ?? user.userId
  }`;
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded bg-bg-tertiary ${className}`}
      aria-hidden
    />
  );
}

function NotificationStatValue({
  isLoading,
  value,
}: {
  isLoading: boolean;
  value: number;
}) {
  if (isLoading) {
    return (
      <span
        className="block h-7 w-10 animate-pulse rounded-md bg-bg-tertiary"
        aria-label="Đang tải số liệu"
      />
    );
  }

  return <>{value}</>;
}

function AdminNotificationCardSkeleton({
  actionCount,
}: {
  actionCount: number;
}) {
  return (
    <article
      className="rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm"
      aria-hidden
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonLine className="h-7 w-20 rounded-full" />
            <SkeletonLine className="h-7 w-10 rounded-full" />
            <SkeletonLine className="h-7 w-16 rounded-full" />
          </div>

          <SkeletonLine className="mt-3 h-6 w-3/4 max-w-md" />
          <div className="mt-3 space-y-2">
            <SkeletonLine className="h-4 w-full max-w-lg" />
            <SkeletonLine className="h-4 w-5/6 max-w-md" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <SkeletonLine className="h-4 w-16" />
            <SkeletonLine className="h-7 w-16 rounded-full" />
            <SkeletonLine className="h-7 w-20 rounded-full" />
            <SkeletonLine className="h-7 w-14 rounded-full" />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {Array.from({ length: actionCount }).map((_, index) => (
            <span
              key={index}
              className="size-10 animate-pulse rounded-xl border border-border-default bg-bg-secondary"
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        <SkeletonLine className="h-3 w-28" />
        <SkeletonLine className="h-3 w-32" />
        <SkeletonLine className="h-3 w-24" />
      </div>
    </article>
  );
}

function AdminNotificationListSkeleton() {
  const groups = [
    { title: "Bản nháp", cards: 2, actionCount: 3 },
    { title: "Đã phát", cards: 1, actionCount: 2 },
  ] as const;

  return (
    <div
      className="mt-5 space-y-5"
      role="status"
      aria-label="Đang tải danh sách thông báo"
    >
      {groups.map((group) => (
        <div key={group.title}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
              {group.title}
            </h3>
            <span
              className="h-6 w-8 animate-pulse rounded-full border border-border-default bg-bg-secondary"
              aria-hidden
            />
          </div>
          <div className="space-y-3">
            {Array.from({ length: group.cards }).map((_, index) => (
              <AdminNotificationCardSkeleton
                key={`${group.title}-${index}`}
                actionCount={group.actionCount}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationListCard({
  item,
  onEditDraft,
  onRepush,
  onPush,
  onDelete,
  disabled,
}: {
  item: AdminNotificationItem;
  onEditDraft: (item: AdminNotificationItem) => void;
  onRepush: (item: AdminNotificationItem) => void;
  onPush: (item: AdminNotificationItem) => void;
  onDelete: (item: AdminNotificationItem) => void;
  disabled: boolean;
}) {
  const isPublished = item.status === "published";
  const audienceLabels = buildAudienceLabels(item);

  return (
    <article className="rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusTone(item.status)}`}
            >
              {isPublished ? "Đã phát" : "Nháp"}
            </span>
            <span className="rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">
              v{item.version}
            </span>
            <span className="rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">
              Push {item.pushCount}
            </span>
          </div>

          <h2 className="mt-3 text-xl font-bold leading-snug text-text-primary">
            {item.title}
          </h2>
          <div
            className="mt-2 line-clamp-4 text-sm leading-6 text-text-secondary [&_p]:my-0 [&_ul]:my-1 [&_ol]:my-1"
            dangerouslySetInnerHTML={{
              __html: sanitizeRichTextContent(item.message),
            }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-text-muted">
              Người nhận:
            </span>
            {audienceLabels.map((label, index) => (
              <span
                key={`${item.id}-audience-${index}`}
                className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {isPublished ? (
            <button
              type="button"
              onClick={() => onRepush(item)}
              disabled={disabled}
              aria-label="Sửa và push lại"
              title="Sửa và push lại"
              className="inline-flex size-10 items-center justify-center rounded-xl bg-primary text-text-inverse transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PaperAirplaneIcon className="size-5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onEditDraft(item)}
                disabled={disabled}
                aria-label="Sửa nháp"
                title="Sửa nháp"
                className="inline-flex size-10 items-center justify-center rounded-xl border border-border-default bg-bg-surface text-text-primary transition hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
              >
                <PencilSquareIcon className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => onPush(item)}
                disabled={disabled}
                aria-label="Push thông báo"
                title="Push thông báo"
                className="inline-flex size-10 items-center justify-center rounded-xl bg-primary text-text-inverse transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
              >
                <PaperAirplaneIcon className="size-5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onDelete(item)}
            disabled={disabled}
            aria-label="Xóa thông báo"
            title="Xóa thông báo"
            className="inline-flex size-10 items-center justify-center rounded-xl border border-error/25 bg-error/10 text-error transition hover:bg-error/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-error/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <TrashIcon className="size-5" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
        <span>Người tạo: {item.createdBy?.displayName ?? "Không rõ"}</span>
        <span>Cập nhật: {formatDateTime(item.updatedAt)}</span>
        <span>Push: {formatDateTime(item.lastPushedAt)}</span>
      </div>
    </article>
  );
}

export default function AdminNotificationPage() {
  const queryClient = useQueryClient();
  const [composerMode, setComposerMode] = useState<ComposerMode>("create");
  const [activeNotificationId, setActiveNotificationId] = useState<
    string | null
  >(null);
  const [form, setForm] = useState<NotificationFormState>(EMPTY_FORM);
  const [recipients, setRecipients] =
    useState<RecipientState>(EMPTY_RECIPIENTS);
  const [selectedUsers, setSelectedUsers] = useState<
    NotificationRecipientOption[]
  >([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const recipientInputRef = useRef<HTMLInputElement | null>(null);
  const trimmedRecipientSearch = recipientSearch.trim();
  const isAtSearch = trimmedRecipientSearch.startsWith("@");
  const normalizedRecipientSearch = isAtSearch
    ? trimmedRecipientSearch.slice(1).trim()
    : trimmedRecipientSearch;
  const [debouncedRecipientSearch] = useDebounce(normalizedRecipientSearch, 250);
  const canSearchUsers = normalizedRecipientSearch.length >= 2;
  const shouldSearchUsers = debouncedRecipientSearch.length >= 2;
  const isRecipientSearchDebouncing =
    canSearchUsers && debouncedRecipientSearch !== normalizedRecipientSearch;

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "admin"],
    queryFn: () => notificationApi.getAdminNotifications({ limit: 250 }),
    staleTime: 30_000,
  });

  const recipientOptionsQuery = useQuery({
    queryKey: ["notifications", "recipient-options", debouncedRecipientSearch],
    queryFn: () =>
      notificationApi.getNotificationRecipientOptions({
        search: debouncedRecipientSearch,
        limit: 12,
      }),
    enabled: shouldSearchUsers,
    staleTime: 30_000,
  });

  const invalidateNotifications = async () => {
    await invalidateAdminNotificationScopedQueries(queryClient);
  };

  const resetComposer = () => {
    setComposerMode("create");
    setActiveNotificationId(null);
    setForm(EMPTY_FORM);
    setRecipients(EMPTY_RECIPIENTS);
    setSelectedUsers([]);
    setRecipientSearch("");
  };

  const createMutation = useMutation({
    mutationFn: notificationApi.createNotificationDraft,
    onSuccess: async () => {
      await invalidateNotifications();
      toast.success("Đã tạo thông báo nháp.");
      resetComposer();
    },
    onError: (error) => {
      toast.error(resolveErrorMessage(error, "Không tạo được thông báo."));
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateNotificationPayload;
    }) => notificationApi.updateNotificationDraft(id, payload),
    onSuccess: async () => {
      await invalidateNotifications();
      toast.success("Đã lưu lại bản nháp.");
      resetComposer();
    },
    onError: (error) => {
      toast.error(resolveErrorMessage(error, "Không cập nhật được bản nháp."));
    },
  });

  const pushMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload?: PushNotificationPayload;
    }) => notificationApi.pushNotification(id, payload),
    onSuccess: async (notification) => {
      await invalidateNotifications();
      toast.success(
        notification.version > 1
          ? "Đã điều chỉnh và push lại thông báo."
          : "Đã push thông báo.",
      );
      if (activeNotificationId === notification.id) {
        resetComposer();
      }
    },
    onError: (error) => {
      toast.error(resolveErrorMessage(error, "Không push được thông báo."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: notificationApi.deleteNotification,
    onSuccess: async ({ id }) => {
      await invalidateNotifications();
      toast.success("Đã xóa thông báo.");
      if (activeNotificationId === id) {
        resetComposer();
      }
    },
    onError: (error) => {
      toast.error(resolveErrorMessage(error, "Không xóa được thông báo."));
    },
  });

  const notifications = notificationsQuery.data ?? [];
  const draftNotifications = notifications.filter(
    (item) => item.status === "draft",
  );
  const publishedNotifications = notifications.filter(
    (item) => item.status === "published",
  );
  const isMutating =
    createMutation.isPending ||
    updateDraftMutation.isPending ||
    pushMutation.isPending ||
    deleteMutation.isPending;
  const composerCopy = getComposerCopy(composerMode);

  const selectedTargetTags = useMemo(() => {
    const tags: string[] = [];
    if (recipients.targetAll) tags.push("@all");
    recipients.targetRoleTypes.forEach((roleType) => tags.push(`@${roleType}`));
    recipients.targetStaffRoles.forEach((role) => tags.push(`@${role}`));
    return tags;
  }, [recipients]);

  const filteredPresetTags = useMemo(() => {
    const keyword = trimmedRecipientSearch.toLowerCase();
    if (!keyword.startsWith("@")) return [];
    return PRESET_TARGET_TAGS.filter((tag) =>
      tag.label.toLowerCase().includes(keyword),
    );
  }, [trimmedRecipientSearch]);

  const filteredRecipientOptions = useMemo(() => {
    const options = recipientOptionsQuery.data ?? [];
    // Set: tra cứu O(1) thay vì quét lại targetUserIds cho từng option.
    const selectedUserIds = new Set(recipients.targetUserIds);
    return options.filter((option) => !selectedUserIds.has(option.userId));
  }, [recipientOptionsQuery.data, recipients.targetUserIds]);
  const showRecipientDropdown = isAtSearch || canSearchUsers;
  const hasTagMatches = filteredPresetTags.length > 0;
  const hasVisibleUserMatches = filteredRecipientOptions.length > 0;
  const showUserSearchHint = isAtSearch && !canSearchUsers;
  const showRecipientEmptyState =
    showRecipientDropdown &&
    !isRecipientSearchDebouncing &&
    !recipientOptionsQuery.isLoading &&
    !recipientOptionsQuery.isError &&
    (!isAtSearch || canSearchUsers) &&
    !hasVisibleUserMatches;

  const hydrateComposerFromItem = (
    item: AdminNotificationItem,
    mode: ComposerMode,
  ) => {
    const next = buildRecipientStateFromItem(item);
    setComposerMode(mode);
    setActiveNotificationId(item.id);
    setForm({
      title: item.title,
      message: item.message,
    });
    setRecipients(next.recipients);
    setSelectedUsers(next.selectedUsers);
    setRecipientSearch("");
  };

  const handleDraftEdit = (item: AdminNotificationItem) => {
    hydrateComposerFromItem(item, "edit-draft");
  };

  const handleRepush = (item: AdminNotificationItem) => {
    hydrateComposerFromItem(item, "repush");
  };

  const handleQuickPush = (item: AdminNotificationItem) => {
    pushMutation.mutate({ id: item.id });
  };

  const handleDelete = (item: AdminNotificationItem) => {
    const confirmed = window.confirm(
      item.status === "draft"
        ? "Xóa bản nháp này?"
        : "Xóa thông báo đã phát? Audience hiện tại sẽ không còn thấy nó trong feed sau lần tải kế tiếp.",
    );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(item.id);
  };

  const addRecipientUser = (option: NotificationRecipientOption) => {
    setRecipients((current) => ({
      ...current,
      targetAll: false,
      targetUserIds: current.targetUserIds.includes(option.userId)
        ? current.targetUserIds
        : [...current.targetUserIds, option.userId],
    }));
    setSelectedUsers((current) =>
      current.some((user) => user.userId === option.userId)
        ? current
        : [...current, option],
    );
    setRecipientSearch("");
  };

  const removeRecipientUser = (userId: string) => {
    setRecipients((current) => ({
      ...current,
      targetUserIds: current.targetUserIds.filter((id) => id !== userId),
    }));
    setSelectedUsers((current) =>
      current.filter((user) => user.userId !== userId),
    );
  };

  const removeTargetTag = (tagLabel: string) => {
    setRecipients((current) => {
      if (tagLabel === "@all") {
        return { ...current, targetAll: false };
      }
      if (
        tagLabel === "@admin" ||
        tagLabel === "@staff"
      ) {
        return {
          ...current,
          targetRoleTypes: current.targetRoleTypes.filter(
            (roleType) => `@${roleType}` !== tagLabel,
          ),
        };
      }
      return {
        ...current,
        targetStaffRoles: current.targetStaffRoles.filter(
          (role) => `@${role}` !== tagLabel,
        ),
      };
    });
  };

  const togglePresetTag = (tagKey: string) => {
    const tag = PRESET_TARGET_TAGS.find((item) => item.key === tagKey);
    if (!tag) return;
    // Side effect phải nằm ngoài updater: React có thể chạy updater nhiều lần.
    if (tag.kind === "all" && !recipients.targetAll) {
      setSelectedUsers([]);
    }
    setRecipients((current) => {
      if (tag.kind === "all") {
        const nextTargetAll = !current.targetAll;
        if (nextTargetAll) {
          return {
            targetAll: true,
            targetRoleTypes: [],
            targetStaffRoles: [],
            targetUserIds: [],
          };
        }
        return {
          ...current,
          targetAll: false,
        };
      }
      if (tag.kind === "roleType") {
        const exists = current.targetRoleTypes.includes(tag.value);
        return {
          ...current,
          targetAll: false,
          targetRoleTypes: exists
            ? current.targetRoleTypes.filter(
                (roleType) => roleType !== tag.value,
              )
            : [...current.targetRoleTypes, tag.value],
        };
      }
      const exists = current.targetStaffRoles.includes(tag.value);
      return {
        ...current,
        targetAll: false,
        targetStaffRoles: exists
          ? current.targetStaffRoles.filter((role) => role !== tag.value)
          : [...current.targetStaffRoles, tag.value],
      };
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = form.title.trim();
    const message = form.message.trim();

    if (!title || !hasMeaningfulNotificationContent(message)) {
      toast.error("Vui lòng nhập đầy đủ tiêu đề và nội dung.");
      return;
    }

    if (!recipients.targetAll && !hasExplicitAudienceTargets(recipients)) {
      toast.error("Chọn ít nhất một người nhận hoặc dùng @all.");
      return;
    }

    const targetingPayload = buildTargetingPayload(recipients);

    if (composerMode === "create") {
      createMutation.mutate({
        title,
        message,
        ...targetingPayload,
      });
      return;
    }

    if (!activeNotificationId) {
      toast.error("Không xác định được thông báo đang chỉnh sửa.");
      return;
    }

    if (composerMode === "edit-draft") {
      updateDraftMutation.mutate({
        id: activeNotificationId,
        payload: {
          title,
          message,
          ...targetingPayload,
        },
      });
      return;
    }

    pushMutation.mutate({
      id: activeNotificationId,
      payload: {
        title,
        message,
        ...targetingPayload,
      },
    });
  };

  return (
    <div className="min-h-0 bg-bg-primary p-3 pb-6 sm:p-5">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
        <section className="rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Notifications
              </p>
              <h1 className="mt-2 text-xl font-semibold text-text-primary sm:text-2xl">
                Quản lý thông báo
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border-default bg-bg-secondary/35 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Tổng
                </p>
                <p className="mt-1 text-xl font-semibold text-text-primary">
                  <NotificationStatValue
                    isLoading={notificationsQuery.isLoading}
                    value={notifications.length}
                  />
                </p>
              </div>
              <div className="rounded-xl border border-border-default bg-bg-secondary/35 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Nháp
                </p>
                <p className="mt-1 text-xl font-semibold text-text-primary">
                  <NotificationStatValue
                    isLoading={notificationsQuery.isLoading}
                    value={draftNotifications.length}
                  />
                </p>
              </div>
              <div className="rounded-xl border border-border-default bg-bg-secondary/35 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Đã phát
                </p>
                <p className="mt-1 text-xl font-semibold text-text-primary">
                  <NotificationStatValue
                    isLoading={notificationsQuery.isLoading}
                    value={publishedNotifications.length}
                  />
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                  {composerCopy.eyebrow}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">
                  {composerCopy.title}
                </h2>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  {composerCopy.description}
                </p>
              </div>
              {composerMode !== "create" && (
                <button
                  type="button"
                  onClick={resetComposer}
                  aria-label="Tạo thông báo mới"
                  title="Tạo thông báo mới"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-default bg-bg-surface text-text-primary transition hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <DocumentPlusIcon className="size-5" />
                </button>
              )}
            </div>

            <form className="mt-4 space-y-3.5" onSubmit={handleSubmit}>
              {/* Not a <label>: multiple buttons + input inside would make clicks
                  activate the first remove button (HTML label association). */}
              <div className="block">
                <div
                  id="admin-notification-recipients-label"
                  className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary"
                >
                  Người nhận
                  <span className="text-xs font-normal text-text-muted">
                    Gõ `@` để chọn audience tag, hoặc tìm user thật theo
                    tên/email/account.
                  </span>
                </div>
                <div className="rounded-2xl border border-border-default bg-bg-surface p-2">
                  <div
                    className="flex items-center gap-2 border-b border-border-default px-2 pb-2"
                    role="presentation"
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("button")) return;
                      recipientInputRef.current?.focus();
                    }}
                  >
                    <span className="text-sm font-medium text-text-secondary">
                      To
                    </span>
                    <div className="flex min-h-9 flex-1 flex-wrap items-center gap-1.5">
                      {selectedTargetTags.map((tagLabel) => (
                        <span
                          key={tagLabel}
                          className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-xs text-primary"
                        >
                          {tagLabel}
                          <button
                            type="button"
                            onClick={() => removeTargetTag(tagLabel)}
                            onMouseDown={(event) => event.stopPropagation()}
                            className="text-primary/80 hover:text-primary"
                            aria-label={`Bỏ ${tagLabel}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {selectedUsers.map((user) => (
                        <span
                          key={user.userId}
                          className="inline-flex items-center gap-1 rounded-full border border-border-default bg-bg-secondary px-2 py-1 text-xs text-text-primary"
                        >
                          {formatRecipientUserLabel(user)}
                          <button
                            type="button"
                            onClick={() => removeRecipientUser(user.userId)}
                            onMouseDown={(event) => event.stopPropagation()}
                            className="text-text-muted hover:text-error"
                            aria-label={`Bỏ ${formatRecipientUserLabel(user)}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        ref={recipientInputRef}
                        id="admin-notification-recipients-input"
                        value={recipientSearch}
                        onChange={(event) =>
                          setRecipientSearch(event.target.value)
                        }
                        placeholder="Tìm user hoặc @…"
                        aria-labelledby="admin-notification-recipients-label"
                        className="min-h-8 min-w-[180px] flex-1 bg-transparent px-1 text-sm text-text-primary outline-none placeholder:text-text-muted"
                      />
                    </div>
                  </div>

                  {showRecipientDropdown && (
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-1.5 shadow-sm">
                      {isAtSearch && hasTagMatches && (
                        <div className="pb-1.5">
                          <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                            Tag
                          </div>
                          <div className="space-y-0.5">
                            {filteredPresetTags.map((tag) => (
                              <button
                                key={tag.key}
                                type="button"
                                onClick={() => {
                                  togglePresetTag(tag.key);
                                  setRecipientSearch("");
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-bg-secondary"
                              >
                                <span className="truncate text-text-primary">
                                  {tag.label}
                                </span>
                                <span className="ml-2 text-xs text-text-muted">
                                  Tag
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div
                        className={
                          isAtSearch && hasTagMatches
                            ? "border-t border-border-default pt-2"
                            : ""
                        }
                      >
                        <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                          Người dùng
                        </div>

                        {showUserSearchHint ? (
                          <div className="px-2.5 py-2 text-sm text-text-muted">
                            Gõ thêm ít nhất 2 ký tự sau `@` để tìm user.
                          </div>
                        ) : isRecipientSearchDebouncing ||
                          recipientOptionsQuery.isLoading ? (
                          <div className="px-2.5 py-2 text-sm text-text-muted">
                            Đang tìm người nhận…
                          </div>
                        ) : recipientOptionsQuery.isError ? (
                          <div className="px-2.5 py-2 text-sm text-error">
                            {resolveErrorMessage(
                              recipientOptionsQuery.error,
                              "Không tải được danh sách người nhận.",
                            )}
                          </div>
                        ) : hasVisibleUserMatches ? (
                          filteredRecipientOptions.map((option) => (
                            <button
                              key={option.userId}
                              type="button"
                              onClick={() => addRecipientUser(option)}
                              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-bg-secondary"
                            >
                              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                                {(
                                  option.displayName?.[0] ??
                                  option.accountHandle?.[0] ??
                                  "?"
                                ).toUpperCase()}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-text-primary">
                                  @{option.displayName ??
                                    option.accountHandle ??
                                    option.email}
                                </span>
                                <span className="block truncate text-xs text-text-muted">
                                  {option.email ?? option.accountHandle} ·{" "}
                                  {option.roleType}
                                  {option.roleType === "staff" &&
                                  option.staffRoles.length > 0
                                    ? ` · ${option.staffRoles.join(", ")}`
                                    : ""}
                                </span>
                              </span>
                            </button>
                          ))
                        ) : showRecipientEmptyState ? (
                          <div className="px-2.5 py-2 text-sm text-text-muted">
                            {isAtSearch && !hasTagMatches
                              ? "Không có tag hoặc user phù hợp với từ khóa hiện tại."
                              : "Không có user phù hợp hoặc user đã được chọn."}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-secondary">
                  Tiêu đề
                </span>
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Ví dụ: Điều chỉnh lịch họp đầu tuần"
                  className={`${INPUT_CLASS} text-lg font-bold tracking-tight`}
                />
              </label>

              <div className="block">
                <span className="mb-2 block text-sm font-medium text-text-secondary">
                  Nội dung
                </span>
                <RichTextEditor
                  ariaLabel="Nội dung"
                  value={form.message}
                  onChange={(nextValue) =>
                    setForm((current) => ({
                      ...current,
                      message: nextValue,
                    }))
                  }
                  minHeight="min-h-[200px]"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={isMutating}
                  aria-label={getSubmitAriaLabel(composerMode, isMutating)}
                  title={getSubmitAriaLabel(composerMode, isMutating)}
                  className="inline-flex size-11 items-center justify-center rounded-2xl bg-primary text-text-inverse transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isMutating ? (
                    <ArrowPathIcon className="size-5 animate-spin" />
                  ) : composerMode === "edit-draft" ? (
                    <CheckIcon className="size-5" />
                  ) : composerMode === "repush" ? (
                    <PaperAirplaneIcon className="size-5" />
                  ) : (
                    <DocumentPlusIcon className="size-5" />
                  )}
                </button>
                {composerMode !== "create" && (
                  <button
                    type="button"
                    onClick={resetComposer}
                    disabled={isMutating}
                    aria-label="Hủy chỉnh sửa"
                    title="Hủy chỉnh sửa"
                    className="inline-flex size-11 items-center justify-center rounded-2xl border border-border-default bg-bg-surface text-text-primary transition hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <XMarkIcon className="size-5" />
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                  Danh sách
                </p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">
                  Nháp & đã phát
                </h2>
              </div>
              <button
                type="button"
                onClick={() => notificationsQuery.refetch()}
                disabled={notificationsQuery.isFetching}
                aria-label="Làm mới danh sách"
                title="Làm mới danh sách"
                className="inline-flex size-10 items-center justify-center rounded-xl border border-border-default bg-bg-surface text-text-primary transition hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowPathIcon
                  className={`size-5 ${notificationsQuery.isFetching ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            {notificationsQuery.isLoading ? (
              <AdminNotificationListSkeleton />
            ) : notificationsQuery.isError ? (
              <div className="mt-5 rounded-2xl border border-error/20 bg-error/10 px-4 py-5 text-sm text-error">
                {resolveErrorMessage(
                  notificationsQuery.error,
                  "Không tải được danh sách thông báo.",
                )}
              </div>
            ) : notifications.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-border-default bg-bg-secondary/35 px-4 py-10 text-center text-sm text-text-secondary">
                Chưa có thông báo nào.
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
                      Bản nháp
                    </h3>
                    <span className="rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">
                      {draftNotifications.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {draftNotifications.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border-default bg-bg-secondary/35 px-4 py-6 text-sm text-text-secondary">
                        Không có bản nháp.
                      </div>
                    ) : (
                      draftNotifications.map((item) => (
                        <NotificationListCard
                          key={item.id}
                          item={item}
                          onEditDraft={handleDraftEdit}
                          onRepush={handleRepush}
                          onPush={handleQuickPush}
                          onDelete={handleDelete}
                          disabled={isMutating}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
                      Đã phát
                    </h3>
                    <span className="rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">
                      {publishedNotifications.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {publishedNotifications.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border-default bg-bg-secondary/35 px-4 py-6 text-sm text-text-secondary">
                        Chưa có thông báo đã phát.
                      </div>
                    ) : (
                      publishedNotifications.map((item) => (
                        <NotificationListCard
                          key={item.id}
                          item={item}
                          onEditDraft={handleDraftEdit}
                          onRepush={handleRepush}
                          onPush={handleQuickPush}
                          onDelete={handleDelete}
                          disabled={isMutating}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
