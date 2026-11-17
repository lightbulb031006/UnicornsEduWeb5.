export type BonusPaymentStatus = "paid" | "pending" | string;

export interface BonusListMeta {
  total: number;
  page: number;
  limit: number;
}

export interface BonusListItem {
  id: string;
  staffId: string;
  workType?: string | null;
  amount?: number | null;
  status?: BonusPaymentStatus | null;
  note?: string | null;
  month?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type BonusDetail = BonusListItem;

export interface BonusListResponse {
  data: BonusListItem[];
  meta: BonusListMeta;
}

export interface CreateBonusPayload {
  staffId: string;
  workType: string;
  month: string;
  amount?: number;
  status?: BonusPaymentStatus;
  note?: string;
}

export interface CreateMyBonusPayload {
  workType: string;
  month: string;
  amount?: number;
  note?: string;
}

export interface UpdateMyBonusPayload {
  id: string;
  workType?: string;
  month?: string;
  amount?: number;
  note?: string;
}

export interface UpdateBonusPayload {
  id: string;
  staffId?: string;
  workType?: string;
  month?: string;
  amount?: number;
  status?: BonusPaymentStatus;
  note?: string;
}

/**
 * Một khoản thưởng ở chế độ chỉ xem (hồ sơ nhân sự cho các trưởng —
 * `/sale-cs-team/members/:id/bonuses`, `/training/tutors/:id/bonuses`).
 */
export interface StaffBonusView {
  id: string;
  workType: string;
  amount: number;
  status: BonusPaymentStatus;
  note: string | null;
  month: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** ISO thời điểm tạo — chỉ nguồn Sale & CSKH trả. */
  createdAt?: string;
}
