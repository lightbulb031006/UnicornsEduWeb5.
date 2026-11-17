import { randomBytes } from 'node:crypto';
import { isUniqueConstraintOn } from './prisma-unique-error';

const SHORT_ID_PART = '[0-9a-f]{10}';

export const STUDENT_ID_PREFIX = 'UNIST-';
export const CLASS_ID_PREFIX = 'UNICL-';
export const STAFF_ID_PREFIX = 'UNISTAFF-';
export const LESSON_TASK_ID_PREFIX = 'UNILTK-';
export const LESSON_RESOURCE_ID_PREFIX = 'UNILRS-';
export const LESSON_OUTPUT_ID_PREFIX = 'UNILOT-';
export const STAFF_LESSON_TASK_ID_PREFIX = 'UNISLT-';

const STUDENT_ID_RE = new RegExp(`^${STUDENT_ID_PREFIX}${SHORT_ID_PART}$`);
const CLASS_ID_RE = new RegExp(`^${CLASS_ID_PREFIX}${SHORT_ID_PART}$`);
const STAFF_ID_RE = new RegExp(`^${STAFF_ID_PREFIX}${SHORT_ID_PART}$`);
const LESSON_TASK_ID_RE = new RegExp(
  `^${LESSON_TASK_ID_PREFIX}${SHORT_ID_PART}$`,
);
const LESSON_RESOURCE_ID_RE = new RegExp(
  `^${LESSON_RESOURCE_ID_PREFIX}${SHORT_ID_PART}$`,
);
const LESSON_OUTPUT_ID_RE = new RegExp(
  `^${LESSON_OUTPUT_ID_PREFIX}${SHORT_ID_PART}$`,
);
const STAFF_LESSON_TASK_ID_RE = new RegExp(
  `^${STAFF_LESSON_TASK_ID_PREFIX}${SHORT_ID_PART}$`,
);

function generateShortIdPart(): string {
  return randomBytes(5).toString('hex');
}

export function generateStudentId(): string {
  return `${STUDENT_ID_PREFIX}${generateShortIdPart()}`;
}

export function generateClassId(): string {
  return `${CLASS_ID_PREFIX}${generateShortIdPart()}`;
}

export function generateStaffId(): string {
  return `${STAFF_ID_PREFIX}${generateShortIdPart()}`;
}

export function generateLessonTaskId(): string {
  return `${LESSON_TASK_ID_PREFIX}${generateShortIdPart()}`;
}

export function generateLessonResourceId(): string {
  return `${LESSON_RESOURCE_ID_PREFIX}${generateShortIdPart()}`;
}

export function generateLessonOutputId(): string {
  return `${LESSON_OUTPUT_ID_PREFIX}${generateShortIdPart()}`;
}

export function generateStaffLessonTaskId(): string {
  return `${STAFF_LESSON_TASK_ID_PREFIX}${generateShortIdPart()}`;
}

export function isStudentId(value: unknown): value is string {
  return typeof value === 'string' && STUDENT_ID_RE.test(value);
}

export function isClassId(value: unknown): value is string {
  return typeof value === 'string' && CLASS_ID_RE.test(value);
}

export function isStaffId(value: unknown): value is string {
  return typeof value === 'string' && STAFF_ID_RE.test(value);
}

export function isLessonTaskId(value: unknown): value is string {
  return typeof value === 'string' && LESSON_TASK_ID_RE.test(value);
}

export function isLessonResourceId(value: unknown): value is string {
  return typeof value === 'string' && LESSON_RESOURCE_ID_RE.test(value);
}

export function isLessonOutputId(value: unknown): value is string {
  return typeof value === 'string' && LESSON_OUTPUT_ID_RE.test(value);
}

export function isStaffLessonTaskId(value: unknown): value is string {
  return typeof value === 'string' && STAFF_LESSON_TASK_ID_RE.test(value);
}

export function assertStudentId(value: unknown): asserts value is string {
  if (!isStudentId(value)) {
    throw new Error(`Invalid student id: ${String(value)}`);
  }
}

export function assertClassId(value: unknown): asserts value is string {
  if (!isClassId(value)) {
    throw new Error(`Invalid class id: ${String(value)}`);
  }
}

export function assertStaffId(value: unknown): asserts value is string {
  if (!isStaffId(value)) {
    throw new Error(`Invalid staff id: ${String(value)}`);
  }
}

export function assertLessonTaskId(value: unknown): asserts value is string {
  if (!isLessonTaskId(value)) {
    throw new Error(`Invalid lesson task id: ${String(value)}`);
  }
}

export function assertLessonResourceId(
  value: unknown,
): asserts value is string {
  if (!isLessonResourceId(value)) {
    throw new Error(`Invalid lesson resource id: ${String(value)}`);
  }
}

export function assertLessonOutputId(value: unknown): asserts value is string {
  if (!isLessonOutputId(value)) {
    throw new Error(`Invalid lesson output id: ${String(value)}`);
  }
}

export function assertStaffLessonTaskId(
  value: unknown,
): asserts value is string {
  if (!isStaffLessonTaskId(value)) {
    throw new Error(`Invalid staff lesson task id: ${String(value)}`);
  }
}

export function isEntityIdUniqueConstraintError(error: unknown): boolean {
  return isUniqueConstraintOn(error, 'id', { exact: true });
}
