import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMyBonusDto, UpdateBonusDto } from './bonus.dto';

const BONUS_ID = '550e8400-e29b-41d4-a716-446655440000';

async function errorFields(
  cls: new () => CreateMyBonusDto | UpdateBonusDto,
  body: object,
) {
  const errors = await validate(plainToInstance(cls, body) as object);
  return errors.map((error) => error.property).sort();
}

describe('Bonus DTO month', () => {
  it('nhận tháng YYYY-MM như form web', async () => {
    expect(
      await errorFields(CreateMyBonusDto, {
        workType: 'cham_bai',
        month: '2026-11',
        amount: 100000,
      }),
    ).toEqual([]);
  });

  // Tháng sai định dạng từng làm TO_DATE trên dashboard ném lỗi và trả 500.
  it.each(['2026-Nov', '11/2026', '2026-13', '2026-1'])(
    'chặn tháng sai định dạng: %p',
    async (month) => {
      expect(
        await errorFields(CreateMyBonusDto, { workType: 'cham_bai', month }),
      ).toEqual(['month']);
      expect(
        await errorFields(UpdateBonusDto, { id: BONUS_ID, month }),
      ).toEqual(['month']);
    },
  );
});
