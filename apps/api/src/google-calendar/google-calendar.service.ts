import { Injectable, Logger, OnModuleInit, Scope } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JWT, OAuth2Client } from 'google-auth-library';
import { calendar_v3, google } from 'googleapis';

import {
  GoogleCalendarEvent,
  GoogleCalendarConfig,
} from './interfaces/google-calendar.interface';
import {
  GoogleCalendarAuthError,
  GoogleCalendarInvalidConfigurationError,
  GoogleCalendarApiError,
  GoogleCalendarTimeoutError,
} from './errors/google-calendar.errors';

interface ServiceAccountCredentials {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain?: string;
}

@Injectable({
  scope: Scope.DEFAULT,
})
export class GoogleCalendarService implements OnModuleInit {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private calendar: calendar_v3.Calendar | null = null;
  private oauth2Client: OAuth2Client | null = null;
  private config!: GoogleCalendarConfig;
  private initializationPromise: Promise<void> | null = null;
  private readonly DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
  private readonly GOOGLE_CALENDAR_SCOPE =
    'https://www.googleapis.com/auth/calendar';
  private readonly GOOGLE_MEET_SETTINGS_SCOPE =
    'https://www.googleapis.com/auth/meetings.space.settings';
  private readonly GOOGLE_MEET_V2_BASE_URL = 'https://meet.googleapis.com/v2';
  private readonly GOOGLE_MEET_V2_BETA_BASE_URL =
    'https://meet.googleapis.com/v2beta';
  private readonly CLASS_SCHEDULE_EVENT_TYPE = 'classSchedule';
  private readonly CLASS_SCHEDULE_TYPE_KEY = 'unicornsType';
  private readonly CLASS_SCHEDULE_CLASS_ID_KEY = 'unicornsClassId';
  private readonly CLASS_SCHEDULE_ENTRY_ID_KEY = 'unicornsScheduleEntryId';
  private readonly STUDENT_EXAM_EVENT_TYPE = 'studentExam';
  private readonly STUDENT_EXAM_TYPE_KEY = 'unicornsType';
  private readonly STUDENT_EXAM_STUDENT_ID_KEY = 'unicornsStudentId';
  private readonly STUDENT_EXAM_ITEM_ID_KEY = 'unicornsStudentExamScheduleId';
  private readonly GOOGLE_CALENDAR_LIMIT_RETRY_DELAYS_MS =
    process.env.NODE_ENV === 'test' ? [1, 1] : [1000, 3000];
  private readonly GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS =
    process.env.NODE_ENV === 'test' ? 50 : 20000;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
  }

  onModuleInit(): void {
    void this.ensureCalendarInitialized().catch((error) => {
      this.logger.error(
        `Failed to initialize Google Calendar on module init: ${error}`,
      );
    });
  }

  private loadConfig(): GoogleCalendarConfig {
    const serviceAccountKeyBase64 = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_KEY',
    );
    const serviceAccountJsonPath = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_JSON_PATH',
    );
    const calendarId = this.configService.get<string>('GOOGLE_CALENDAR_ID');
    const timeZone =
      this.configService.get<string>('GOOGLE_TIME_ZONE') ||
      this.DEFAULT_TIME_ZONE;

    // OAuth2 user credentials (preferred for Google Meet support)
    const googleClientId = this.configService.get<string>(
      'GOOGLE_OAUTH_CLIENT_ID',
    );
    const googleClientSecret = this.configService.get<string>(
      'GOOGLE_OAUTH_CLIENT_SECRET',
    );
    const googleRefreshToken = this.configService.get<string>(
      'GOOGLE_REFRESH_TOKEN',
    );

    return {
      serviceAccountKeyBase64,
      serviceAccountJsonPath,
      calendarId,
      timeZone,
      googleClientId,
      googleClientSecret,
      googleRefreshToken,
    };
  }

  private async getServiceAccountCredentials(): Promise<ServiceAccountCredentials | null> {
    const { serviceAccountKeyBase64, serviceAccountJsonPath } = this.config;

    if (serviceAccountKeyBase64) {
      try {
        const json = Buffer.from(serviceAccountKeyBase64, 'base64').toString(
          'utf-8',
        );
        return JSON.parse(json) as ServiceAccountCredentials;
      } catch (error) {
        this.logger.error(
          `Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY base64: ${error}`,
        );
        return null;
      }
    }

    if (serviceAccountJsonPath) {
      try {
        const fs = await import('fs');
        const json = fs.readFileSync(serviceAccountJsonPath, 'utf-8');
        return JSON.parse(json) as ServiceAccountCredentials;
      } catch (error) {
        this.logger.error(
          `Failed to read GOOGLE_SERVICE_ACCOUNT_JSON_PATH: ${error}`,
        );
        return null;
      }
    }

    return null;
  }

  private async ensureCalendarInitialized(
    forceReinitialize = false,
  ): Promise<void> {
    if (forceReinitialize) {
      this.calendar = null;
      this.oauth2Client = null;
    } else if (this.calendar) {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      if (!forceReinitialize || this.calendar) {
        return;
      }
    }

    const initializationPromise = this.initializeCalendar();
    this.initializationPromise = initializationPromise;

    try {
      await initializationPromise;
    } finally {
      if (this.initializationPromise === initializationPromise) {
        this.initializationPromise = null;
      }
    }
  }

  private async initializeCalendar(): Promise<void> {
    const {
      googleClientId,
      googleClientSecret,
      googleRefreshToken,
      serviceAccountKeyBase64,
      serviceAccountJsonPath,
    } = this.config;

    this.logger.log(`[Calendar Startup] Initializing Google Calendar...`);
    this.logger.log(
      `[Calendar Startup] OAuth: clientId=${!!googleClientId}, clientSecret=${!!googleClientSecret}, refreshToken=${!!googleRefreshToken}`,
    );
    this.logger.log(
      `[Calendar Startup] ServiceAccount: keyBase64=${!!serviceAccountKeyBase64}, jsonPath=${!!serviceAccountJsonPath}`,
    );

    // Prefer OAuth2 user authentication (supports Google Meet)
    if (googleRefreshToken && googleClientId && googleClientSecret) {
      try {
        this.logger.log(
          `[Calendar Startup] Attempting OAuth2 authentication...`,
        );
        const oauth2Client = new OAuth2Client(
          googleClientId,
          googleClientSecret,
        );
        oauth2Client.setCredentials({ refresh_token: googleRefreshToken });

        // Force token refresh to verify credentials are valid
        const tokenInfo = await oauth2Client.getAccessToken();
        if (!tokenInfo.token) {
          throw new Error('Failed to obtain access token from refresh token');
        }

        this.logger.log(
          `[Calendar Startup] OAuth2 token obtained successfully`,
        );

        this.calendar = google.calendar({
          version: 'v3',
          auth: oauth2Client,
          timeout: this.GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS,
        });
        this.oauth2Client = oauth2Client;

        this.logger.log(
          `[Calendar Startup] Google Calendar initialized via OAuth2 user credentials`,
        );
        return;
      } catch (error) {
        this.logger.error(
          `[Calendar Startup] OAuth2 authentication failed: ${error}`,
        );
        throw new GoogleCalendarAuthError(
          `OAuth2 authentication failed: ${error}`,
        );
      }
    }

    this.logger.log(
      `[Calendar Startup] OAuth2 not configured, falling back to service account`,
    );

    // Fallback to service account (no Meet support)
    if (serviceAccountKeyBase64 || serviceAccountJsonPath) {
      const credentials = await this.getServiceAccountCredentials();
      if (!credentials) {
        throw new GoogleCalendarInvalidConfigurationError(
          'Failed to load service account credentials',
        );
      }

      try {
        const auth = new JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: [this.GOOGLE_CALENDAR_SCOPE],
        });

        await auth.authorize();

        this.calendar = google.calendar({
          version: 'v3',
          auth,
          timeout: this.GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS,
        });
        this.oauth2Client = null;

        this.logger.log(
          `[Calendar Startup] Google Calendar initialized via service account (${credentials.client_email})`,
        );
      } catch (error) {
        this.logger.error(
          `[Calendar Startup] Service account authorization failed: ${error}`,
        );
        throw new GoogleCalendarAuthError(`Authentication failed: ${error}`);
      }
      return;
    }

    this.logger.warn(
      `[Calendar Startup] Google Calendar NOT configured: No OAuth2 credentials or service account found`,
    );
  }

  private requireCalendar(): calendar_v3.Calendar {
    if (!this.calendar) {
      throw new GoogleCalendarAuthError(
        'Google Calendar client not initialized. Check Google Calendar auth configuration.',
      );
    }

    return this.calendar;
  }

  private requireMeetOAuth2Client(): OAuth2Client {
    if (!this.oauth2Client) {
      throw new GoogleCalendarAuthError(
        `Google Meet co-host grants require OAuth2 user credentials with ${this.GOOGLE_MEET_SETTINGS_SCOPE}. Service account auth cannot grant Meet space member roles.`,
      );
    }

    return this.oauth2Client;
  }

  private isTimeoutError(error: unknown): boolean {
    // gaxios wraps an aborted (timed-out) fetch as a DOMException and copies
    // its `.name` ("TimeoutError") onto `GaxiosError.code`.
    const err = error as { code?: number | string; message?: string };
    if (err.code === 'TimeoutError') {
      return true;
    }
    const message = err.message?.toLowerCase() ?? '';
    return message.includes('timeout') || message.includes('timed out');
  }

  private isRetryableAuthError(error: unknown): boolean {
    const err = error as {
      code?: number | string;
      message?: string;
      response?: { status?: number };
      errors?: Array<{ reason?: string }>;
    };

    const numericCode =
      typeof err.code === 'number'
        ? err.code
        : typeof err.code === 'string'
          ? Number.parseInt(err.code, 10)
          : undefined;
    const status = err.response?.status ?? numericCode;
    const message = err.message?.toLowerCase() ?? '';
    const reasons = (err.errors ?? [])
      .map((item) => item.reason?.toLowerCase() ?? '')
      .filter(Boolean);

    return (
      status === 401 ||
      message.includes('invalid_grant') ||
      message.includes('invalid credentials') ||
      message.includes('unauthorized') ||
      reasons.includes('autherror') ||
      reasons.includes('invalidcredentials')
    );
  }

  private getGoogleErrorReasons(error: unknown): string[] {
    const err = error as {
      errors?: Array<{ reason?: string }>;
      response?: {
        data?: { error?: { errors?: Array<{ reason?: string }> } };
      };
    };
    const directReasons = err.errors ?? [];
    const nestedReasons = err.response?.data?.error?.errors ?? [];

    return [...directReasons, ...nestedReasons]
      .map((item) => item.reason?.toLowerCase() ?? '')
      .filter(Boolean);
  }

  private isCalendarLimitError(error: unknown): boolean {
    const status = this.getGoogleErrorStatus(error);
    const message = this.getGoogleErrorSummary(error).toLowerCase();
    const reasons = this.getGoogleErrorReasons(error);

    return (
      status === 429 ||
      reasons.some((reason) =>
        [
          'quotaexceeded',
          'ratelimitexceeded',
          'userratelimitexceeded',
        ].includes(reason),
      ) ||
      (status === 403 &&
        (message.includes('calendar usage limits exceeded') ||
          message.includes('rate limit exceeded') ||
          message.includes('user rate limit exceeded')))
    );
  }

  private async waitForCalendarLimitRetry(delayMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private async executeCalendarRequest<T>(
    context: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    await this.ensureCalendarInitialized();
    this.requireCalendar();

    let authRetried = false;
    let limitRetryIndex = 0;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (this.isTimeoutError(error)) {
          this.logger.error(
            `[Calendar Timeout] context=${context} timed out after ${this.GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS}ms`,
          );
          throw new GoogleCalendarTimeoutError(
            `${context} timed out after ${this.GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS}ms`,
          );
        }

        if (!authRetried && this.isRetryableAuthError(error)) {
          authRetried = true;
          this.logger.warn(
            `[Calendar Auth] ${context} failed because Google token/auth expired or was rejected. Reinitializing client and retrying once.`,
          );

          await this.ensureCalendarInitialized(true);
          this.requireCalendar();
          continue;
        }

        if (
          this.isCalendarLimitError(error) &&
          limitRetryIndex < this.GOOGLE_CALENDAR_LIMIT_RETRY_DELAYS_MS.length
        ) {
          const baseDelayMs =
            this.GOOGLE_CALENDAR_LIMIT_RETRY_DELAYS_MS[limitRetryIndex];
          limitRetryIndex += 1;
          const jitterMs =
            process.env.NODE_ENV === 'test'
              ? 0
              : Math.floor(Math.random() * 250);
          const delayMs = baseDelayMs + jitterMs;
          this.logger.warn(
            `[Calendar Limit] state=retry_scheduled context=${context}, attempt=${limitRetryIndex}, delayMs=${delayMs}, error=${this.getGoogleErrorSummary(error)}`,
          );
          await this.waitForCalendarLimitRetry(delayMs);
          continue;
        }

        throw error;
      }
    }
  }

  private getGoogleErrorStatus(error: unknown): number | undefined {
    const err = error as {
      code?: number | string;
      response?: { status?: number };
    };
    const numericCode =
      typeof err.code === 'number'
        ? err.code
        : typeof err.code === 'string'
          ? Number.parseInt(err.code, 10)
          : undefined;

    return err.response?.status ?? numericCode;
  }

  private getGoogleErrorSummary(error: unknown): string {
    const err = error as {
      message?: string;
      response?: { data?: unknown };
    };
    const responseData = err.response?.data;

    if (responseData && typeof responseData === 'object') {
      const nested = responseData as { error?: { message?: string } };
      if (nested.error?.message) {
        return nested.error.message;
      }
    }

    return err.message ?? String(error);
  }

  private isAlreadyExistsError(error: unknown): boolean {
    return (
      this.getGoogleErrorStatus(error) === 409 ||
      this.getGoogleErrorSummary(error).toLowerCase().includes('already exists')
    );
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      this.getGoogleErrorStatus(error) === 404 ||
      this.getGoogleErrorSummary(error).toLowerCase().includes('not found')
    );
  }

  private getCalendarId(): string {
    return this.config.calendarId || 'primary';
  }

  private getClassScheduleEntryIdFromDescription(
    description: string | null | undefined,
  ): string | undefined {
    const match = description?.match(/^Schedule Entry ID:\s*(.+)$/m);
    return match?.[1]?.trim() || undefined;
  }

  private extractMeetMeetingCode(meetLink: string): string | null {
    try {
      const url = new URL(meetLink);
      if (url.hostname !== 'meet.google.com') {
        return null;
      }

      return url.pathname.split('/').find(Boolean) ?? null;
    } catch {
      const match = meetLink.match(
        /meet\.google\.com\/([a-z]+-[a-z]+-[a-z]+)/i,
      );
      return match?.[1] ?? null;
    }
  }

  private async grantMeetCoHostRole(params: {
    meetLink: string;
    staffEmail?: string;
    staffId: string;
  }): Promise<void> {
    const email = params.staffEmail?.trim().toLowerCase();
    if (!email) {
      throw new GoogleCalendarInvalidConfigurationError(
        `Cannot grant Google Meet co-host role for staff ${params.staffId}: staff email is missing.`,
      );
    }

    const meetingCode = this.extractMeetMeetingCode(params.meetLink);
    if (!meetingCode) {
      throw new GoogleCalendarInvalidConfigurationError(
        `Cannot grant Google Meet co-host role for staff ${params.staffId}: invalid Meet link ${params.meetLink}.`,
      );
    }

    await this.ensureCalendarInitialized();
    const createMember = async () =>
      this.requireMeetOAuth2Client().request({
        url: `${this.GOOGLE_MEET_V2_BETA_BASE_URL}/spaces/${encodeURIComponent(meetingCode)}/members?fields=name,email,role,user`,
        method: 'POST',
        data: {
          email,
          role: 'COHOST',
        },
      });

    try {
      await createMember();
    } catch (error) {
      if (this.isAlreadyExistsError(error)) {
        this.logger.log(
          `[TutorMeet] Staff ${params.staffId} (${email}) is already a Meet space member for ${meetingCode}`,
        );
        return;
      }

      if (!this.isRetryableAuthError(error)) {
        throw new GoogleCalendarApiError(
          `Failed to grant Google Meet co-host role to ${email} for staff ${params.staffId}: ${this.getGoogleErrorSummary(error)}`,
          error as Error & { errors?: unknown[] },
        );
      }

      this.logger.warn(
        `[Meet Auth] Granting co-host for staff ${params.staffId} failed because Google token/auth expired or was rejected. Reinitializing client and retrying once.`,
      );

      await this.ensureCalendarInitialized(true);

      try {
        await createMember();
      } catch (retryError) {
        if (this.isAlreadyExistsError(retryError)) {
          this.logger.log(
            `[TutorMeet] Staff ${params.staffId} (${email}) is already a Meet space member for ${meetingCode}`,
          );
          return;
        }

        throw new GoogleCalendarApiError(
          `Failed to grant Google Meet co-host role to ${email} for staff ${params.staffId}: ${this.getGoogleErrorSummary(retryError)}`,
          retryError as Error & { errors?: unknown[] },
        );
      }
    }

    this.logger.log(
      `[TutorMeet] Granted Meet COHOST role to ${email} for staff ${params.staffId}`,
    );
  }

  private async setMeetSpaceOpenAccess(params: {
    meetLink: string;
    staffId: string;
  }): Promise<void> {
    const meetingCode = this.extractMeetMeetingCode(params.meetLink);
    if (!meetingCode) {
      throw new GoogleCalendarInvalidConfigurationError(
        `Cannot set Google Meet access to OPEN for staff ${params.staffId}: invalid Meet link ${params.meetLink}.`,
      );
    }

    await this.ensureCalendarInitialized();
    const oauth2Client = this.requireMeetOAuth2Client();
    const spaceResponse = await oauth2Client.request<{
      name?: string;
      config?: { accessType?: string };
    }>({
      url: `${this.GOOGLE_MEET_V2_BASE_URL}/spaces/${encodeURIComponent(meetingCode)}?fields=name,config`,
      method: 'GET',
    });
    const spaceName = spaceResponse.data.name;

    if (!spaceName) {
      throw new GoogleCalendarApiError(
        `Google Meet API did not return a space name for staff ${params.staffId}.`,
      );
    }

    await oauth2Client.request({
      url: `${this.GOOGLE_MEET_V2_BASE_URL}/${spaceName}?updateMask=config.accessType`,
      method: 'PATCH',
      data: {
        config: {
          accessType: 'OPEN',
        },
      },
    });

    this.logger.log(
      `[TutorMeet] Set Meet accessType=OPEN for staff ${params.staffId}`,
    );
  }

  async deleteCalendarEvent(
    eventId: string,
    options?: {
      calendarId?: string;
    },
  ): Promise<void> {
    const calendarId = options?.calendarId || this.getCalendarId();
    this.logger.log(
      `[Calendar CRUD:DELETE] state=started calendarId=${calendarId}, eventId=${eventId}`,
    );

    try {
      await this.executeCalendarRequest(`delete event ${eventId}`, async () =>
        this.calendar!.events.delete({
          calendarId,
          eventId,
          sendUpdates: 'none',
        }),
      );

      this.logger.log(
        `[Calendar CRUD:DELETE] state=succeeded calendarId=${calendarId}, eventId=${eventId}`,
      );
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        this.logger.warn(
          `[Calendar CRUD:DELETE] state=not_found calendarId=${calendarId}, eventId=${eventId}, action=treated_as_success`,
        );
        return;
      }

      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        `[Calendar CRUD:DELETE] state=failed calendarId=${calendarId}, eventId=${eventId}, error=${this.getGoogleErrorSummary(error)}, stack=${stack}`,
      );
      this.handleApiError(error, 'Failed to delete calendar event');
      throw new GoogleCalendarApiError(
        `Failed to delete calendar event ${eventId}`,
        error as Error & { errors?: unknown[] },
      );
    }
  }

  async listClassScheduleRecurringEvents(classId: string): Promise<
    Array<{
      eventId: string;
      calendarId: string;
      scheduleEntryId?: string;
    }>
  > {
    const calendarId = this.getCalendarId();
    const byEventId = new Map<
      string,
      {
        eventId: string;
        calendarId: string;
        scheduleEntryId?: string;
      }
    >();

    const addEvent = (event: calendar_v3.Schema$Event) => {
      if (!event.id || event.status === 'cancelled') {
        return;
      }

      const privateProps = event.extendedProperties?.private ?? {};

      // Skip makeup events and student exam events
      if (
        privateProps.unicornsType === 'makeupSchedule' ||
        privateProps.unicornsType === 'studentExam'
      ) {
        return;
      }

      // Skip legacy makeup events by description / title keyword to prevent false match
      if (
        typeof event.description === 'string' &&
        (event.description.includes('Makeup Event ID:') ||
          event.description.includes('Lịch dạy bù'))
      ) {
        return;
      }

      const metadataClassId =
        privateProps[this.CLASS_SCHEDULE_CLASS_ID_KEY] ?? undefined;
      const metadataEntryId =
        privateProps[this.CLASS_SCHEDULE_ENTRY_ID_KEY] ?? undefined;
      const legacyClassMarker = `Class ID: ${classId}`;
      const isMetadataMatch = metadataClassId === classId;
      const isLegacyMatch =
        typeof event.description === 'string' &&
        event.description.includes(legacyClassMarker);

      if (!isMetadataMatch && !isLegacyMatch) {
        return;
      }

      byEventId.set(event.id, {
        eventId: event.id,
        calendarId,
        scheduleEntryId:
          metadataEntryId ??
          this.getClassScheduleEntryIdFromDescription(event.description),
      });
    };

    const listEvents = async (
      params: Omit<calendar_v3.Params$Resource$Events$List, 'calendarId'>,
    ) => {
      let pageToken: string | undefined;
      do {
        const response = await this.executeCalendarRequest(
          `list class schedule events for class ${classId}`,
          async () =>
            this.calendar!.events.list({
              calendarId,
              showDeleted: false,
              maxResults: 2500,
              ...params,
              pageToken,
            }),
        );

        for (const event of response.data.items ?? []) {
          addEvent(event);
        }
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);
    };

    await listEvents({
      privateExtendedProperty: [
        `${this.CLASS_SCHEDULE_TYPE_KEY}=${this.CLASS_SCHEDULE_EVENT_TYPE}`,
        `${this.CLASS_SCHEDULE_CLASS_ID_KEY}=${classId}`,
      ],
    });
    await listEvents({ q: classId });

    return Array.from(byEventId.values());
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.executeCalendarRequest(
        'test Google Calendar connection',
        async () =>
          this.calendar!.calendarList.list({
            maxResults: 1,
          }),
      );

      this.logger.log(
        `Google Calendar connection test successful. Found ${response.data.items?.length || 0} calendars`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Google Calendar connection test failed: ${error}`);
      return false;
    }
  }

  private handleApiError(error: unknown, context: string): void {
    const err = error as Error & { errors?: unknown[]; code?: string };

    this.logger.error(`${context}:`, {
      message: err.message,
      code: err.code,
      errors: err.errors,
    });

    if (
      err.message?.includes('invalid_grant') ||
      err.message?.includes('401')
    ) {
      throw new GoogleCalendarAuthError(`Authentication error: ${err.message}`);
    }
  }

  private addDaysToDateString(date: string, days: number): string {
    const nextDate = new Date(`${date}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + days);
    return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
  }

  async syncStudentExamScheduleEvents(params: {
    studentId: string;
    studentName: string;
    classNames: string[];
    items: Array<{
      id: string;
      examDate: string;
      note?: string | null;
    }>;
  }): Promise<void> {
    const { studentId, studentName, classNames, items } = params;
    const calendarId = this.config.calendarId || 'primary';

    const existingResponse = await this.executeCalendarRequest(
      `list student exam events for student ${studentId}`,
      async () =>
        this.calendar!.events.list({
          calendarId,
          privateExtendedProperty: [
            `${this.STUDENT_EXAM_TYPE_KEY}=${this.STUDENT_EXAM_EVENT_TYPE}`,
            `${this.STUDENT_EXAM_STUDENT_ID_KEY}=${studentId}`,
          ],
          showDeleted: false,
          maxResults: 2500,
        }),
    );

    const existingEvents = existingResponse.data.items ?? [];
    const existingByScheduleId = new Map(
      existingEvents
        .map((event) => {
          const scheduleId =
            event.extendedProperties?.private?.[this.STUDENT_EXAM_ITEM_ID_KEY];
          return scheduleId ? ([scheduleId, event] as const) : null;
        })
        .filter(
          (
            entry,
          ): entry is readonly [
            string,
            NonNullable<typeof existingEvents>[number],
          ] => Boolean(entry),
        ),
    );

    const normalizedClassNames = Array.from(
      new Set(classNames.map((value) => value.trim()).filter(Boolean)),
    );

    for (const item of items) {
      const summary = `Lịch thi - ${studentName}`;
      const description = [
        `Student: ${studentName}`,
        `Student ID: ${studentId}`,
        `Exam Schedule ID: ${item.id}`,
        `Exam Date: ${item.examDate}`,
        normalizedClassNames.length > 0
          ? `Classes: ${normalizedClassNames.join(', ')}`
          : null,
        item.note?.trim() ? `Note: ${item.note.trim()}` : null,
        '',
        'This all-day exam event was created automatically by the UnicornsEdu system.',
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n');
      const existingEvent = existingByScheduleId.get(item.id);
      const eventBody: calendar_v3.Schema$Event = {
        summary,
        description,
        start: {
          date: item.examDate,
        },
        end: {
          date: this.addDaysToDateString(item.examDate, 1),
        },
        transparency: 'transparent',
        extendedProperties: {
          private: {
            [this.STUDENT_EXAM_TYPE_KEY]: this.STUDENT_EXAM_EVENT_TYPE,
            [this.STUDENT_EXAM_STUDENT_ID_KEY]: studentId,
            [this.STUDENT_EXAM_ITEM_ID_KEY]: item.id,
          },
        },
      };

      await this.executeCalendarRequest(
        `${existingEvent?.id ? 'update' : 'create'} student exam event ${item.id}`,
        async () => {
          if (existingEvent?.id) {
            return this.calendar!.events.update({
              calendarId,
              eventId: existingEvent.id,
              requestBody: eventBody,
            });
          }

          return this.calendar!.events.insert({
            calendarId,
            requestBody: eventBody,
          });
        },
      );

      existingByScheduleId.delete(item.id);
    }

    for (const leftoverEvent of existingByScheduleId.values()) {
      if (!leftoverEvent.id) {
        continue;
      }

      await this.deleteCalendarEvent(leftoverEvent.id);
    }
  }

  /**
   * Creates a minimal one-off Google Calendar event to obtain a stable
   * Google Meet link for a tutor and grant meeting-management permissions.
   * The tutor is invited as CO_HOST so they can manage the meeting room.
   *
   * NOTE: this setup event is intentionally kept (not auto-deleted) because
   * removing it can revoke host/co-host permissions tied to the event.
   *
   * Meet link generation requires OAuth2 credentials (not service account) —
   * if conferenceData is absent in the response the method throws.
   */
  async generateTutorMeetLink(params: {
    staffId: string;
    staffName: string;
    staffEmail?: string;
  }): Promise<string> {
    const { staffId, staffName, staffEmail } = params;

    const vnTimeZone = this.config.timeZone || this.DEFAULT_TIME_ZONE;
    const nowInVN = new Date(
      new Date().toLocaleString('en-US', { timeZone: vnTimeZone }),
    );
    const startISO = nowInVN.toISOString().replace('Z', '');
    const endDate = new Date(nowInVN.getTime() + 30 * 60 * 1000);
    const endISO = endDate.toISOString().replace('Z', '');

    const summary = `[Unicorns Class] ${staffName}`;
    const description = [
      `Tutor: ${staffName}`,
      `Staff ID: ${staffId}`,
      'This event was created automatically by UnicornsEdu to generate a permanent Google Meet link for the tutor.',
      'Do not delete this event. It preserves host/co-host management rights for the tutor.',
    ].join('\n');

    const attendees = staffEmail
      ? [
          {
            email: staffEmail.trim(),
          },
        ]
      : [];

    const eventBody: calendar_v3.Schema$Event = {
      summary,
      description,
      start: {
        dateTime: startISO,
        timeZone: vnTimeZone,
      },
      end: {
        dateTime: endISO,
        timeZone: vnTimeZone,
      },
      ...(attendees.length > 0 ? { attendees } : {}),
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
        },
      },
    };

    const response = await this.executeCalendarRequest(
      `generate tutor meet link for staff ${staffId}`,
      async () =>
        this.calendar!.events.insert({
          calendarId: this.config.calendarId || 'primary',
          requestBody: eventBody,
          conferenceDataVersion: 1,
        }),
    );

    const event = response.data as GoogleCalendarEvent;

    const meetLink =
      event.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === 'video',
      )?.uri ?? '';

    if (!meetLink) {
      this.logger.warn(
        `[TutorMeet] No Meet link in response for staff ${staffId}. OAuth2 credentials may not support conference creation.`,
      );
      throw new Error(
        `Google Calendar did not return a Meet link for tutor ${staffId}. Ensure OAuth2 credentials are configured.`,
      );
    }

    try {
      await this.setMeetSpaceOpenAccess({ meetLink, staffId });
    } catch (error) {
      this.logger.warn(
        `[TutorMeet] Generated Meet link for staff ${staffId}, but setting accessType=OPEN failed: ${this.getGoogleErrorSummary(error)}`,
      );
    }

    try {
      await this.grantMeetCoHostRole({ meetLink, staffEmail, staffId });
    } catch (error) {
      this.logger.warn(
        `[TutorMeet] Generated Meet link for staff ${staffId}, but co-host grant failed and will be retried manually/config-wise: ${this.getGoogleErrorSummary(error)}`,
      );
    }

    this.logger.log(
      `[TutorMeet] Generated Meet link for staff ${staffId}: ${meetLink}`,
    );

    if (event.id) {
      this.logger.log(
        `[TutorMeet] Kept Meet-setup event ${event.id} to preserve tutor meeting-management permissions.`,
      );
    }

    return meetLink;
  }

  async createOrUpdateClassScheduleRecurringEvent(params: {
    classId: string;
    className: string;
    entryId?: string;
    calendarEventId?: string;
    teacherEmails: string[];
    dayOfWeek: number;
    from: string;
    end: string;
    /** Pre-resolved Meet link for the responsible tutor. When provided the
     *  link is embedded in the event description and conferenceData.createRequest
     *  is omitted (no new Meet room is created). When absent, falls back to
     *  requesting a new conference from Google. */
    meetLink?: string;
  }): Promise<{ eventId: string; meetLink?: string }> {
    const {
      classId,
      className,
      entryId,
      calendarEventId,
      teacherEmails,
      dayOfWeek,
      from,
      end,
      meetLink: providedMeetLink,
    } = params;

    this.logger.log(
      `[Calendar] Creating recurring event for class "${className}" (${classId}), entry ${entryId}`,
    );
    this.logger.log(
      `[Calendar] dayOfWeek=${dayOfWeek}, from=${from}, end=${end}, teacherEmails=${JSON.stringify(teacherEmails)}`,
    );
    this.logger.log(
      `[Calendar] calendarId=${this.config.calendarId || 'primary'}, calendarEventId=${calendarEventId || 'new'}`,
    );

    const dayMap: Record<number, string> = {
      0: 'SU',
      1: 'MO',
      2: 'TU',
      3: 'WE',
      4: 'TH',
      5: 'FR',
      6: 'SA',
    };
    const byday = dayMap[dayOfWeek];
    if (!byday) {
      throw new Error(`Invalid dayOfWeek: ${dayOfWeek}`);
    }

    // Calculate first occurrence date (next date matching dayOfWeek)
    const vnTimeZone = this.config.timeZone || this.DEFAULT_TIME_ZONE;
    const nowInVN = new Date(
      new Date().toLocaleString('en-US', { timeZone: vnTimeZone }),
    );
    const today = new Date(nowInVN);
    today.setHours(0, 0, 0, 0);
    const currentDay = today.getDay();
    const diff = (dayOfWeek - currentDay + 7) % 7;
    const firstOccurrence = new Date(today);
    firstOccurrence.setDate(today.getDate() + diff);

    // Format date string directly (no Date manipulation — exact time from schedule)
    const dateStr = `${firstOccurrence.getFullYear()}-${String(firstOccurrence.getMonth() + 1).padStart(2, '0')}-${String(firstOccurrence.getDate()).padStart(2, '0')}`;
    const startDateTimeStr = `${dateStr}T${from}`;
    const endDateTimeStr = `${dateStr}T${end}`;

    this.logger.log(
      `[Calendar] First occurrence (VN): ${dateStr}, time: ${from}-${end}, dateTime: ${startDateTimeStr}`,
    );

    // Validate time range by comparing the time strings directly
    if (end <= from) {
      throw new Error(
        `Invalid time range for class ${classId}: ${from} - ${end}`,
      );
    }

    const normalizedTeacherEmails = Array.from(
      new Set(
        teacherEmails
          .map((email) => email.trim())
          .filter((email) => email.length > 0),
      ),
    );
    const summary = `[Class] ${className} - Weekly`;
    const descriptionLines = [
      `Class: ${className}`,
      `Class ID: ${classId}`,
      entryId ? `Schedule Entry ID: ${entryId}` : null,
      `Schedule: Weekly on ${byday}`,
      `Time: ${from} - ${end}`,
      normalizedTeacherEmails.length > 0
        ? `Teachers: ${normalizedTeacherEmails.join(', ')}`
        : null,
      providedMeetLink ? `Google Meet: ${providedMeetLink}` : null,
      '',
      'This event was created automatically by the UnicornsEdu system.',
    ].filter((line): line is string => Boolean(line));
    const description = descriptionLines.join('\n');
    const existingEventId = calendarEventId;

    // When a pre-resolved Meet link is provided, embed it in the description
    // and skip conferenceData.createRequest (no new Meet room needed).
    // Fall back to createRequest only when no link is available.
    const conferenceDataPayload: calendar_v3.Schema$ConferenceData | undefined =
      providedMeetLink
        ? undefined
        : { createRequest: { requestId: randomUUID() } };

    const eventBody: calendar_v3.Schema$Event = {
      summary,
      description,
      start: {
        dateTime: startDateTimeStr,
        timeZone: this.config.timeZone || this.DEFAULT_TIME_ZONE,
      },
      end: {
        dateTime: endDateTimeStr,
        timeZone: this.config.timeZone || this.DEFAULT_TIME_ZONE,
      },
      recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byday}`],
      attendees: normalizedTeacherEmails.map((email) => ({
        email,
      })),
      extendedProperties: {
        private: {
          [this.CLASS_SCHEDULE_TYPE_KEY]: this.CLASS_SCHEDULE_EVENT_TYPE,
          [this.CLASS_SCHEDULE_CLASS_ID_KEY]: classId,
          ...(entryId ? { [this.CLASS_SCHEDULE_ENTRY_ID_KEY]: entryId } : {}),
        },
      },
      ...(conferenceDataPayload
        ? { conferenceData: conferenceDataPayload }
        : {}),
    };

    this.logger.log(`[Calendar] Event body summary: ${summary}`);
    this.logger.log(
      `[Calendar] conferenceData.createRequest present: ${!providedMeetLink}`,
    );
    if (providedMeetLink) {
      this.logger.log(
        `[Calendar] Using pre-resolved tutor Meet link in description: ${providedMeetLink}`,
      );
    } else {
      this.logger.log(`[Calendar] Conference data version will be set to 1`);
    }

    try {
      const action = existingEventId ? 'update' : 'create';
      const calendarId = this.config.calendarId || 'primary';

      this.logger.log(
        `[Calendar Recurring] state=${action}_started calendarId=${calendarId}, classId=${classId}, entryId=${entryId}, existingEventId=${existingEventId ?? '(new)'}, teacherEmailCount=${normalizedTeacherEmails.length}, hasMeetLink=${Boolean(providedMeetLink)}`,
      );

      // conferenceDataVersion=1 is only needed when requesting a new conference
      const conferenceDataVersion = conferenceDataPayload ? 1 : 0;

      const response = await this.executeCalendarRequest(
        `${action} recurring event for class ${classId}`,
        async () => {
          if (existingEventId) {
            return this.calendar!.events.update({
              calendarId,
              eventId: existingEventId,
              requestBody: eventBody,
              conferenceDataVersion,
            });
          }

          return this.calendar!.events.insert({
            calendarId,
            requestBody: eventBody,
            conferenceDataVersion,
          });
        },
      );

      const event = response.data as GoogleCalendarEvent;
      this.logger.log(`[Calendar] Google API response event.id: ${event.id}`);

      if (!event.id) {
        this.logger.error(
          `[Calendar] Google Calendar did not return an event id for class ${className}`,
        );
        throw new GoogleCalendarApiError(
          `Google Calendar did not return an event id for class ${className}`,
        );
      }

      // When a tutor Meet link was pre-provided, use it directly (no Google conference created).
      // Otherwise, try to read the conference-generated link from the response.
      let resolvedMeetLink: string | undefined = providedMeetLink;
      if (!resolvedMeetLink) {
        this.logger.log(
          `[Calendar] conferenceData present: ${!!event.conferenceData}`,
        );
        const fromConference =
          event.conferenceData?.entryPoints?.find(
            (ep) => ep.entryPointType === 'video',
          )?.uri || '';
        if (fromConference) {
          this.logger.log(
            `[Calendar] Meet link from Google conference: ${fromConference}`,
          );
          resolvedMeetLink = fromConference;
        } else {
          this.logger.warn(
            `[Calendar] WARNING: No Meet link in response for class ${className}. This may indicate OAuth2 user credentials are not configured or conferenceData.createRequest was not processed.`,
          );
        }
      }

      this.logger.log(
        `[Calendar Recurring] state=${action}_succeeded calendarId=${calendarId}, classId=${classId}, entryId=${entryId}, eventId=${event.id}, hasMeetLink=${Boolean(resolvedMeetLink)}`,
      );

      return { eventId: event.id, meetLink: resolvedMeetLink };
    } catch (error) {
      this.logger.error(
        `[Calendar Recurring] state=failed classId=${classId}, entryId=${entryId}, existingEventId=${existingEventId ?? '(new)'}, error=${this.getGoogleErrorSummary(error)}`,
      );
      this.handleApiError(
        error,
        'Failed to create/update class schedule recurring event',
      );
      throw new GoogleCalendarApiError(
        `Failed to create/update class schedule recurring event for class ${className}`,
        error as Error & { errors?: unknown[] },
      );
    }
  }

  async createOrUpdateMakeupScheduleEvent(params: {
    classId: string;
    className: string;
    makeupEventId: string;
    calendarEventId?: string;
    teacherEmails: string[];
    date: string;
    startTime: string;
    endTime: string;
    title?: string;
    note?: string;
    /** Pre-resolved Meet link for the responsible tutor. When provided the
     *  link is embedded in the event description and conferenceData.createRequest
     *  is omitted (no new Meet room is created). */
    meetLink?: string;
  }): Promise<{ eventId: string; meetLink?: string }> {
    const {
      classId,
      className,
      makeupEventId,
      calendarEventId,
      teacherEmails,
      date,
      startTime,
      endTime,
      title,
      note,
      meetLink: providedMeetLink,
    } = params;

    if (endTime <= startTime) {
      throw new Error(
        `Invalid time range for makeup event ${makeupEventId}: ${startTime} - ${endTime}`,
      );
    }

    const normalizedTeacherEmails = Array.from(
      new Set(
        teacherEmails
          .map((email) => email.trim())
          .filter((email) => email.length > 0),
      ),
    );
    const summary = title?.trim() || `Lịch dạy bù - ${className}`;
    const description = [
      `Class: ${className}`,
      `Class ID: ${classId}`,
      `Makeup Event ID: ${makeupEventId}`,
      `Date: ${date}`,
      `Time: ${startTime} - ${endTime}`,
      normalizedTeacherEmails.length > 0
        ? `Teachers: ${normalizedTeacherEmails.join(', ')}`
        : null,
      note?.trim() ? `Note: ${note.trim()}` : null,
      providedMeetLink ? `Google Meet: ${providedMeetLink}` : null,
      '',
      'This event was created automatically by the UnicornsEdu system.',
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');

    // Skip conferenceData.createRequest when a tutor Meet link is pre-resolved.
    const conferenceDataPayload: calendar_v3.Schema$ConferenceData | undefined =
      providedMeetLink
        ? undefined
        : { createRequest: { requestId: randomUUID() } };

    const eventBody: calendar_v3.Schema$Event = {
      summary,
      description,
      start: {
        dateTime: `${date}T${startTime}`,
        timeZone: this.config.timeZone || this.DEFAULT_TIME_ZONE,
      },
      end: {
        dateTime: `${date}T${endTime}`,
        timeZone: this.config.timeZone || this.DEFAULT_TIME_ZONE,
      },
      attendees: normalizedTeacherEmails.map((email) => ({
        email,
      })),
      extendedProperties: {
        private: {
          unicornsType: 'makeupSchedule',
          unicornsClassId: classId,
          unicornsMakeupEventId: makeupEventId,
        },
      },
      ...(conferenceDataPayload
        ? { conferenceData: conferenceDataPayload }
        : {}),
    };

    const conferenceDataVersion = conferenceDataPayload ? 1 : 0;
    const calendarId = this.config.calendarId || 'primary';
    const action = calendarEventId ? 'update' : 'create';
    this.logger.log(
      `[Calendar Makeup] state=${action}_started calendarId=${calendarId}, classId=${classId}, makeupEventId=${makeupEventId}, calendarEventId=${calendarEventId ?? '(new)'}, teacherEmailCount=${normalizedTeacherEmails.length}, hasMeetLink=${Boolean(providedMeetLink)}, conferenceDataVersion=${conferenceDataVersion}`,
    );

    try {
      const response = await this.executeCalendarRequest(
        `${action} makeup event ${makeupEventId}`,
        async () => {
          if (calendarEventId) {
            return this.calendar!.events.update({
              calendarId,
              eventId: calendarEventId,
              requestBody: eventBody,
              conferenceDataVersion,
            });
          }

          return this.calendar!.events.insert({
            calendarId,
            requestBody: eventBody,
            conferenceDataVersion,
          });
        },
      );

      const event = response.data as GoogleCalendarEvent;
      if (!event.id) {
        throw new GoogleCalendarApiError(
          `Google Calendar did not return an event id for makeup event ${makeupEventId}`,
        );
      }

      // Prefer the pre-provided tutor Meet link; fall back to Google-generated conference link.
      let resolvedMeetLink: string | undefined = providedMeetLink;
      if (!resolvedMeetLink) {
        resolvedMeetLink =
          event.conferenceData?.entryPoints?.find(
            (ep) => ep.entryPointType === 'video',
          )?.uri || undefined;
      }

      this.logger.log(
        `[Calendar Makeup] state=${action}_succeeded calendarId=${calendarId}, classId=${classId}, makeupEventId=${makeupEventId}, eventId=${event.id}, hasMeetLink=${Boolean(resolvedMeetLink)}`,
      );

      return { eventId: event.id, meetLink: resolvedMeetLink };
    } catch (error) {
      this.logger.error(
        `[Calendar Makeup] state=${action}_failed calendarId=${calendarId}, classId=${classId}, makeupEventId=${makeupEventId}, calendarEventId=${calendarEventId ?? '(new)'}, error=${this.getGoogleErrorSummary(error)}`,
      );
      this.handleApiError(
        error,
        'Failed to create/update makeup schedule event',
      );
      throw new GoogleCalendarApiError(
        `Failed to create/update makeup schedule event ${makeupEventId}`,
        error as Error & { errors?: unknown[] },
      );
    }
  }
}
