import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  BadGatewayException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { StudentClassStatus } from 'generated/enums';

interface RawLevelModule {
  title: string;
  contest_key: string;
  solved: number;
  total: number;
  percent: number;
}

interface RawRoadmapLevel {
  level: number;
  title: string;
  solved: number;
  total: number;
  percent: number;
  contest_count: number;
  modules?: RawLevelModule[];
}

interface RawCurrentLevel {
  level?: number;
  title?: string;
  solved_count?: number;
  window_days?: number;
}

interface RawSummary {
  problem_count?: number;
  performance_points?: number;
  contribution_points?: number;
  rating?: number | null;
  total_submissions?: number;
  ac_submissions?: number;
  ac_rate?: number;
  distinct_attempted?: number;
  first_submission?: string;
  last_submission?: string;
  current_level?: RawCurrentLevel;
}

interface RawDailyProgress {
  labels?: string[];
  cumulative?: number[];
  daily?: number[];
}

interface RawReportData {
  student: {
    id: number;
    username: string;
    display_name: string;
  };
  generated_at?: string;
  summary?: RawSummary;
  result_breakdown?: unknown;
  roadmap_levels?: RawRoadmapLevel[];
  module_rows?: unknown[];
  started_module_rows?: unknown[];
  curriculum_summary?: unknown;
  daily_progress?: RawDailyProgress;
  streak?: unknown;
}

interface UniojEnvelope<T> {
  api_version: string;
  method: string;
  fetched: string;
  caller: {
    id: number;
    username: string;
  };
  data: T;
}

interface StudentLookupResponse {
  username: string;
  display_name: string;
  user_id: number;
  query: string;
}

interface ErrorResponse {
  detail?: string;
  candidates?: string[];
}

export interface ReportStats {
  thisWeekCount: number;
  thisWeekDiff: number;
  activeDaysCount: number;
  bestDayCount: number;
  totalSolved: number;
  currentLevel: string;
  currentLevelName: string;
  totalPoints: number;
  acRate: number;
  totalSubmissions: number;
  startedAt: string;
}

export interface DailyProgressEntry {
  date: string;
  solvedCumulative: number;
  solvedDaily: number;
}

export interface RoadmapLevelEntry {
  levelCode: number;
  levelName: string;
  progress: number;
  solvedCount: number;
  totalCount: number;
  contestsCount: number;
  modulesCount: number;
}

export interface RoadmapModuleEntry {
  levelCode: number;
  levelName: string;
  moduleName: string;
  solvedCount: number;
  totalCount: number;
  progress: number;
  status: string;
}

export interface TransformedReportData {
  student: {
    username: string;
    displayName: string;
    pdfUrl: string;
  };
  stats: ReportStats;
  dailyProgress: DailyProgressEntry[];
  roadmapLevels: RoadmapLevelEntry[];
  roadmapModules: RoadmapModuleEntry[];
}

@Injectable()
export class UniojService {
  private readonly logger = new Logger(UniojService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultBaseUrl = 'https://oj.uniedu.vn';

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = this.config.get<string>('UNIOJ_API_KEY', '');
    this.baseUrl = this.normalizeBaseUrl(
      this.config.get<string>('UNIOJ_BASE_URL', this.defaultBaseUrl),
    );
  }

  private normalizeBaseUrl(value?: string): string {
    const rawValue = value?.trim() || this.defaultBaseUrl;

    try {
      const url = new URL(rawValue);
      const host = url.hostname.toLowerCase();

      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
        this.logger.warn(
          `Ignoring invalid UNIOJ_BASE_URL=${rawValue}; using ${this.defaultBaseUrl}.`,
        );
        return this.defaultBaseUrl;
      }

      return url.origin;
    } catch {
      this.logger.warn(
        `Ignoring malformed UNIOJ_BASE_URL=${rawValue}; using ${this.defaultBaseUrl}.`,
      );
      return this.defaultBaseUrl;
    }
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private describeUpstreamErrorData(data: unknown): string {
    if (data == null) {
      return 'empty';
    }
    if (typeof data === 'string') {
      return data.slice(0, 500);
    }
    if (Buffer.isBuffer(data)) {
      return data.toString('utf8', 0, Math.min(data.length, 500));
    }
    if (typeof data === 'object') {
      const detail = (data as ErrorResponse).detail;
      if (typeof detail === 'string') {
        return detail;
      }

      try {
        return JSON.stringify(data);
      } catch {
        return `[unserializable ${data.constructor?.name ?? 'object'}]`;
      }
    }

    return String(data);
  }

  private getUpstreamErrorDetail(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') {
      return undefined;
    }

    const detail = (data as ErrorResponse).detail;
    return typeof detail === 'string' ? detail : undefined;
  }

  private extractUpstreamErrorMessage(text: string): string {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return '';
    }

    try {
      const parsed = JSON.parse(trimmedText) as {
        detail?: unknown;
        message?: unknown;
        error?: { message?: unknown };
      };
      if (typeof parsed.error?.message === 'string') {
        return parsed.error.message;
      }
      if (typeof parsed.detail === 'string') {
        return parsed.detail;
      }
      if (typeof parsed.message === 'string') {
        return parsed.message;
      }
    } catch {
      // Upstream may return plain text instead of JSON.
    }

    return trimmedText;
  }

  private isReadableStream(data: unknown): data is Readable {
    return (
      !!data &&
      typeof data === 'object' &&
      typeof (data as Readable).on === 'function' &&
      typeof (data as Readable)[Symbol.asyncIterator] === 'function'
    );
  }

  private async readUpstreamStreamSnippet(
    data: unknown,
  ): Promise<string | undefined> {
    if (!this.isReadableStream(data)) {
      return undefined;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const maxBytes = 4096;

    try {
      for await (const chunk of data) {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(String(chunk));
        chunks.push(buffer);
        totalBytes += buffer.length;
        if (totalBytes >= maxBytes) {
          break;
        }
      }
    } catch {
      return undefined;
    }

    return Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8').trim();
  }

  private async describeUpstreamPdfErrorData(data: unknown): Promise<string> {
    const streamSnippet = await this.readUpstreamStreamSnippet(data);
    return streamSnippet
      ? this.extractUpstreamErrorMessage(streamSnippet)
      : this.describeUpstreamErrorData(data);
  }

  private async getUpstreamPdfErrorDetail(
    data: unknown,
  ): Promise<string | undefined> {
    const detail = this.getUpstreamErrorDetail(data);
    if (detail) {
      return detail;
    }

    const streamSnippet = await this.readUpstreamStreamSnippet(data);
    return streamSnippet
      ? this.extractUpstreamErrorMessage(streamSnippet)
      : undefined;
  }

  private formatStartedAt(firstSubmissionStr?: string): string {
    if (!firstSubmissionStr) return '—';
    try {
      const date = new Date(firstSubmissionStr);
      const months = [
        'Tháng 1',
        'Tháng 2',
        'Tháng 3',
        'Tháng 4',
        'Tháng 5',
        'Tháng 6',
        'Tháng 7',
        'Tháng 8',
        'Tháng 9',
        'Tháng 10',
        'Tháng 11',
        'Tháng 12',
      ];
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    } catch {
      return firstSubmissionStr;
    }
  }

  private buildStudentReportPdfUrl(username: string, days?: number): string {
    const url = new URL(
      `/api/student-report/${encodeURIComponent(username)}/pdf/`,
      this.baseUrl,
    );
    if (days) {
      url.searchParams.set('days', String(days));
    }
    return url.toString();
  }

  private transformReportData(
    rData: RawReportData,
    days?: number,
  ): TransformedReportData {
    const summary = rData.summary || {};
    const curriculum = summary.current_level || {};
    const dailyProgressRaw = rData.daily_progress || {
      labels: [],
      cumulative: [],
      daily: [],
    };

    // 1. Calculate stats
    const dailyList = dailyProgressRaw.daily || [];
    const activeDaysCount = dailyList.filter((d: number) => d > 0).length;
    const bestDayCount = dailyList.length > 0 ? Math.max(...dailyList) : 0;

    // Sum last 7 days of daily list for this week
    const last7Days = dailyList.slice(-7);
    const thisWeekCount = last7Days.reduce(
      (acc: number, curr: number) => acc + curr,
      0,
    );

    // Sum previous 7 days (days -14 to -7) for diff
    const prev7Days = dailyList.slice(-14, -7);
    const prevWeekCount = prev7Days.reduce(
      (acc: number, curr: number) => acc + curr,
      0,
    );
    const thisWeekDiff = thisWeekCount - prevWeekCount;

    const stats = {
      thisWeekCount,
      thisWeekDiff,
      activeDaysCount,
      bestDayCount,
      totalSolved: summary.problem_count || 0,
      currentLevel:
        curriculum.level != null ? `Cấp ${curriculum.level}` : 'Cấp 0',
      currentLevelName: curriculum.title || 'Chưa phân cấp',
      totalPoints: parseFloat((summary.performance_points || 0).toFixed(1)),
      acRate: summary.ac_rate || 0,
      totalSubmissions: summary.total_submissions || 0,
      startedAt: this.formatStartedAt(summary.first_submission),
    };

    // 2. Map dailyProgress
    const dailyProgress = (dailyProgressRaw.labels || []).map(
      (label: string, idx: number) => {
        let dateStr = label;
        try {
          const parts = label.split('-');
          if (parts.length === 3) {
            dateStr = `${parts[2]}/${parts[1]}`;
          }
        } catch {
          // ignore error
        }

        return {
          date: dateStr,
          solvedCumulative: dailyProgressRaw.cumulative?.[idx] || 0,
          solvedDaily: dailyProgressRaw.daily?.[idx] || 0,
        };
      },
    );

    // 3. Map roadmapLevels
    const roadmapLevels = (rData.roadmap_levels || []).map(
      (level: RawRoadmapLevel) => {
        return {
          levelCode: level.level,
          levelName: level.title,
          progress: level.percent || 0,
          solvedCount: level.solved || 0,
          totalCount: level.total || 0,
          contestsCount: level.contest_count || 0,
          modulesCount: level.modules?.length || 0,
        };
      },
    );

    // 4. Map roadmapModules
    const roadmapModules: RoadmapModuleEntry[] = [];
    for (const level of rData.roadmap_levels || []) {
      for (const mod of level.modules || []) {
        roadmapModules.push({
          levelCode: level.level,
          levelName: `Cấp ${level.level}`,
          moduleName: mod.title,
          solvedCount: mod.solved || 0,
          totalCount: mod.total || 0,
          progress: mod.percent || 0,
          status: mod.percent === 100 ? 'Đã Hoàn Thành' : 'Đang thi',
        });
      }
    }

    return {
      student: {
        username: rData.student.username,
        displayName: rData.student.display_name,
        pdfUrl: this.buildStudentReportPdfUrl(rData.student.username, days),
      },
      stats,
      dailyProgress,
      roadmapLevels,
      roadmapModules,
    };
  }

  async lookupUsername(name: string): Promise<string> {
    if (!name || name.trim() === '') {
      throw new BadRequestException('Tên học viên không được để trống.');
    }
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'Cấu hình UNIOJ API Key bị thiếu.',
      );
    }

    const url = `${this.baseUrl}/api/student-lookup/`;
    try {
      this.logger.log(`Looking up student name on UNIOJ: ${name}`);
      const response = await this.httpService.axiosRef.get<
        UniojEnvelope<StudentLookupResponse>
      >(url, {
        params: { name },
        headers: this.getHeaders(),
      });
      const data = response.data?.data;
      if (data && data.username) {
        return data.username;
      }
      throw new NotFoundException(
        `Không tìm thấy username cho học viên ${name}`,
      );
    } catch (error: any) {
      // If we threw a NotFoundException/BadRequestException/etc ourselves in the try block, let it bubble up
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      const axiosError = error as {
        response?: { status?: number; data?: ErrorResponse };
        message?: string;
      };
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;
      this.logger.error(
        `UNIOJ student-lookup failed: status=${status}, data=${this.describeUpstreamErrorData(data)}`,
      );

      if (status === 404) {
        throw new NotFoundException(
          `Không tìm thấy học viên "${name}" trên hệ thống UNIOJ.`,
        );
      }
      if (status === 409) {
        throw new ConflictException({
          message: `Tìm thấy nhiều học viên trùng tên "${name}" trên hệ thống UNIOJ.`,
          candidates: data?.candidates || [],
        });
      }
      if (status === 401) {
        throw new UnauthorizedException(
          'API key của UNIOJ không hợp lệ hoặc hết hạn.',
        );
      }
      throw new InternalServerErrorException(
        this.getUpstreamErrorDetail(data) ||
          axiosError.message ||
          'Lỗi kết nối tới hệ thống UNIOJ.',
      );
    }
  }

  async getStudentReport(name: string, days?: number): Promise<any> {
    const username = await this.lookupUsername(name);
    const url = `${this.baseUrl}/api/student-report/${username}/`;

    try {
      this.logger.log(`Fetching UNIOJ report for ${username} (days=${days})`);
      const response = await this.httpService.axiosRef.get<
        UniojEnvelope<RawReportData>
      >(url, {
        params: days ? { days } : {},
        headers: this.getHeaders(),
      });
      const rawReportData = response.data?.data;
      if (!rawReportData) {
        throw new NotFoundException(
          `Dữ liệu báo cáo cho học viên "${name}" trống.`,
        );
      }
      return this.transformReportData(rawReportData, days);
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      const axiosError = error as {
        response?: { status?: number; data?: ErrorResponse };
        message?: string;
      };
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;
      this.logger.error(
        `UNIOJ student-report failed: status=${status}, data=${this.describeUpstreamErrorData(data)}`,
      );

      if (status === 404) {
        throw new NotFoundException(
          `Không tìm thấy báo cáo cho học viên "${name}" (${username}) trên UNIOJ.`,
        );
      }
      if (status === 401) {
        throw new UnauthorizedException(
          'API key của UNIOJ không hợp lệ hoặc hết hạn.',
        );
      }
      throw new InternalServerErrorException(
        this.getUpstreamErrorDetail(data) ||
          axiosError.message ||
          'Lỗi tải báo cáo từ UNIOJ.',
      );
    }
  }

  async getStudentReportPdf(
    name: string,
    days?: number,
  ): Promise<{
    data: Readable;
    headers: Record<string, string | undefined>;
  }> {
    const username = await this.lookupUsername(name);
    const url = `${this.baseUrl}/api/student-report/${username}/pdf/`;

    try {
      this.logger.log(
        `Fetching UNIOJ PDF report for ${username} (days=${days})`,
      );

      const pdfResponse = await this.httpService.axiosRef.get(url, {
        params: days ? { days } : {},
        headers: this.getHeaders(),
        responseType: 'stream',
        validateStatus: () => true,
      });

      const status = pdfResponse.status;
      if (status >= 400) {
        const detail = await this.getUpstreamPdfErrorDetail(pdfResponse.data);
        this.logger.error(
          `UNIOJ PDF report fetch failed: status=${status}, data=${detail || 'empty'}`,
        );

        if (status === 404) {
          throw new NotFoundException(
            `Không tìm thấy báo cáo cho học viên "${name}" (${username}) trên UNIOJ.`,
          );
        }
        if (status === 401) {
          throw new UnauthorizedException(
            'API key của UNIOJ không hợp lệ hoặc hết hạn.',
          );
        }
        if (status === 403) {
          throw new ForbiddenException(
            'Tài khoản UNIOJ chưa có quyền xem báo cáo PDF học viên.',
          );
        }
        if (status === 503) {
          throw new ServiceUnavailableException(
            detail || 'UNIOJ chưa sẵn sàng trả file PDF báo cáo.',
          );
        }
        throw new BadGatewayException(
          detail || 'Không thể tải file PDF báo cáo từ UNIOJ.',
        );
      }

      // axios 1.20 nới kiểu giá trị header thành string | number | boolean |
      // string[] | AxiosHeaders, nên phải chuẩn hoá về string trước khi so khớp.
      const contentType = String(pdfResponse.headers['content-type'] ?? '');
      if (!contentType.includes('application/pdf')) {
        this.logger.error(
          `UNIOJ PDF endpoint returned non-PDF content-type: ${contentType}`,
        );
        throw new BadGatewayException(
          'UNIOJ trả về nội dung không phải file PDF.',
        );
      }

      this.logger.log(`Successfully fetched PDF from UNIOJ for ${username}`);

      return {
        data: pdfResponse.data,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `inline; filename="report-${username}.pdf"`,
        },
      };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException ||
        error instanceof BadGatewayException ||
        error instanceof InternalServerErrorException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      const axiosError = error as {
        response?: { status?: number; data?: ErrorResponse };
        message?: string;
      };
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;
      const detail = await this.getUpstreamPdfErrorDetail(data);
      this.logger.error(
        `UNIOJ PDF report fetch failed: status=${status}, data=${detail || (await this.describeUpstreamPdfErrorData(data))}`,
      );

      if (status === 404) {
        throw new NotFoundException(
          `Không tìm thấy báo cáo cho học viên "${name}" (${username}) trên UNIOJ.`,
        );
      }
      if (status === 401) {
        throw new UnauthorizedException(
          'API key của UNIOJ không hợp lệ hoặc hết hạn.',
        );
      }
      if (status === 403) {
        throw new ForbiddenException(
          'Tài khoản UNIOJ chưa có quyền xem báo cáo PDF học viên.',
        );
      }
      if (status === 503) {
        throw new ServiceUnavailableException(
          detail || 'UNIOJ chưa sẵn sàng trả file PDF báo cáo.',
        );
      }
      throw new BadGatewayException(
        detail ||
          axiosError.message ||
          'Không thể tải file PDF báo cáo từ UNIOJ.',
      );
    }
  }

  async getClassesDominantLevels(
    classIds: string[],
  ): Promise<Record<string, string | null>> {
    if (!classIds || classIds.length === 0) {
      return {};
    }

    const studentClasses = await this.prisma.studentClass.findMany({
      where: {
        classId: { in: classIds },
        status: StudentClassStatus.active,
      },
      select: {
        classId: true,
        student: {
          select: {
            fullName: true,
          },
        },
      },
    });

    // Group students by classId
    const classStudentsMap: Record<string, string[]> = {};
    for (const sc of studentClasses) {
      if (sc.student?.fullName) {
        if (!classStudentsMap[sc.classId]) {
          classStudentsMap[sc.classId] = [];
        }
        classStudentsMap[sc.classId].push(sc.student.fullName);
      }
    }

    // Collect all unique student fullNames
    const allStudentNames = Array.from(
      new Set(studentClasses.map((sc) => sc.student?.fullName).filter(Boolean)),
    );

    // Fetch reports for all students in parallel, handle errors individually
    const studentLevelsMap: Record<string, string | null> = {};
    await Promise.allSettled(
      allStudentNames.map(async (name) => {
        try {
          const report = await this.getStudentReport(name);
          const level = report?.stats?.currentLevel;
          if (level && level !== 'Cấp 0' && level !== 'Chưa phân cấp') {
            studentLevelsMap[name] = level;
          } else {
            studentLevelsMap[name] = null;
          }
        } catch (err: any) {
          this.logger.warn(
            `Failed to fetch UNIOJ level for student "${name}": ${err.message}`,
          );
          studentLevelsMap[name] = null;
        }
      }),
    );

    // For each class, determine dominant level
    const result: Record<string, string | null> = {};
    for (const classId of classIds) {
      const studentNames = classStudentsMap[classId] || [];
      const levels = studentNames
        .map((name) => studentLevelsMap[name])
        .filter((lvl): lvl is string => !!lvl);

      if (levels.length === 0) {
        result[classId] = null;
        continue;
      }

      // Count frequency
      const counts: Record<string, number> = {};
      for (const lvl of levels) {
        counts[lvl] = (counts[lvl] || 0) + 1;
      }

      // Helper to parse level number
      const parseLevelNum = (lvl: string): number => {
        const m = lvl.match(/Cấp\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
      };

      // Sort levels by frequency (desc), then level number (desc)
      const sortedLevels = Object.keys(counts).sort((a, b) => {
        const countDiff = counts[b] - counts[a];
        if (countDiff !== 0) return countDiff;
        return parseLevelNum(b) - parseLevelNum(a);
      });

      result[classId] = sortedLevels[0] || null;
    }

    return result;
  }
}
