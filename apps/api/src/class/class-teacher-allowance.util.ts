import { normalizeNullableMoney } from '../common/student-class-tuition.util';

/**
 * Resolves `class_teachers.custom_allowance` on roster write.
 * - `incoming === undefined` (omit): preserve existing row; new assignment → null (inherit class default).
 * - `incoming === null`: explicit inherit.
 * - number: stored override (including when equal to class default at save time).
 */
export function resolveClassTeacherCustomAllowanceOnWrite(input: {
  incoming: number | null | undefined;
  existingCustomAllowance: number | null | undefined;
  isExistingAssignment: boolean;
}): number | null {
  if (input.incoming !== undefined) {
    return normalizeNullableMoney(input.incoming);
  }

  if (input.isExistingAssignment) {
    return input.existingCustomAllowance ?? null;
  }

  return null;
}
