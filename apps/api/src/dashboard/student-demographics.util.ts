import type {
  AdminDashboardStudentDemographicsDto,
  StudentDemographicsBirthYearGroupDto,
  StudentDemographicsBirthYearSummaryDto,
  StudentDemographicsCategoryItemDto,
  StudentDemographicsCourseBreakdownDto,
  StudentDemographicsPeriodDto,
  StudentDemographicsProvinceGroupDto,
  StudentDemographicsStudentRowDto,
} from '../dtos/dashboard.dto';

export interface RawStudentDemographicsRow {
  studentId: string;
  fullName: string;
  province: string | null;
  birthYear: number | null;
  classId: string | null;
  className: string | null;
  courseId: string | null;
  courseName: string | null;
  courseSortOrder: number | null;
  totalTopup?: number | bigint | null;
  status?: string | null;
  school?: string | null;
}

/** Học phí đã học của một học sinh, gom theo khoá của lớp có buổi học. */
export interface RawStudentRevenueRow {
  studentId: string;
  courseId: string | null;
  courseName: string | null;
  revenue: number | bigint | string | null;
  attendanceCount?: number | bigint | string | null;
}

/** Học phí + chi phí (gia sư, QL lớp, CSKH) gom theo khoá của lớp, toàn thời gian. */
export interface RawCourseFinanceRow {
  courseId: string | null;
  revenue: number | bigint | string | null;
  teacherCost: number | bigint | string | null;
  trainingManagerCost: number | bigint | string | null;
  customerCareCost: number | bigint | string | null;
}

export interface RawCourseRow {
  id: string;
  name: string;
  sortOrder: number;
}

export const ALL_TIME_PERIOD: StudentDemographicsPeriodDto = {
  type: 'all',
  key: null,
  label: 'Toàn thời gian',
  from: null,
  toExclusive: null,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Kỳ thống kê từ query: có `month` + `year` → tháng; chỉ `year` → cả năm;
 * không có gì → toàn thời gian. Ngày dạng `YYYY-MM-DD`, cuối kỳ exclusive.
 */
export function resolveStudentDemographicsPeriod(params: {
  month?: string | null;
  year?: string | null;
}): StudentDemographicsPeriodDto {
  const year = params.year ? Number(params.year) : NaN;
  if (!Number.isInteger(year)) return ALL_TIME_PERIOD;
  const month = params.month ? Number(params.month) : NaN;
  if (Number.isInteger(month) && month >= 1 && month <= 12) {
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return {
      type: 'month',
      key: `${year}-${pad2(month)}`,
      label: `Tháng ${month}/${year}`,
      from: `${year}-${pad2(month)}-01`,
      toExclusive: `${nextYear}-${pad2(nextMonth)}-01`,
    };
  }
  return {
    type: 'year',
    key: String(year),
    label: `Năm ${year}`,
    from: `${year}-01-01`,
    toExclusive: `${year + 1}-01-01`,
  };
}

const PROVINCE_ALIAS_MAP: Record<string, string> = {
  hanoi: 'Hà Nội',
  'ha noi': 'Hà Nội',
  'tp ha noi': 'Hà Nội',
  'tp. ha noi': 'Hà Nội',
  'thành phố hà nội': 'Hà Nội',
  hcm: 'Hồ Chí Minh',
  'ho chi minh': 'Hồ Chí Minh',
  'tp ho chi minh': 'Hồ Chí Minh',
  'tp. ho chi minh': 'Hồ Chí Minh',
  'tp hcm': 'Hồ Chí Minh',
  'tp.hcm': 'Hồ Chí Minh',
  'thành phố hồ chí minh': 'Hồ Chí Minh',
  'sai gon': 'Hồ Chí Minh',
  'da nang': 'Đà Nẵng',
  'đà nẵng': 'Đà Nẵng',
  'tp da nang': 'Đà Nẵng',
  'hai phong': 'Hải Phòng',
  'hải phòng': 'Hải Phòng',
  'tp hai phong': 'Hải Phòng',
  'can tho': 'Cần Thơ',
  'cần thơ': 'Cần Thơ',
  'tp can tho': 'Cần Thơ',
  daklak: 'Đắk Lắk',
  'dak lak': 'Đắk Lắk',
  'đắc lắc': 'Đắk Lắk',
  'đắk lắk': 'Đắk Lắk',
  'đăk lăk': 'Đắk Lắk',
  'đac lac': 'Đắk Lắk',
  'phú thọ': 'Phú Thọ',
  'phu tho': 'Phú Thọ',
  'thanh hoá': 'Thanh Hóa',
  'thanh hóa': 'Thanh Hóa',
  'thanh hoa': 'Thanh Hóa',
  'bắc ninh': 'Bắc Ninh',
  'bac ninh': 'Bắc Ninh',
  'hưng yên': 'Hưng Yên',
  'hung yen': 'Hưng Yên',
  'lâm đồng': 'Lâm Đồng',
  'lam dong': 'Lâm Đồng',
  'ninh bình': 'Ninh Bình',
  'ninh binh': 'Ninh Bình',
  'đồng nai': 'Đồng Nai',
  'dong nai': 'Đồng Nai',
  'hà tĩnh': 'Hà Tĩnh',
  'ha tinh': 'Hà Tĩnh',
  'lào cai': 'Lào Cai',
  'lao cai': 'Lào Cai',
  'an giang': 'An Giang',
  'quảng ngãi': 'Quảng Ngãi',
  'quang ngai': 'Quảng Ngãi',
  'quảng ninh': 'Quảng Ninh',
  'quang ninh': 'Quảng Ninh',
  'tây ninh': 'Tây Ninh',
  'tay ninh': 'Tây Ninh',
  'thái nguyên': 'Thái Nguyên',
  'thai nguyen': 'Thái Nguyên',
  'gia lai': 'Gia Lai',
  'nghệ an': 'Nghệ An',
  'nghe an': 'Nghệ An',
  'cà mau': 'Cà Mau',
  'ca mau': 'Cà Mau',
  'cao bằng': 'Cao Bằng',
  'cao bang': 'Cao Bằng',
  'đồng tháp': 'Đồng Tháp',
  'dong thap': 'Đồng Tháp',
  'hà giang': 'Hà Giang',
  'ha giang': 'Hà Giang',
  'kiên giang': 'Kiên Giang',
  'kien giang': 'Kiên Giang',
  'quảng trị': 'Quảng Trị',
  'quang tri': 'Quảng Trị',
  'sơn la': 'Sơn La',
  'son la': 'Sơn La',
  'tuyên quang': 'Tuyên Quang',
  'tuyen quang': 'Tuyên Quang',
};

export function normalizeProvince(raw: string | null | undefined): string {
  if (!raw) return 'Chưa cập nhật';
  const clean = raw.trim().replace(/\s+/g, ' ');
  if (
    !clean ||
    clean.toLowerCase() === 'default' ||
    clean.toLowerCase() === 'none' ||
    clean.toLowerCase() === 'khác' ||
    clean.toLowerCase() === 'chưa rõ'
  ) {
    return 'Chưa cập nhật';
  }

  const lower = clean.toLowerCase();
  if (PROVINCE_ALIAS_MAP[lower]) {
    return PROVINCE_ALIAS_MAP[lower];
  }

  // Capitalize title-case
  return clean
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const MISSING_BIRTH_YEAR_LABEL = 'Chưa cập nhật';
export const MISSING_PROVINCE_LABEL = 'Chưa cập nhật';
/** Độ tuổi phổ thông dùng để đánh dấu năm sinh cần rà soát. */
export const NORMAL_AGE_RANGE = { min: 6, max: 19 } as const;

export function isValidBirthYear(
  birthYear: number | null | undefined,
  currentYear = new Date().getFullYear(),
): birthYear is number {
  return (
    typeof birthYear === 'number' &&
    Number.isFinite(birthYear) &&
    birthYear >= 1950 &&
    birthYear <= currentYear + 1
  );
}

export function formatBirthYearLabel(
  birthYear: number | null,
  currentYear = new Date().getFullYear(),
): string {
  if (!isValidBirthYear(birthYear, currentYear)) {
    return MISSING_BIRTH_YEAR_LABEL;
  }
  const age = currentYear - birthYear;
  return `${birthYear} (${age} tuổi)`;
}

export const UNASSIGNED_COURSE_KEY = '__unassigned__';
export const UNASSIGNED_COURSE_NAME = 'Chưa xếp lớp';
/** Doanh thu từ lớp không gắn khoá (hiếm). */
export const NO_COURSE_KEY = '__no_course__';
export const NO_COURSE_NAME = 'Lớp chưa gắn khoá';

function toNumber(value: number | bigint | string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function sortBirthYearsAsc<T extends { birthYear: number | null }>(
  list: T[],
): T[] {
  return list.sort((a, b) => {
    if (a.birthYear == null) return 1;
    if (b.birthYear == null) return -1;
    return a.birthYear - b.birthYear;
  });
}

type StudentAgg = {
  studentId: string;
  fullName: string;
  status: string | null;
  school: string | null;
  province: string;
  rawBirthYear: number | null;
  birthYear: number | null;
  birthYearLabel: string;
  totalTopup: number;
  totalRevenue: number;
  attendanceCount: number;
  revenueByCourse: Map<string, number>;
  /** Khoá đang ghi danh (theo student_classes). */
  courses: Map<string, { courseId: string; courseName: string }>;
  classIds: Set<string>;
  classNames: Set<string>;
};

/** Khoá ghi danh của học sinh; rỗng = Chưa xếp lớp. */
function enrolledCourseKeys(s: StudentAgg): string[] {
  return s.courses.size === 0 ? [UNASSIGNED_COURSE_KEY] : [...s.courses.keys()];
}

function countCategories(
  students: StudentAgg[],
): StudentDemographicsCategoryItemDto[] {
  const map = new Map<string, { courseName: string; count: number }>();
  for (const s of students) {
    if (s.courses.size === 0) {
      const cur = map.get(UNASSIGNED_COURSE_KEY) || {
        courseName: UNASSIGNED_COURSE_NAME,
        count: 0,
      };
      cur.count++;
      map.set(UNASSIGNED_COURSE_KEY, cur);
    } else {
      for (const [cId, cData] of s.courses) {
        const cur = map.get(cId) || { courseName: cData.courseName, count: 0 };
        cur.count++;
        map.set(cId, cur);
      }
    }
  }
  return Array.from(map.entries())
    .map(([cId, d]) => ({
      courseId: cId === UNASSIGNED_COURSE_KEY ? null : cId,
      courseName: d.courseName,
      studentCount: d.count,
    }))
    .sort((a, b) => b.studentCount - a.studentCount);
}

const sumBy = (list: StudentAgg[], pick: (s: StudentAgg) => number) =>
  list.reduce((sum, s) => sum + pick(s), 0);

function groupBy<K>(list: StudentAgg[], key: (s: StudentAgg) => K) {
  const map = new Map<K, StudentAgg[]>();
  for (const s of list) {
    const k = key(s);
    const arr = map.get(k) || [];
    arr.push(s);
    map.set(k, arr);
  }
  return map;
}

function averageAge(list: StudentAgg[], currentYear: number): number | null {
  const years = list
    .map((s) => s.birthYear)
    .filter((y): y is number => y != null);
  if (years.length === 0) return null;
  const avg =
    years.reduce((sum, y) => sum + (currentYear - y), 0) / years.length;
  return Math.round(avg * 10) / 10;
}

export function aggregateStudentDemographics(
  rawRows: RawStudentDemographicsRow[],
  activeCourses: RawCourseRow[],
  currentYear = new Date().getFullYear(),
  statusFilter?: 'all' | 'active' | 'inactive',
  revenueRows: RawStudentRevenueRow[] = [],
  courseFinanceRows: RawCourseFinanceRow[] = [],
  period: StudentDemographicsPeriodDto = ALL_TIME_PERIOD,
): AdminDashboardStudentDemographicsDto {
  const studentMap = new Map<string, StudentAgg>();

  for (const row of rawRows) {
    let student = studentMap.get(row.studentId);
    if (!student) {
      const rawBirthYear =
        typeof row.birthYear === 'number' && Number.isFinite(row.birthYear)
          ? row.birthYear
          : row.birthYear == null
            ? null
            : toNumber(row.birthYear) || null;
      const birthYear = isValidBirthYear(rawBirthYear, currentYear)
        ? rawBirthYear
        : null;
      student = {
        studentId: row.studentId,
        fullName: row.fullName,
        status: row.status ?? null,
        school: row.school?.trim() || null,
        province: normalizeProvince(row.province),
        rawBirthYear,
        birthYear,
        birthYearLabel: formatBirthYearLabel(birthYear, currentYear),
        totalTopup: toNumber(row.totalTopup),
        totalRevenue: 0,
        attendanceCount: 0,
        revenueByCourse: new Map(),
        courses: new Map(),
        classIds: new Set(),
        classNames: new Set(),
      };
      studentMap.set(row.studentId, student);
    }

    if (row.classId) {
      student.classIds.add(row.classId);
      if (row.className) student.classNames.add(row.className.trim());
    }

    if (row.courseId && row.courseName) {
      student.courses.set(row.courseId, {
        courseId: row.courseId,
        courseName: row.courseName.trim(),
      });
    }
  }

  // Doanh thu theo khoá của lớp có buổi học (không phụ thuộc lớp đang ghi danh).
  const revenueCourseNames = new Map<string, string>();
  for (const r of revenueRows) {
    const student = studentMap.get(r.studentId);
    if (!student) continue;
    const amount = toNumber(r.revenue);
    const key = r.courseId ?? NO_COURSE_KEY;
    if (!revenueCourseNames.has(key)) {
      revenueCourseNames.set(
        key,
        r.courseId ? (r.courseName?.trim() ?? 'Khoá học') : NO_COURSE_NAME,
      );
    }
    student.revenueByCourse.set(
      key,
      (student.revenueByCourse.get(key) || 0) + amount,
    );
    student.totalRevenue += amount;
    student.attendanceCount += toNumber(r.attendanceCount);
  }

  const allStudents = Array.from(studentMap.values());
  const totalActiveStudents = allStudents.length;

  let enrolledStudentsCount = 0;
  let unenrolledStudentsCount = 0;
  for (const s of allStudents) {
    if (s.courses.size > 0 || s.classIds.size > 0) {
      enrolledStudentsCount++;
    } else {
      unenrolledStudentsCount++;
    }
  }

  const courseMetaMap = new Map<
    string,
    { courseId: string; courseName: string; sortOrder: number }
  >();
  for (const c of activeCourses) {
    courseMetaMap.set(c.id, {
      courseId: c.id,
      courseName: c.name.trim(),
      sortOrder: c.sortOrder,
    });
  }

  const courseClassCountMap = new Map<string, Set<string>>();
  for (const row of rawRows) {
    if (row.courseId && row.classId) {
      const set = courseClassCountMap.get(row.courseId) || new Set();
      set.add(row.classId);
      courseClassCountMap.set(row.courseId, set);
    }
  }

  const categoryStudentCountMap = new Map<string, number>();
  const courseNameByKey = new Map<string, string>();
  for (const s of allStudents) {
    for (const key of enrolledCourseKeys(s)) {
      categoryStudentCountMap.set(
        key,
        (categoryStudentCountMap.get(key) || 0) + 1,
      );
      if (key !== UNASSIGNED_COURSE_KEY && !courseNameByKey.has(key)) {
        courseNameByKey.set(key, s.courses.get(key)!.courseName);
      }
    }
  }

  const categoryRevenueMap = new Map<string, number>();
  for (const s of allStudents) {
    for (const [key, amount] of s.revenueByCourse) {
      categoryRevenueMap.set(key, (categoryRevenueMap.get(key) || 0) + amount);
    }
  }

  const categoriesOverview: AdminDashboardStudentDemographicsDto['categories'] =
    [];
  const pushedKeys = new Set<string>();
  const pushCategory = (key: string, courseName: string) => {
    if (pushedKeys.has(key)) return;
    pushedKeys.add(key);
    categoriesOverview.push({
      courseId: key,
      courseName,
      studentCount: categoryStudentCountMap.get(key) || 0,
      classCount: courseClassCountMap.get(key)?.size || 0,
      totalRevenue: categoryRevenueMap.get(key) || 0,
    });
  };

  for (const [courseId, meta] of courseMetaMap) {
    if (
      (categoryStudentCountMap.get(courseId) || 0) > 0 ||
      (categoryRevenueMap.get(courseId) || 0) > 0
    ) {
      pushCategory(courseId, meta.courseName);
    }
  }
  for (const [courseId, count] of categoryStudentCountMap) {
    if (courseId !== UNASSIGNED_COURSE_KEY && count > 0) {
      pushCategory(courseId, courseNameByKey.get(courseId) ?? 'Khoá học');
    }
  }
  for (const [key, amount] of categoryRevenueMap) {
    if (key !== NO_COURSE_KEY && amount > 0) {
      pushCategory(key, revenueCourseNames.get(key) ?? 'Khoá học');
    }
  }

  categoriesOverview.sort(
    (a, b) =>
      b.studentCount - a.studentCount || b.totalRevenue - a.totalRevenue,
  );

  if (unenrolledStudentsCount > 0) {
    categoriesOverview.push({
      courseId: null,
      courseName: UNASSIGNED_COURSE_NAME,
      studentCount: unenrolledStudentsCount,
      classCount: 0,
      totalRevenue: 0,
    });
  }
  if ((categoryRevenueMap.get(NO_COURSE_KEY) || 0) > 0) {
    categoriesOverview.push({
      courseId: NO_COURSE_KEY,
      courseName: NO_COURSE_NAME,
      studentCount: 0,
      classCount: 0,
      totalRevenue: categoryRevenueMap.get(NO_COURSE_KEY) || 0,
    });
  }

  // Group by Province
  const byProvince: StudentDemographicsProvinceGroupDto[] = [];
  for (const [province, pStudents] of groupBy(allStudents, (s) => s.province)) {
    const birthYears: StudentDemographicsBirthYearGroupDto[] = [];
    for (const [bYear, bStudents] of groupBy(pStudents, (s) => s.birthYear)) {
      birthYears.push({
        birthYear: bYear,
        label: formatBirthYearLabel(bYear, currentYear),
        studentCount: bStudents.length,
        totalTopup: sumBy(bStudents, (s) => s.totalTopup),
        totalRevenue: sumBy(bStudents, (s) => s.totalRevenue),
        categories: countCategories(bStudents),
      });
    }

    byProvince.push({
      province,
      studentCount: pStudents.length,
      percentage: percentOf(pStudents.length, totalActiveStudents),
      totalTopup: sumBy(pStudents, (s) => s.totalTopup),
      totalRevenue: sumBy(pStudents, (s) => s.totalRevenue),
      birthYears: sortBirthYearsAsc(birthYears),
      categories: countCategories(pStudents),
    });
  }

  byProvince.sort((a, b) => {
    if (b.studentCount !== a.studentCount) {
      return b.studentCount - a.studentCount;
    }
    if (a.province === MISSING_PROVINCE_LABEL) return 1;
    if (b.province === MISSING_PROVINCE_LABEL) return -1;
    return a.province.localeCompare(b.province, 'vi');
  });

  // Group by Birth Year overall
  const byBirthYear: StudentDemographicsBirthYearSummaryDto[] = [];
  for (const [bYear, bStudents] of groupBy(allStudents, (s) => s.birthYear)) {
    const bProvMap = new Map<string, number>();
    for (const s of bStudents) {
      bProvMap.set(s.province, (bProvMap.get(s.province) || 0) + 1);
    }
    byBirthYear.push({
      birthYear: bYear,
      label: formatBirthYearLabel(bYear, currentYear),
      studentCount: bStudents.length,
      percentage: percentOf(bStudents.length, totalActiveStudents),
      totalTopup: sumBy(bStudents, (s) => s.totalTopup),
      totalRevenue: sumBy(bStudents, (s) => s.totalRevenue),
      provinces: Array.from(bProvMap.entries())
        .map(([province, count]) => ({ province, studentCount: count }))
        .sort((a, b) => b.studentCount - a.studentCount),
      categories: countCategories(bStudents),
    });
  }
  sortBirthYearsAsc(byBirthYear);

  const matrixColumns: Array<{ key: string; label: string }> =
    categoriesOverview.map((cat) => ({
      key: cat.courseId ?? UNASSIGNED_COURSE_KEY,
      label: cat.courseName,
    }));

  const buildCells = (students: StudentAgg[]) => {
    const cells: Record<string, number> = {};
    const revenueCells: Record<string, number> = {};
    for (const col of matrixColumns) {
      cells[col.key] = 0;
      revenueCells[col.key] = 0;
    }
    for (const s of students) {
      for (const key of enrolledCourseKeys(s)) {
        cells[key] = (cells[key] || 0) + 1;
      }
      for (const [key, amount] of s.revenueByCourse) {
        revenueCells[key] = (revenueCells[key] || 0) + amount;
      }
    }
    return { cells, revenueCells };
  };

  const provinceGroups = groupBy(allStudents, (s) => s.province);
  const provinceMatrixRows = byProvince.map((p) => ({
    province: p.province,
    totalStudents: p.studentCount,
    totalTopup: p.totalTopup,
    totalRevenue: p.totalRevenue,
    ...buildCells(provinceGroups.get(p.province) ?? []),
  }));

  const birthYearGroups = groupBy(allStudents, (s) => s.birthYear);
  const birthYearMatrixRows = byBirthYear.map((by) => ({
    birthYear: by.birthYear,
    label: by.label,
    totalStudents: by.studentCount,
    totalTopup: by.totalTopup,
    totalRevenue: by.totalRevenue,
    ...buildCells(birthYearGroups.get(by.birthYear) ?? []),
  }));

  // Lợi nhuận khoá = học phí − gia sư − QL lớp − CSKH (toàn bộ học sinh).
  const financeByKey = new Map<
    string,
    {
      revenue: number;
      teacherCost: number;
      trainingManagerCost: number;
      customerCareCost: number;
    }
  >();
  for (const r of courseFinanceRows) {
    const key = r.courseId ?? NO_COURSE_KEY;
    const cur = financeByKey.get(key) || {
      revenue: 0,
      teacherCost: 0,
      trainingManagerCost: 0,
      customerCareCost: 0,
    };
    cur.revenue += toNumber(r.revenue);
    cur.teacherCost += toNumber(r.teacherCost);
    cur.trainingManagerCost += toNumber(r.trainingManagerCost);
    cur.customerCareCost += toNumber(r.customerCareCost);
    financeByKey.set(key, cur);
  }
  const profitOf = (f: {
    revenue: number;
    teacherCost: number;
    trainingManagerCost: number;
    customerCareCost: number;
  }) => f.revenue - f.teacherCost - f.trainingManagerCost - f.customerCareCost;
  const totalProfit = [...financeByKey.values()].reduce(
    (sum, f) => sum + profitOf(f),
    0,
  );

  // Phân tích theo từng khoá: độ tuổi, khu vực, doanh thu.
  const totalRevenue = sumBy(allStudents, (s) => s.totalRevenue);
  const byCourse: StudentDemographicsCourseBreakdownDto[] =
    categoriesOverview.map((cat) => {
      const key = cat.courseId ?? UNASSIGNED_COURSE_KEY;
      const members = allStudents.filter((s) =>
        enrolledCourseKeys(s).includes(key),
      );
      const courseRevenue = sumBy(
        allStudents,
        (s) => s.revenueByCourse.get(key) || 0,
      );
      const payingCount = allStudents.filter(
        (s) => (s.revenueByCourse.get(key) || 0) > 0,
      ).length;
      const validYears = members
        .map((s) => s.birthYear)
        .filter((y): y is number => y != null);

      const birthYears = sortBirthYearsAsc(
        Array.from(groupBy(members, (s) => s.birthYear).entries()).map(
          ([bYear, list]) => ({
            birthYear: bYear,
            label: formatBirthYearLabel(bYear, currentYear),
            studentCount: list.length,
            percentage: percentOf(list.length, members.length),
            totalRevenue: sumBy(list, (s) => s.revenueByCourse.get(key) || 0),
          }),
        ),
      );
      const topYear = [...birthYears]
        .filter((y) => y.birthYear != null)
        .sort(
          (a, b) =>
            b.studentCount - a.studentCount ||
            (a.birthYear ?? 0) - (b.birthYear ?? 0),
        )[0];

      const provMap = new Map<string, number>();
      for (const s of members) {
        provMap.set(s.province, (provMap.get(s.province) || 0) + 1);
      }

      const finance = financeByKey.get(key) || {
        revenue: 0,
        teacherCost: 0,
        trainingManagerCost: 0,
        customerCareCost: 0,
      };
      const profit = profitOf(finance);

      return {
        key,
        courseId: cat.courseId === NO_COURSE_KEY ? null : cat.courseId,
        courseName: cat.courseName,
        studentCount: members.length,
        classCount: cat.classCount,
        percentage: percentOf(members.length, totalActiveStudents),
        totalTopup: sumBy(members, (s) => s.totalTopup),
        totalRevenue: courseRevenue,
        averageRevenue:
          payingCount > 0 ? Math.round(courseRevenue / payingCount) : 0,
        revenueShare: percentOf(courseRevenue, totalRevenue),
        profitRevenue: finance.revenue,
        teacherCost: finance.teacherCost,
        trainingManagerCost: finance.trainingManagerCost,
        customerCareCost: finance.customerCareCost,
        totalCost:
          finance.teacherCost +
          finance.trainingManagerCost +
          finance.customerCareCost,
        profit,
        profitMargin: percentOf(profit, finance.revenue),
        profitShare: percentOf(profit, totalProfit),
        averageAge: averageAge(members, currentYear),
        minBirthYear: validYears.length ? Math.min(...validYears) : null,
        maxBirthYear: validYears.length ? Math.max(...validYears) : null,
        topBirthYear: topYear?.birthYear ?? null,
        missingBirthYearCount: members.filter((s) => s.birthYear == null)
          .length,
        birthYears,
        provinces: Array.from(provMap.entries())
          .map(([province, studentCount]) => ({ province, studentCount }))
          .sort(
            (a, b) =>
              b.studentCount - a.studentCount ||
              a.province.localeCompare(b.province, 'vi'),
          ),
      };
    });

  // Danh sách học sinh
  const courseLabelByKey = new Map(matrixColumns.map((c) => [c.key, c.label]));
  const toStudentRow = (s: StudentAgg): StudentDemographicsStudentRowDto => {
    const courseKeys = enrolledCourseKeys(s);
    return {
      studentId: s.studentId,
      fullName: s.fullName,
      status: s.status,
      school: s.school,
      province: s.province,
      birthYear: s.birthYear,
      rawBirthYear: s.rawBirthYear,
      birthYearLabel: s.birthYearLabel,
      age: s.birthYear != null ? currentYear - s.birthYear : null,
      classNames: [...s.classNames].sort((a, b) => a.localeCompare(b, 'vi')),
      courseKeys,
      courseNames: courseKeys.map((k) => courseLabelByKey.get(k) ?? k),
      totalTopup: s.totalTopup,
      totalRevenue: s.totalRevenue,
      revenueByCourse: Object.fromEntries(s.revenueByCourse),
      attendanceCount: s.attendanceCount,
    };
  };
  const students = allStudents
    .map(toStudentRow)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));

  const missingBirthYear = students.filter((s) => s.birthYear == null);
  const unusualBirthYear = students
    .filter(
      (s) =>
        s.age != null &&
        (s.age < NORMAL_AGE_RANGE.min || s.age > NORMAL_AGE_RANGE.max),
    )
    .sort((a, b) => (a.birthYear ?? 0) - (b.birthYear ?? 0));

  // Summary KPI
  const realProvinces = byProvince.filter(
    (p) => p.province !== MISSING_PROVINCE_LABEL,
  );
  const topProvince =
    realProvinces[0]?.province ?? byProvince[0]?.province ?? null;

  const topBirthYear =
    [...byBirthYear]
      .filter((y) => y.birthYear != null)
      .sort((a, b) => b.studentCount - a.studentCount)[0]?.birthYear ?? null;

  const realCategories = categoriesOverview.filter(
    (c) => c.courseId != null && c.courseId !== NO_COURSE_KEY,
  );
  const topCategory = realCategories[0]?.courseName ?? null;
  const topRevenueCategory =
    [...realCategories]
      .filter((c) => c.totalRevenue > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)[0]?.courseName ?? null;

  const totalTopup = sumBy(allStudents, (s) => s.totalTopup);
  const revenueStudentsCount = allStudents.filter(
    (s) => s.totalRevenue > 0,
  ).length;

  return {
    period,
    summary: {
      statusFilter,
      totalActiveStudents,
      enrolledStudentsCount,
      unenrolledStudentsCount,
      totalProvincesCount: realProvinces.length,
      totalCategoriesCount: realCategories.length,
      totalTopup,
      averageTopup:
        totalActiveStudents > 0
          ? Math.round(totalTopup / totalActiveStudents)
          : 0,
      totalRevenue,
      averageRevenue:
        revenueStudentsCount > 0
          ? Math.round(totalRevenue / revenueStudentsCount)
          : 0,
      revenueStudentsCount,
      totalProfit,
      topProvince,
      topBirthYear,
      topCategory,
      topRevenueCategory,
      averageAge: averageAge(allStudents, currentYear),
      missingBirthYearCount: missingBirthYear.length,
      unusualBirthYearCount: unusualBirthYear.length,
    },
    categories: categoriesOverview,
    byProvince,
    byBirthYear,
    byCourse,
    provinceMatrix: {
      columns: matrixColumns,
      rows: provinceMatrixRows,
    },
    birthYearMatrix: {
      columns: matrixColumns,
      rows: birthYearMatrixRows,
    },
    students,
    dataQuality: {
      missingBirthYear,
      unusualBirthYear,
      normalAgeRange: { ...NORMAL_AGE_RANGE },
    },
    generatedAt: new Date().toISOString(),
  };
}
