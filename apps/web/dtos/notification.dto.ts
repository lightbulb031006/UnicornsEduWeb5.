export type NotificationStatus = "draft" | "published";
export type NotificationDeliveryKind = "published" | "adjusted";
export type NotificationTargetUserRole = "admin" | "staff";
export type NotificationTargetStaffRole =
  | "admin"
  | "teacher"
  | "lesson_plan"
  | "lesson_plan_head"
  | "accountant"
  | "accountant_income"
  | "accountant_expense"
  | "communication"
  | "technical"
  | "customer_care"
  | "training"
  | "assistant";

export interface NotificationAuthor {
  userId: string | null;
  accountHandle: string | null;
  email: string | null;
  displayName: string | null;
}

export interface NotificationRecipientOption {
  userId: string;
  roleType: NotificationTargetUserRole;
  staffRoles: NotificationTargetStaffRole[];
  accountHandle: string | null;
  email: string | null;
  displayName: string | null;
}

export interface AdminNotificationItem {
  id: string;
  title: string;
  message: string;
  status: NotificationStatus;
  targetAll: boolean;
  targetRoleTypes: NotificationTargetUserRole[];
  targetStaffRoles: NotificationTargetStaffRole[];
  targetUserIds: string[];
  targetUsers: NotificationRecipientOption[];
  version: number;
  pushCount: number;
  lastPushedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: NotificationAuthor | null;
}

export type NotificationFeedReadStatus = "read" | "unread";

export interface NotificationFeedItem {
  id: string;
  title: string;
  message: string;
  status: "published";
  readStatus: NotificationFeedReadStatus;
  version: number;
  pushCount: number;
  lastPushedAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: NotificationAuthor | null;
}

export interface CreateNotificationPayload {
  title: string;
  message: string;
  targetAll?: boolean;
  targetRoleTypes?: NotificationTargetUserRole[];
  targetStaffRoles?: NotificationTargetStaffRole[];
  targetUserIds?: string[];
}

export interface UpdateNotificationPayload {
  title?: string;
  message?: string;
  targetAll?: boolean;
  targetRoleTypes?: NotificationTargetUserRole[];
  targetStaffRoles?: NotificationTargetStaffRole[];
  targetUserIds?: string[];
}

export type PushNotificationPayload = UpdateNotificationPayload;

export interface NotificationPushEvent {
  id: string;
  title: string;
  message: string;
  version: number;
  lastPushedAt: string;
  deliveryKind: NotificationDeliveryKind;
}
