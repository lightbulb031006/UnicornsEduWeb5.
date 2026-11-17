import {
  aggregateStudentDemographics,
  formatBirthYearLabel,
  normalizeProvince,
  resolveStudentDemographicsPeriod,
  RawCourseFinanceRow,
  RawCourseRow,
  RawStudentDemographicsRow,
  RawStudentRevenueRow,
} from './student-demographics.util';

describe('student-demographics.util', () => {
  describe('normalizeProvince', () => {
    it('normalizes missing, whitespace, and special values to "Chưa cập nhật"', () => {
      expect(normalizeProvince(null)).toBe('Chưa cập nhật');
      expect(normalizeProvince(undefined)).toBe('Chưa cập nhật');
      expect(normalizeProvince('')).toBe('Chưa cập nhật');
      expect(normalizeProvince('   ')).toBe('Chưa cập nhật');
      expect(normalizeProvince('default')).toBe('Chưa cập nhật');
      expect(normalizeProvince('NONE')).toBe('Chưa cập nhật');
      expect(normalizeProvince('Khác')).toBe('Chưa cập nhật');
      expect(normalizeProvince('chưa rõ')).toBe('Chưa cập nhật');
    });

    it('normalizes common aliases and typos of provinces', () => {
      expect(normalizeProvince('Hanoi')).toBe('Hà Nội');
      expect(normalizeProvince('ha noi')).toBe('Hà Nội');
      expect(normalizeProvince('tp ha noi')).toBe('Hà Nội');
      expect(normalizeProvince('thành phố hà nội')).toBe('Hà Nội');

      expect(normalizeProvince('hcm')).toBe('Hồ Chí Minh');
      expect(normalizeProvince('ho chi minh')).toBe('Hồ Chí Minh');
      expect(normalizeProvince('tp ho chi minh')).toBe('Hồ Chí Minh');
      expect(normalizeProvince('sai gon')).toBe('Hồ Chí Minh');

      expect(normalizeProvince('da nang')).toBe('Đà Nẵng');
      expect(normalizeProvince('hai phong')).toBe('Hải Phòng');
      expect(normalizeProvince('phú  thọ')).toBe('Phú Thọ');
      expect(normalizeProvince('phu tho')).toBe('Phú Thọ');
      expect(normalizeProvince('daklak')).toBe('Đắk Lắk');
      expect(normalizeProvince('thanh hoá')).toBe('Thanh Hóa');
      expect(normalizeProvince('thanh hoa')).toBe('Thanh Hóa');
      expect(normalizeProvince('bac ninh')).toBe('Bắc Ninh');
    });

    it('title-cases other province names', () => {
      expect(normalizeProvince('vĩnh phúc')).toBe('Vĩnh Phúc');
      expect(normalizeProvince('bình dương')).toBe('Bình Dương');
    });
  });

  describe('formatBirthYearLabel', () => {
    it('returns label with age for valid years', () => {
      expect(formatBirthYearLabel(2012, 2026)).toBe('2012 (14 tuổi)');
      expect(formatBirthYearLabel(2010, 2026)).toBe('2010 (16 tuổi)');
    });

    it('returns "Chưa cập nhật" for null or out-of-range years', () => {
      expect(formatBirthYearLabel(null)).toBe('Chưa cập nhật');
      expect(formatBirthYearLabel(1920, 2026)).toBe('Chưa cập nhật');
      expect(formatBirthYearLabel(2050, 2026)).toBe('Chưa cập nhật');
    });
  });

  describe('resolveStudentDemographicsPeriod', () => {
    it('returns all-time when no year', () => {
      expect(resolveStudentDemographicsPeriod({})).toMatchObject({
        type: 'all',
        key: null,
        from: null,
        toExclusive: null,
      });
      // Tháng không có năm → vẫn toàn thời gian.
      expect(resolveStudentDemographicsPeriod({ month: '05' }).type).toBe(
        'all',
      );
    });

    it('builds month range with exclusive end (rolls over December)', () => {
      expect(
        resolveStudentDemographicsPeriod({ month: '09', year: '2026' }),
      ).toEqual({
        type: 'month',
        key: '2026-09',
        label: 'Tháng 9/2026',
        from: '2026-09-01',
        toExclusive: '2026-10-01',
      });
      expect(
        resolveStudentDemographicsPeriod({ month: '12', year: '2026' })
          .toExclusive,
      ).toBe('2027-01-01');
    });

    it('builds whole-year range when only year', () => {
      expect(resolveStudentDemographicsPeriod({ year: '2025' })).toEqual({
        type: 'year',
        key: '2025',
        label: 'Năm 2025',
        from: '2025-01-01',
        toExclusive: '2026-01-01',
      });
    });
  });

  describe('aggregateStudentDemographics', () => {
    const mockCourses: RawCourseRow[] = [
      { id: 'course-basic', name: 'Basic', sortOrder: 1 },
      { id: 'course-adv', name: 'Advance', sortOrder: 2 },
      { id: 'course-vip', name: 'VIP', sortOrder: 3 },
    ];

    it('accurately aggregates student data across provinces, birth years, and categories', () => {
      const mockRawStudents: RawStudentDemographicsRow[] = [
        // Student 1: Ha Noi, 2012, in Basic and Advance, topup 1.000.000
        {
          studentId: 'st-1',
          fullName: 'Nguyễn Văn A',
          province: 'Hanoi',
          birthYear: 2012,
          totalTopup: 1000000,
          classId: 'class-1',
          className: 'Basic 01',
          courseId: 'course-basic',
          courseName: 'Basic',
          courseSortOrder: 1,
        },
        {
          studentId: 'st-1',
          fullName: 'Nguyễn Văn A',
          province: 'Hanoi',
          birthYear: 2012,
          totalTopup: 1000000,
          classId: 'class-2',
          className: 'Advance 01',
          courseId: 'course-adv',
          courseName: 'Advance',
          courseSortOrder: 2,
        },
        // Student 2: Ha Noi, 2011, in VIP, topup 2.000.000
        {
          studentId: 'st-2',
          fullName: 'Trần Thị B',
          province: 'Hà Nội',
          birthYear: 2011,
          totalTopup: 2000000,
          classId: 'class-3',
          className: 'VIP 01',
          courseId: 'course-vip',
          courseName: 'VIP',
          courseSortOrder: 3,
        },
        // Student 3: Ho Chi Minh, 2012, in Basic, topup 500.000
        {
          studentId: 'st-3',
          fullName: 'Lê Văn C',
          province: 'TP HCM',
          birthYear: 2012,
          totalTopup: 500000,
          classId: 'class-1',
          className: 'Basic 01',
          courseId: 'course-basic',
          courseName: 'Basic',
          courseSortOrder: 1,
        },
        // Student 4: null province and birthYear, unenrolled (no class/course), topup 0
        {
          studentId: 'st-4',
          fullName: 'Phạm Văn D',
          province: null,
          birthYear: null,
          totalTopup: 0,
          classId: null,
          className: null,
          courseId: null,
          courseName: null,
          courseSortOrder: null,
        },
      ];

      const result = aggregateStudentDemographics(mockRawStudents, mockCourses);

      // Total summary
      expect(result.summary.totalActiveStudents).toBe(4);
      expect(result.summary.enrolledStudentsCount).toBe(3);
      expect(result.summary.unenrolledStudentsCount).toBe(1);
      expect(result.summary.totalProvincesCount).toBe(2); // Hà Nội and Hồ Chí Minh (Chưa cập nhật excluded from distinct count)
      expect(result.summary.totalTopup).toBe(3500000); // 1.000.000 + 2.000.000 + 500.000 + 0 = 3.500.000 (deduplicated by studentId)
      expect(result.summary.averageTopup).toBe(875000); // 3.500.000 / 4 = 875.000
      expect(result.summary.topProvince).toBe('Hà Nội');
      expect(result.summary.topBirthYear).toBe(2012);
      expect(result.summary.topCategory).toBe('Basic');

      // Province groups
      const hanoi = result.byProvince.find((p) => p.province === 'Hà Nội');
      expect(hanoi).toBeDefined();
      expect(hanoi?.studentCount).toBe(2);
      expect(hanoi?.percentage).toBe(50); // 2/4 = 50%
      expect(hanoi?.totalTopup).toBe(3000000); // st-1 (1m) + st-2 (2m)
      expect(
        hanoi?.categories.find((c) => c.courseName === 'Basic')?.studentCount,
      ).toBe(1);
      expect(
        hanoi?.categories.find((c) => c.courseName === 'Advance')?.studentCount,
      ).toBe(1);
      expect(
        hanoi?.categories.find((c) => c.courseName === 'VIP')?.studentCount,
      ).toBe(1);

      // Check unenrolled province group
      const unassignedProv = result.byProvince.find(
        (p) => p.province === 'Chưa cập nhật',
      );
      expect(unassignedProv).toBeDefined();
      expect(unassignedProv?.studentCount).toBe(1);
      expect(unassignedProv?.totalTopup).toBe(0);
      expect(
        unassignedProv?.categories.find((c) => c.courseName === 'Chưa xếp lớp')
          ?.studentCount,
      ).toBe(1);

      // Matrix checks
      const hanoiMatrixRow = result.provinceMatrix.rows.find(
        (r) => r.province === 'Hà Nội',
      );
      expect(hanoiMatrixRow).toBeDefined();
      expect(hanoiMatrixRow?.totalStudents).toBe(2);
      expect(hanoiMatrixRow?.totalTopup).toBe(3000000);
      expect(hanoiMatrixRow?.cells['course-basic']).toBe(1);
      expect(hanoiMatrixRow?.cells['course-adv']).toBe(1);
      expect(hanoiMatrixRow?.cells['course-vip']).toBe(1);
    });
    describe('revenue, course breakdown & data quality', () => {
      const courses: RawCourseRow[] = [
        { id: 'course-basic', name: 'Basic', sortOrder: 1 },
        { id: 'course-vip', name: 'VIP', sortOrder: 2 },
      ];
      const base = {
        classId: null,
        className: null,
        courseId: null,
        courseName: null,
        courseSortOrder: null,
      };
      const rows: RawStudentDemographicsRow[] = [
        {
          ...base,
          studentId: 's1',
          fullName: 'An',
          province: 'Hanoi',
          birthYear: 2012,
          totalTopup: 500,
          status: 'active',
          classId: 'c1',
          className: 'Basic 01',
          courseId: 'course-basic',
          courseName: 'Basic',
          courseSortOrder: 1,
        },
        {
          ...base,
          studentId: 's1',
          fullName: 'An',
          province: 'Hanoi',
          birthYear: 2012,
          totalTopup: 500,
          status: 'active',
          classId: 'c2',
          className: 'VIP 01',
          courseId: 'course-vip',
          courseName: 'VIP',
          courseSortOrder: 2,
        },
        {
          ...base,
          studentId: 's2',
          fullName: 'Bình',
          province: 'hcm',
          birthYear: 2010,
          totalTopup: 300,
          status: 'active',
          classId: 'c1',
          className: 'Basic 01',
          courseId: 'course-basic',
          courseName: 'Basic',
          courseSortOrder: 1,
        },
        {
          ...base,
          studentId: 's3',
          fullName: 'Test',
          province: null,
          birthYear: null,
          totalTopup: 0,
          status: 'active',
        },
        {
          ...base,
          studentId: 's4',
          fullName: 'Lớn tuổi',
          province: 'Hanoi',
          birthYear: 2000,
          totalTopup: 0,
          status: 'active',
          classId: 'c1',
          className: 'Basic 01',
          courseId: 'course-basic',
          courseName: 'Basic',
          courseSortOrder: 1,
        },
        {
          ...base,
          studentId: 's5',
          fullName: 'Sai năm',
          province: 'Hanoi',
          birthYear: 1900,
          totalTopup: 0,
          status: 'inactive',
        },
      ];
      const revenue: RawStudentRevenueRow[] = [
        {
          studentId: 's1',
          courseId: 'course-basic',
          courseName: 'Basic',
          revenue: 1000,
          attendanceCount: 4,
        },
        {
          studentId: 's1',
          courseId: 'course-vip',
          courseName: 'VIP',
          revenue: BigInt(3000),
          attendanceCount: 2,
        },
        {
          studentId: 's2',
          courseId: 'course-basic',
          courseName: 'Basic',
          revenue: '1500',
          attendanceCount: 8,
        },
        {
          studentId: 'not-in-scope',
          courseId: 'course-basic',
          courseName: 'Basic',
          revenue: 99999,
        },
      ];
      const result = aggregateStudentDemographics(
        rows,
        courses,
        2026,
        'all',
        revenue,
      );

      it('sums revenue per student, per course and in summary (ignores out-of-scope students)', () => {
        expect(result.summary.totalRevenue).toBe(5500);
        expect(result.summary.revenueStudentsCount).toBe(2);
        expect(result.summary.averageRevenue).toBe(2750);
        expect(result.summary.topRevenueCategory).toBe('VIP');

        const s1 = result.students.find((s) => s.studentId === 's1')!;
        expect(s1.totalRevenue).toBe(4000);
        expect(s1.revenueByCourse).toEqual({
          'course-basic': 1000,
          'course-vip': 3000,
        });
        expect(s1.attendanceCount).toBe(6);
        expect(s1.classNames).toEqual(['Basic 01', 'VIP 01']);
      });

      it('builds per-course age distribution and revenue', () => {
        const basic = result.byCourse.find((c) => c.key === 'course-basic')!;
        expect(basic.studentCount).toBe(3);
        expect(basic.totalRevenue).toBe(2500);
        expect(basic.averageRevenue).toBe(1250);
        expect(basic.revenueShare).toBe(45.5);
        expect(basic.minBirthYear).toBe(2000);
        expect(basic.maxBirthYear).toBe(2012);
        expect(
          basic.birthYears.map((y) => [y.birthYear, y.studentCount]),
        ).toEqual([
          [2000, 1],
          [2010, 1],
          [2012, 1],
        ]);
        expect(basic.averageAge).toBe(18.7);
      });

      it('fills revenue matrix cells by course', () => {
        const hn = result.provinceMatrix.rows.find(
          (r) => r.province === 'Hà Nội',
        )!;
        expect(hn.totalRevenue).toBe(4000);
        expect(hn.revenueCells['course-basic']).toBe(1000);
        expect(hn.revenueCells['course-vip']).toBe(3000);
      });

      it('treats invalid birth years as missing and flags out-of-range ages', () => {
        expect(
          result.dataQuality.missingBirthYear.map((s) => s.studentId).sort(),
        ).toEqual(['s3', 's5']);
        const invalid = result.students.find((s) => s.studentId === 's5')!;
        expect(invalid.birthYear).toBeNull();
        expect(invalid.rawBirthYear).toBe(1900);
        expect(
          result.dataQuality.unusualBirthYear.map((s) => s.studentId),
        ).toEqual(['s4']);
        // Một nhóm "Chưa cập nhật" duy nhất (không tách 1900 thành nhóm riêng).
        expect(
          result.byBirthYear.filter((y) => y.label === 'Chưa cập nhật'),
        ).toHaveLength(1);
        expect(result.summary.missingBirthYearCount).toBe(2);
        expect(result.summary.unusualBirthYearCount).toBe(1);
      });

      it('computes per-course profit = tuition − teacher − class manager − CSKH and share of total profit', () => {
        const finance: RawCourseFinanceRow[] = [
          {
            courseId: 'course-basic',
            revenue: 10000,
            teacherCost: 4000,
            trainingManagerCost: 500,
            customerCareCost: 500,
          },
          {
            courseId: 'course-vip',
            revenue: '20000',
            teacherCost: BigInt(8000),
            trainingManagerCost: 1000,
            customerCareCost: 1000,
          },
          // Lớp chưa gắn khoá vẫn được tính vào tổng lợi nhuận.
          {
            courseId: null,
            revenue: 0,
            teacherCost: 0,
            trainingManagerCost: 0,
            customerCareCost: 0,
          },
        ];
        const withProfit = aggregateStudentDemographics(
          rows,
          courses,
          2026,
          'all',
          revenue,
          finance,
        );
        expect(withProfit.summary.totalProfit).toBe(15000);

        const basic = withProfit.byCourse.find(
          (c) => c.key === 'course-basic',
        )!;
        expect(basic.totalCost).toBe(5000);
        expect(basic.profit).toBe(5000);
        expect(basic.profitMargin).toBe(50);
        expect(basic.profitShare).toBe(33.3);

        const vip = withProfit.byCourse.find((c) => c.key === 'course-vip')!;
        expect(vip.profit).toBe(10000);
        expect(vip.profitShare).toBe(66.7);

        // Khoá không có dữ liệu chi phí → 0, không lỗi.
        const unassigned = withProfit.byCourse.find(
          (c) => c.courseId == null && c.key === '__unassigned__',
        );
        if (unassigned) expect(unassigned.profit).toBe(0);
      });
    });
  });
});
