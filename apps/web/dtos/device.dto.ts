export interface UserDevice {
  id: string;
  userId: string;
  tokenHash: string;
  deviceInfo: Record<string, unknown> | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
  isActive: boolean;
  isExpired: boolean;
  daysSinceActive: number;
}

export interface DeviceListResponse {
  devices: UserDevice[];
}

export interface ForceLogoutResponse {
  message: string;
}

export interface CleanupExpiredResponse {
  deletedCount: number;
}
