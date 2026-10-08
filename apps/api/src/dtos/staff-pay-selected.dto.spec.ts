import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StaffPaySelectedPaymentsDto } from './staff.dto';

const SESSION_ID = '53d7f00c-4ae7-4a1d-b4d3-67415159f4c8';
const LESSON_OUTPUT_ID = 'UNILOT-c856c0589f';

async function validatePayload(items: unknown[]) {
  const dto = plainToInstance(StaffPaySelectedPaymentsDto, {
    month: '10',
    year: '2026',
    items,
  });
  return validate(dto);
}

describe('StaffPaySelectedPaymentsDto', () => {
  it('accepts lesson outputs alongside UUID sources ("Chọn tất cả")', async () => {
    const errors = await validatePayload([
      { sourceType: 'teacher_session', id: SESSION_ID },
      { sourceType: 'lesson_output', id: LESSON_OUTPUT_ID },
    ]);

    expect(errors).toHaveLength(0);
  });

  it('rejects a UUID for lesson_output and a short id for other sources', async () => {
    const errors = await validatePayload([
      { sourceType: 'lesson_output', id: SESSION_ID },
      { sourceType: 'bonus', id: LESSON_OUTPUT_ID },
    ]);

    const itemErrors = errors[0]?.children ?? [];
    expect(itemErrors.map((error) => error.property)).toEqual(['0', '1']);
  });
});
