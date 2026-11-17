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
});

describe('UpdateCostDto', () => {
  it('sửa một phần vẫn hợp lệ khi chỉ gửi id + trạng thái', async () => {
    const errors = await validate(
      plainToInstance(UpdateCostDto, { id: COST_ID, status: 'paid' }),
    );
    expect(errors).toHaveLength(0);
  });
});
