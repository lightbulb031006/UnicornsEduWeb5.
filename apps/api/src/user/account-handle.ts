import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from 'generated/client';
import { isUniqueConstraintOn } from 'src/common/prisma-unique-error';

/**
 * Đổi tên đăng nhập (`users.account_handle`) — dùng chung cho Admin, Trưởng
 * phòng Sale & CSKH (học sinh + đội Sale/CSKH) và Trưởng ban Đào tạo (cấp
 * dưới). Mỗi route tự kiểm quyền; helper này chỉ lo chuẩn hoá, chống trùng,
 * ghi DB trong transaction của caller.
 *
 * Luật cho giá trị mới (16/11): 3–50 ký tự sau khi trim, không khoảng trắng,
 * không `@`. Cấm `@` vì `POST /auth/login` tra `accountHandle` HOẶC `email`
 * bằng cùng một chuỗi — handle trùng email người khác sẽ làm lệch tài khoản
 * đăng nhập. Handle cũ không đạt luật vẫn giữ nguyên cho tới khi đổi.
 */
export const ACCOUNT_HANDLE_MIN_LENGTH = 3;
export const ACCOUNT_HANDLE_MAX_LENGTH = 50;

const ACCOUNT_HANDLE_PATTERN = /^[^\s@]+$/u;

export const ACCOUNT_HANDLE_TAKEN_MESSAGE = 'Tên đăng nhập đã được dùng.';

export function normalizeAccountHandle(raw: unknown): string {
  const handle = typeof raw === 'string' ? raw.trim() : '';
  if (
    handle.length < ACCOUNT_HANDLE_MIN_LENGTH ||
    handle.length > ACCOUNT_HANDLE_MAX_LENGTH
  ) {
    throw new BadRequestException(
      `Tên đăng nhập phải dài ${ACCOUNT_HANDLE_MIN_LENGTH}–${ACCOUNT_HANDLE_MAX_LENGTH} ký tự.`,
    );
  }
  if (!ACCOUNT_HANDLE_PATTERN.test(handle)) {
    throw new BadRequestException(
      'Tên đăng nhập không được chứa khoảng trắng hoặc ký tự @.',
    );
  }
  return handle;
}

export interface AccountHandleChange {
  previous: string;
  next: string;
  /** `false` khi handle mới giống hệt handle hiện tại (không ghi DB). */
  changed: boolean;
}

/**
 * Ghi handle mới cho `userId` (`changed = false` nếu giống hệt handle hiện
 * tại — không ghi DB, không audit). Trùng handle người khác — so không phân biệt hoa thường như luồng
 * tạo tài khoản — trả `400`.
 */
export async function changeAccountHandleInTx(
  tx: Prisma.TransactionClient,
  params: { userId: string; accountHandle: unknown },
): Promise<AccountHandleChange> {
  const next = normalizeAccountHandle(params.accountHandle);
  const user = await tx.user.findUnique({
    where: { id: params.userId },
    select: { accountHandle: true },
  });
  if (!user) {
    throw new NotFoundException('Không tìm thấy tài khoản.');
  }
  if (user.accountHandle === next) {
    return { previous: next, next, changed: false };
  }

  const owner = await tx.user.findFirst({
    where: {
      accountHandle: { equals: next, mode: 'insensitive' },
      NOT: { id: params.userId },
    },
    select: { id: true },
  });
  if (owner) {
    throw new BadRequestException(ACCOUNT_HANDLE_TAKEN_MESSAGE);
  }

  try {
    await tx.user.update({
      where: { id: params.userId },
      data: { accountHandle: next },
      select: { id: true },
    });
  } catch (error) {
    // Hai request cùng giành một handle: unique index chặn request thứ hai.
    if (isUniqueConstraintOn(error, 'account_handle')) {
      throw new BadRequestException(ACCOUNT_HANDLE_TAKEN_MESSAGE);
    }
    throw error;
  }

  return { previous: user.accountHandle, next, changed: true };
}
