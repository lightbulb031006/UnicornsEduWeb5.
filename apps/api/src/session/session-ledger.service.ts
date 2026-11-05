import { Injectable } from '@nestjs/common';

interface TransactionBackedAttendance {
  tuitionFee?: number | null;
  transaction?: {
    amount?: number | null;
  } | null;
}

@Injectable()
export class SessionLedgerService {
  private formatVND(amount: number) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  }

  getAttendanceChargeAmount(
    attendanceItem: TransactionBackedAttendance | undefined,
  ) {
    if (!attendanceItem) {
      return 0;
    }

    return Math.max(
      0,
      attendanceItem.transaction?.amount ?? attendanceItem.tuitionFee ?? 0,
    );
  }

  buildChargeNote(params: {
    className: string;
    dateLabel: string;
    balanceBefore: number;
    amount: number;
  }) {
    const balanceAfter = params.balanceBefore - params.amount;
    return `Đóng học phí lớp ${params.className} buổi học ${params.dateLabel}. | Số dư: ${this.formatVND(params.balanceBefore)} - ${this.formatVND(params.amount)} = ${this.formatVND(balanceAfter)}`;
  }

  buildRefundNote(params: {
    className: string;
    dateLabel: string;
    balanceBefore: number;
    amount: number;
  }) {
    const balanceAfter = params.balanceBefore + params.amount;
    return `Hoàn trả số dư lớp ${params.className} buổi học ${params.dateLabel}. | Số dư: ${this.formatVND(params.balanceBefore)} + ${this.formatVND(params.amount)} = ${this.formatVND(balanceAfter)}`;
  }

  buildTrialCatchUpChargeNote(params: {
    className: string;
    dateLabel: string;
    trialDateLabel: string;
    balanceBefore: number;
    amount: number;
  }) {
    const balanceAfter = params.balanceBefore - params.amount;
    return `Thu bù học thử lớp ${params.className} (buổi học thử ${params.trialDateLabel}), thu tại buổi học ${params.dateLabel}. | Số dư: ${this.formatVND(params.balanceBefore)} - ${this.formatVND(params.amount)} = ${this.formatVND(balanceAfter)}`;
  }

  buildTrialCatchUpRefundNote(params: {
    className: string;
    dateLabel: string;
    balanceBefore: number;
    amount: number;
  }) {
    const balanceAfter = params.balanceBefore + params.amount;
    return `Hoàn thu bù học thử lớp ${params.className} buổi học ${params.dateLabel}. | Số dư: ${this.formatVND(params.balanceBefore)} + ${this.formatVND(params.amount)} = ${this.formatVND(balanceAfter)}`;
  }
}
