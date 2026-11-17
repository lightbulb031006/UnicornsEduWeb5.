import { BadRequestException } from '@nestjs/common';
import { ClassPricingMode, StudentClassStatus } from 'generated/enums';
import {
  assertClassTuitionBeforeFirstStudent,
  CLASS_TUITION_REQUIRED_MESSAGE,
  ONE_TIME_CLASS_TUITION_REQUIRED_MESSAGE,
  findClassIdsWithoutActiveStudents,
  hasClassTuitionForPricingMode,
} from './class-first-student-tuition';

describe('#273 học phí lớp trước học sinh đầu tiên', () => {
  describe('hasClassTuitionForPricingMode', () => {
    const empty = {
      studentTuitionPerSession: null,
      studentTuitionPerBlock: null,
      tuitionPackageTotal: null,
      tuitionPackageSession: null,
    };

    describe('theo buổi (per_session)', () => {
      const mode = ClassPricingMode.per_session;

      it('chưa điền gì → chưa có học phí', () => {
        expect(
          hasClassTuitionForPricingMode({ ...empty, pricingMode: mode }),
        ).toBe(false);
      });

      it('học phí / buổi 0đ → đã điền', () => {
        expect(
          hasClassTuitionForPricingMode({
            ...empty,
            pricingMode: mode,
            studentTuitionPerSession: 0,
          }),
        ).toBe(true);
      });

      it('theo gói buổi: tổng gói + số buổi → đã điền', () => {
        expect(
          hasClassTuitionForPricingMode({
            ...empty,
            pricingMode: mode,
            tuitionPackageTotal: 3_600_000,
            tuitionPackageSession: 12,
          }),
        ).toBe(true);
      });

      it('gói 0đ → đã điền (miễn phí)', () => {
        expect(
          hasClassTuitionForPricingMode({
            ...empty,
            pricingMode: mode,
            tuitionPackageTotal: 0,
          }),
        ).toBe(true);
      });

      it('chỉ có tổng gói > 0, thiếu số buổi → chưa có học phí', () => {
        expect(
          hasClassTuitionForPricingMode({
            ...empty,
            pricingMode: mode,
            tuitionPackageTotal: 3_600_000,
          }),
        ).toBe(false);
      });

      it('pricingMode trống = theo buổi', () => {
        expect(hasClassTuitionForPricingMode({ ...empty })).toBe(false);
        expect(
          hasClassTuitionForPricingMode({
            ...empty,
            studentTuitionPerSession: 200_000,
          }),
        ).toBe(true);
      });
    });

    describe('theo 30 phút (per_block)', () => {
      const mode = ClassPricingMode.per_block;

      it('chưa điền gì → chưa có học phí', () => {
        expect(
          hasClassTuitionForPricingMode({ ...empty, pricingMode: mode }),
        ).toBe(false);
      });

      it('học phí / 30 phút 0đ → đã điền', () => {
        expect(
          hasClassTuitionForPricingMode({
            ...empty,
            pricingMode: mode,
            studentTuitionPerBlock: 0,
          }),
        ).toBe(true);
      });

      it('chỉ có chuỗi theo buổi (charge fallback) → đã điền', () => {
        expect(
          hasClassTuitionForPricingMode({
            ...empty,
            pricingMode: mode,
            studentTuitionPerSession: 300_000,
          }),
        ).toBe(true);
      });
    });

    describe('trọn gói (one_time)', () => {
      const mode = ClassPricingMode.one_time;

      it('chưa có tổng gói → chưa có học phí, kể cả có học phí / buổi', () => {
        expect(
          hasClassTuitionForPricingMode({
            ...empty,
            pricingMode: mode,
            studentTuitionPerSession: 300_000,
          }),
        ).toBe(false);
      });

      it('có tổng gói → đã điền', () => {
        expect(
          hasClassTuitionForPricingMode({
            ...empty,
            pricingMode: mode,
            tuitionPackageTotal: 5_000_000,
          }),
        ).toBe(true);
      });

      it('tổng gói 0đ → chưa đủ: lớp bán một lần cần gói > 0đ (follow-up 13/11)', () => {
        expect(
          hasClassTuitionForPricingMode({
            ...empty,
            pricingMode: mode,
            tuitionPackageTotal: 0,
          }),
        ).toBe(false);
      });
    });
  });

  describe('findClassIdsWithoutActiveStudents', () => {
    it('trả lớp không còn học sinh đang học (active hoặc status null)', async () => {
      const db = {
        studentClass: {
          findMany: jest.fn().mockResolvedValue([{ classId: 'class-full' }]),
        },
      };

      await expect(
        findClassIdsWithoutActiveStudents(db as never, [
          'class-full',
          'class-empty',
          'class-empty',
        ]),
      ).resolves.toEqual(['class-empty']);
      expect(db.studentClass.findMany).toHaveBeenCalledWith({
        where: {
          classId: { in: ['class-full', 'class-empty'] },
          OR: [{ status: null }, { status: StudentClassStatus.active }],
        },
        select: { classId: true },
      });
    });

    it('không truy vấn khi không có lớp', async () => {
      const db = { studentClass: { findMany: jest.fn() } };
      await expect(
        findClassIdsWithoutActiveStudents(db as never, []),
      ).resolves.toEqual([]);
      expect(db.studentClass.findMany).not.toHaveBeenCalled();
    });
  });

  describe('assertClassTuitionBeforeFirstStudent', () => {
    const classRow = (overrides: Record<string, unknown>) => ({
      id: 'class-1',
      name: 'Toán 10A',
      pricingMode: ClassPricingMode.per_session,
      studentTuitionPerSession: null,
      studentTuitionPerBlock: null,
      tuitionPackageTotal: null,
      tuitionPackageSession: null,
      ...overrides,
    });

    it('lớp chưa có học phí → 400 với thông báo tiếng Việt', async () => {
      const db = {
        class: { findMany: jest.fn().mockResolvedValue([classRow({})]) },
      };

      const error = await assertClassTuitionBeforeFirstStudent(db as never, [
        'class-1',
      ]).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe(CLASS_TUITION_REQUIRED_MESSAGE);
    });

    it('lớp có học phí 0đ → cho qua', async () => {
      const db = {
        class: {
          findMany: jest
            .fn()
            .mockResolvedValue([classRow({ studentTuitionPerSession: 0 })]),
        },
      };
      await expect(
        assertClassTuitionBeforeFirstStudent(db as never, ['class-1']),
      ).resolves.toBeUndefined();
    });

    it('lớp bán một lần gói trống → 400 bắt điền Tổng gói > 0đ', async () => {
      const db = {
        class: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              classRow({ pricingMode: ClassPricingMode.one_time }),
            ]),
        },
      };
      await expect(
        assertClassTuitionBeforeFirstStudent(db as never, ['class-1']),
      ).rejects.toThrow(ONE_TIME_CLASS_TUITION_REQUIRED_MESSAGE);
    });

    it('lớp bán một lần gói > 0đ → cho nhận học sinh đầu tiên', async () => {
      const db = {
        class: {
          findMany: jest.fn().mockResolvedValue([
            classRow({
              pricingMode: ClassPricingMode.one_time,
              tuitionPackageTotal: 5_000_000,
            }),
          ]),
        },
      };
      await expect(
        assertClassTuitionBeforeFirstStudent(db as never, ['class-1']),
      ).resolves.toBeUndefined();
    });

    it('nhiều lớp: nêu tên lớp chưa có học phí', async () => {
      const db = {
        class: {
          findMany: jest.fn().mockResolvedValue([
            classRow({ id: 'class-1', name: 'Toán 10A' }),
            classRow({
              id: 'class-2',
              name: 'Lý 11B',
              studentTuitionPerSession: 1,
            }),
          ]),
        },
      };
      await expect(
        assertClassTuitionBeforeFirstStudent(db as never, [
          'class-1',
          'class-2',
        ]),
      ).rejects.toThrow('Lớp «Toán 10A» chưa có học phí.');
    });

    it('không truy vấn khi không có lớp trống', async () => {
      const db = { class: { findMany: jest.fn() } };
      await expect(
        assertClassTuitionBeforeFirstStudent(db as never, []),
      ).resolves.toBeUndefined();
      expect(db.class.findMany).not.toHaveBeenCalled();
    });
  });
});
