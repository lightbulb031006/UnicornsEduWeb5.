import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCostDto, UpdateCostDto } from './cost.dto';

const COST_ID = '550e8400-e29b-41d4-a716-446655440000';

async function errorFields(cls: typeof CreateCostDto, body: object) {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((error) => error.property).sort();
}

describe('CreateCostDto', () => {
  it('chặn body rỗng: thiếu danh mục và số tiền', async () => {
    expect(await errorFields(CreateCostDto, {})).toEqual([
      'amount',
      'category',
    ]);
  });

  it('chặn danh mục toàn khoảng trắng và số tiền âm', async () => {
    expect(
      await errorFields(CreateCostDto, { category: '   ', amount: -1 }),
    ).toEqual(['amount', 'category']);
  });

  it('nhận payload như form web (số tiền 0 hợp lệ)', async () => {
    expect(
      await errorFields(CreateCostDto, {
        category: 'Marketing',
        amount: 0,
        month: '2026-11',
        date: '2026-11-13',
      }),
    ).toEqual([]);
  });

  // Tháng sai định dạng từng làm TO_DATE trên dashboard ném lỗi và trả 500.
  it.each(['2026-Nov', '11/2026', 'Tháng 11', '2026-13', '2026-1', ''])(
    'chặn tháng sai định dạng YYYY-MM: %p',
    async (month) => {
      expect(
        await errorFields(CreateCostDto, {
          category: 'Marketing',
          amount: 0,
          month,
        }),
      ).toEqual(['month']);
    },
  );
});

describe('UpdateCostDto', () => {
  it('chặn sửa tháng sang giá trị sai định dạng', async () => {
    const errors = await validate(
      plainToInstance(UpdateCostDto, { id: COST_ID, month: '2026-Nov' }),
    );
    expect(errors.map((error) => error.property)).toEqual(['month']);
  });

  it('sửa một phần vẫn hợp lệ khi chỉ gửi id + trạng thái', async () => {
    const errors = await validate(
      plainToInstance(UpdateCostDto, { id: COST_ID, status: 'paid' }),
    );
    expect(errors).toHaveLength(0);
  });
});
