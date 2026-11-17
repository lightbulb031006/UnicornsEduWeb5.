import { customAllowanceWriteFields } from '../common/block-pricing.util';
import { normalizeNullableMoney } from '../common/student-class-tuition.util';

export type ClassTeacherCustomAllowanceFields = {
  /** Per-block when the class has a standard block count (expand #134). */
  customAllowance: number | null;
  /** Exact per-session admin input; source of truth for per-session display. */
  customAllowancePerSession: number | null;
};

/**
 * Resolves `class_teachers.custom_allowance` + `custom_allowance_per_session` on roster write.
 * - `incoming === undefined` (omit): preserve existing row; new assignment → null (inherit class default).
 * - `incoming === null`: explicit inherit.
 * - number: stored override (including when equal to class default at save time).
 */
export function resolveClassTeacherCustomAllowanceOnWrite(input: {
  incoming: number | null | undefined;
  existing: ClassTeacherCustomAllowanceFields | undefined;
  standardBlockCount?: number | null;
}): ClassTeacherCustomAllowanceFields {
  if (input.incoming !== undefined) {
    return customAllowanceWriteFields(
      normalizeNullableMoney(input.incoming),
      input.standardBlockCount,
    );
  }

  if (input.existing) {
    return {
      customAllowance: input.existing.customAllowance ?? null,
      customAllowancePerSession:
        input.existing.customAllowancePerSession ?? null,
    };
  }

  return { customAllowance: null, customAllowancePerSession: null };
}

/**
 * Resolves `class_teachers.custom_scale_amount` on roster write. Same omit/null
 * rules as `custom_allowance`; `0` is a real override (no scale), not "inherit".
 * Scale is flat per session, so no per-block conversion.
 */
export function resolveClassTeacherCustomScaleAmountOnWrite(input: {
  incoming: number | null | undefined;
  existingCustomScaleAmount: number | null | undefined;
  isExistingAssignment: boolean;
}): number | null {
  if (input.incoming !== undefined) {
    return normalizeNullableMoney(input.incoming);
  }

  if (input.isExistingAssignment) {
    return input.existingCustomScaleAmount ?? null;
  }

  return null;
}
