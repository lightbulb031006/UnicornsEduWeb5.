import {
  getPreferredUserFullName,
  getUserFullNameFromParts,
  splitFullName,
} from './user-name.util';

describe('user-name.util', () => {
  it('formats Vietnamese names in family/middle/given order', () => {
    expect(
      getUserFullNameFromParts({
        first_name: 'Phương',
        last_name: 'Vũ Minh',
      }),
    ).toBe('Vũ Minh Phương');
  });

  it('falls back after formatting empty name parts', () => {
    expect(
      getPreferredUserFullName({
        first_name: ' ',
        last_name: null,
        accountHandle: 'staff.phuong',
        email: 'phuong@example.com',
      }),
    ).toBe('staff.phuong');
  });

  it('splits Vietnamese full names into stored given and family/middle parts', () => {
    expect(splitFullName('Vũ Minh Phương')).toEqual({
      first_name: 'Phương',
      last_name: 'Vũ Minh',
    });
  });
});
