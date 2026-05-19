/**
 * Class Schedule DTOs
 * Used for class-based calendar view and management
 */

/**
 * Represents a weekly schedule pattern entry for a class
 */
export interface ClassScheduleEntry {
  id?: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  from: string; // HH:mm:ss format
  to: string; // HH:mm:ss format
  teacherId?: string; // Responsible tutor for this recurring slot
  googleCalendarEventId?: string; // Google Calendar recurring event ID
  meetLink?: string; // Google Meet link for this recurring schedule
}

export type CalendarEventType = "fixed" | "makeup" | "exam";
export type CalendarWeekVariant = "current" | "next";

/**
 * Represents an aggregate calendar event in the calendar feed.
 */
export interface ClassScheduleEvent {
  occurrenceId: string; // Unique ID for this occurrence
  eventType: CalendarEventType;
  classId: string;
  classIds?: string[];
  className: string;
  classNames?: string[];
  title?: string;
  teacherIds: string[];
  teacherNames: string[];
  studentId?: string;
  studentIds?: string[];
  studentName?: string;
  studentNames?: string[];
  date: string; // YYYY-MM-DD format
  startTime?: string; // HH:mm:ss format (optional if full day)
  endTime?: string; // HH:mm:ss format
  allDay?: boolean;
  description?: string;
  note?: string;
  location?: string;
  patternEntryId?: string; // Reference to the ClassScheduleEntry that generated this
  sourceEventId?: string;
  meetLink?: string; // Google Meet link from the corresponding session/schedule
}

/**
 * Filters for class schedule view
 */
export interface ClassScheduleFilter {
  classId?: string;
  teacherId?: string;
  studentId?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface MakeupCalendarEventPayload {
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  teacherId: string;
  title?: string;
  note?: string;
}

export type MakeupCalendarEventUpdatePayload = Partial<MakeupCalendarEventPayload>;

export interface MakeupScheduleEventRecord {
  id: string;
  classId: string;
  teacherId: string;
  linkedSessionId?: string | null;
  date: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  note?: string;
  className?: string;
  teacherName?: string;
  googleMeetLink?: string | null;
  googleCalendarEventId?: string | null;
  calendarSyncedAt?: string | null;
  calendarSyncError?: string | null;
}

export interface ClassScopedMakeupScheduleEventPayload {
  date: string;
  startTime: string;
  endTime: string;
  teacherId: string;
  title?: string;
  note?: string;
}

export type ClassScopedMakeupScheduleEventUpdatePayload =
  Partial<ClassScopedMakeupScheduleEventPayload>;

export interface GoogleCalendarResyncWarning {
  code: string;
  message: string;
  eventId?: string;
  scheduleEntryId?: string;
}

export interface ClassScheduleGoogleCalendarResyncSummary {
  classId: string;
  scope: "class" | "teacher";
  teacherId?: string;
  deletedRecurringEvents: number;
  createdRecurringEvents: number;
  updatedRecurringEvents: number;
  recoveredStaleRecurringEvents: number;
  failedRecurringEvents: number;
  skippedScheduleEntries: number;
  skippedMissingTeacherId: number;
  skippedUnownedScheduleEntries: number;
  skippedAmbiguousGoogleEvents: number;
  quotaLimited: boolean;
  warnings: GoogleCalendarResyncWarning[];
}

export interface MakeupGoogleCalendarResyncSummary {
  classId: string;
  makeupEventId: string;
  teacherId: string;
  googleCalendarEventId?: string | null;
  googleMeetLink?: string | null;
  recoveredStaleEvent: boolean;
  warnings: GoogleCalendarResyncWarning[];
}

export interface GoogleCalendarResyncResponse<TSummary> {
  success: boolean;
  data: TSummary;
}
