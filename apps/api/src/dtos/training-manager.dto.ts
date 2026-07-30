import { PaymentStatus } from 'generated/enums';

export interface TrainingManagerStaffOptionDto {
  id: string;
  fullName: string;
  status: string;
  roles: string[];
}

export interface UpdateClassTrainingManagerDto {
  trainingManagerStaffId?: string | null;
  trainingManagerRatePercent?: number | null;
}

export interface TrainingManagerManagedClassDto {
  classId: string;
  className: string;
  monthTotal: number;
  pendingTotal: number;
}

export interface TrainingManagerManagedClassListDto {
  data: TrainingManagerManagedClassDto[];
  summary: {
    classCount: number;
    totalMonth: number;
    totalPending: number;
  };
}

export interface TrainingManagerBulkPaymentStatusUpdateDto {
  sessionIds: string[];
  paymentStatus: PaymentStatus;
}

export interface TrainingManagerBulkPaymentStatusUpdateResultDto {
  staffId: string;
  requestedCount: number;
  updatedCount: number;
}

export interface TrainingManagerSessionAllowanceDto {
  sessionId: string;
  date: string;
  sessionTuitionTotal: number;
  trainingManagerRatePercent: number;
  allowanceAmount: number;
  paymentStatus: PaymentStatus;
}
