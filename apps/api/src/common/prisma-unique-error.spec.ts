import {
  getUniqueConstraintFields,
  isUniqueConstraintOn,
} from './prisma-unique-error';

/** Shape thật từ log `POST /staff` (Prisma 7.2 + `@prisma/adapter-pg`): không có `meta.target`. */
const ADAPTER_PG_CCCD_ERROR = {
  code: 'P2002',
  meta: {
    modelName: 'StaffInfo',
    driverAdapterError: {
      cause: {
        originalCode: '23505',
        kind: 'UniqueConstraintViolation',
        constraint: { fields: ['cccd_number'] },
      },
    },
  },
};

describe('getUniqueConstraintFields', () => {
  it('đọc field từ driverAdapterError (Prisma 7 + adapter-pg)', () => {
    expect(getUniqueConstraintFields(ADAPTER_PG_CCCD_ERROR)).toEqual([
      'cccd_number',
    ]);
  });

  it('đọc meta.target dạng mảng (engine cũ)', () => {
    expect(
      getUniqueConstraintFields({ code: 'P2002', meta: { target: ['id'] } }),
    ).toEqual(['id']);
  });

  it('đọc meta.target dạng chuỗi tên index', () => {
    expect(
      getUniqueConstraintFields({
        code: 'P2002',
        meta: { target: 'staff_info_cccd_number_key' },
      }),
    ).toEqual(['staff_info_cccd_number_key']);
  });

  it('constraint theo tên index (adapter không biết cột)', () => {
    expect(
      getUniqueConstraintFields({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: { constraint: { index: 'staff_info_cccd_number_key' } },
          },
        },
      }),
    ).toEqual(['staff_info_cccd_number_key']);
  });

  it.each([
    null,
    undefined,
    'P2002',
    new Error('boom'),
    { code: 'P2025', meta: { target: ['id'] } },
  ])('không phải lỗi unique → [] (%p)', (error) => {
    expect(getUniqueConstraintFields(error)).toEqual([]);
  });
});

describe('isUniqueConstraintOn', () => {
  it('khớp cột cccd_number trên shape adapter-pg', () => {
    expect(isUniqueConstraintOn(ADAPTER_PG_CCCD_ERROR, 'cccd_number')).toBe(
      true,
    );
    expect(isUniqueConstraintOn(ADAPTER_PG_CCCD_ERROR, 'id')).toBe(false);
  });

  it('khớp theo tên index chứa tên cột', () => {
    expect(
      isUniqueConstraintOn(
        { code: 'P2002', meta: { target: 'staff_info_cccd_number_key' } },
        'cccd_number',
      ),
    ).toBe(true);
  });

  it('cột `id` không khớp nhầm với `user_id`', () => {
    expect(
      isUniqueConstraintOn(
        { code: 'P2002', meta: { target: ['user_id'] } },
        'id',
        { exact: true },
      ),
    ).toBe(false);
  });
});
