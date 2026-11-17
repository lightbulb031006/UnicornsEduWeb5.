import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from 'generated/client';
import {
  ACCOUNT_HANDLE_TAKEN_MESSAGE,
  changeAccountHandleInTx,
  normalizeAccountHandle,
} from './account-handle';

describe('normalizeAccountHandle', () => {
  it('trim và giữ nguyên hoa thường', () => {
    expect(normalizeAccountHandle('  NguyenVanA.2010 ')).toBe(
      'NguyenVanA.2010',
    );
  });

  it.each(['ab', '', '   ', 'a'.repeat(51), 123, null, undefined])(
    'độ dài / kiểu sai → 400 (%p)',
    (raw) => {
      expect(() => normalizeAccountHandle(raw)).toThrow(BadRequestException);
    },
  );

  it.each(['nguyen van a', 'a\tb12', 'hs@unicorns.edu.vn', '@hs01'])(
    'khoảng trắng hoặc @ → 400 (%p)',
    (raw) => {
      expect(() => normalizeAccountHandle(raw)).toThrow(
        'Tên đăng nhập không được chứa khoảng trắng hoặc ký tự @.',
      );
    },
  );

  it('chấp nhận đúng 3 và 50 ký tự', () => {
    expect(normalizeAccountHandle('abc')).toBe('abc');
    expect(normalizeAccountHandle('a'.repeat(50))).toBe('a'.repeat(50));
  });
});

describe('changeAccountHandleInTx', () => {
  const makeTx = (current: string | null) => {
    const tx = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            current == null ? null : { accountHandle: current },
          ),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'u1' }),
      },
    };
    return tx;
  };
  const asTx = (tx: ReturnType<typeof makeTx>) =>
    tx as unknown as Prisma.TransactionClient;

  it('ghi handle mới đã trim, kiểm trùng không phân biệt hoa thường (trừ chính mình)', async () => {
    const tx = makeTx('old_handle');
    await expect(
      changeAccountHandleInTx(asTx(tx), {
        userId: 'u1',
        accountHandle: ' New_Handle ',
      }),
    ).resolves.toEqual({
      previous: 'old_handle',
      next: 'New_Handle',
      changed: true,
    });
    expect(tx.user.findFirst).toHaveBeenCalledWith({
      where: {
        accountHandle: { equals: 'New_Handle', mode: 'insensitive' },
        NOT: { id: 'u1' },
      },
      select: { id: true },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { accountHandle: 'New_Handle' },
      select: { id: true },
    });
  });

  it('giống hệt handle hiện tại → không ghi DB', async () => {
    const tx = makeTx('same');
    await expect(
      changeAccountHandleInTx(asTx(tx), {
        userId: 'u1',
        accountHandle: 'same',
      }),
    ).resolves.toEqual({ previous: 'same', next: 'same', changed: false });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('chỉ đổi hoa thường của chính mình → vẫn ghi (không coi là trùng)', async () => {
    const tx = makeTx('hs01');
    await expect(
      changeAccountHandleInTx(asTx(tx), {
        userId: 'u1',
        accountHandle: 'HS01',
      }),
    ).resolves.toMatchObject({ changed: true, next: 'HS01' });
  });

  it('handle đã có người khác dùng → 400', async () => {
    const tx = makeTx('old');
    tx.user.findFirst.mockResolvedValue({ id: 'u2' });
    await expect(
      changeAccountHandleInTx(asTx(tx), {
        userId: 'u1',
        accountHandle: 'taken',
      }),
    ).rejects.toThrow(ACCOUNT_HANDLE_TAKEN_MESSAGE);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('đua ghi: unique index P2002 (adapter-pg) → 400', async () => {
    const tx = makeTx('old');
    tx.user.update.mockRejectedValue({
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { fields: ['account_handle'] } },
        },
      },
    });
    await expect(
      changeAccountHandleInTx(asTx(tx), {
        userId: 'u1',
        accountHandle: 'race',
      }),
    ).rejects.toThrow(ACCOUNT_HANDLE_TAKEN_MESSAGE);
  });

  it('lỗi khác giữ nguyên', async () => {
    const tx = makeTx('old');
    const boom = new Error('db down');
    tx.user.update.mockRejectedValue(boom);
    await expect(
      changeAccountHandleInTx(asTx(tx), {
        userId: 'u1',
        accountHandle: 'okay',
      }),
    ).rejects.toBe(boom);
  });

  it('không tìm thấy user → 404', async () => {
    const tx = makeTx(null);
    await expect(
      changeAccountHandleInTx(asTx(tx), {
        userId: 'u1',
        accountHandle: 'okay',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('sai định dạng → 400 trước khi chạm DB', async () => {
    const tx = makeTx('old');
    await expect(
      changeAccountHandleInTx(asTx(tx), { userId: 'u1', accountHandle: 'a b' }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });
});
