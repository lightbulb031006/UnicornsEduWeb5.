import type { StaffStatus } from "@/dtos/staff.dto";

/** Hồ sơ gia sư Ban Đào Tạo xem (backend đã lọc field nhạy cảm và tiền). */
export interface TrainingTutorSummary {
  id: string;
  fullName: string;
  status: StaffStatus;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  university: string | null;
  highSchool: string | null;
  achievementCount: number;
}

export interface TrainingTutorClass {
  id: string;
  name: string;
}

export interface TrainingTutorDetail extends TrainingTutorSummary {
  currentClasses: TrainingTutorClass[];
  pastClasses: TrainingTutorClass[];
  taughtSessionCount: number;
}

export interface TrainingTutorSession {
  id: string;
  /** ISO date `YYYY-MM-DDT00:00:00.000Z`. */
  date: string;
  /** Giờ tường dạng ISO `1970-01-01THH:mm:ss.000Z`. */
  startTime: string | null;
  endTime: string | null;
  class: TrainingTutorClass;
}

export interface TrainingTutorPage<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

export interface TrainingTutorListParams {
  page: number;
  limit: number;
  search?: string;
  status?: "" | StaffStatus;
}
