type Primitive = string | number | boolean | null;
type StableValue = Primitive | StableValue[] | { [key: string]: StableValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function toStableValue(value: unknown): StableValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toStableValue(entry));
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(
      entries.map(([entryKey, entryValue]) => [entryKey, toStableValue(entryValue)]),
    );
  }

  return String(value);
}

export function createStableFilterKey(filters?: Record<string, unknown>) {
  return toStableValue(filters ?? {});
}

export const authKeys = {
  all: ["auth"] as const,
  session: () => [...authKeys.all, "session"] as const,
  fullProfile: () => [...authKeys.all, "full-profile"] as const,
};

export const calendarKeys = {
  all: ["calendar"] as const,
  events: (filters?: Record<string, unknown>) =>
    [...calendarKeys.all, "events", createStableFilterKey(filters)] as const,
};

export const staffCalendarKeys = {
  all: ["staff-calendar"] as const,
  events: (filters?: Record<string, unknown>) =>
    [...staffCalendarKeys.all, "events", createStableFilterKey(filters)] as const,
};

export const notificationsKeys = {
  all: ["notifications"] as const,
  feed: (filters?: Record<string, unknown>) =>
    [...notificationsKeys.all, "feed", createStableFilterKey(filters)] as const,
};

export const actionHistoryKeys = {
  all: ["action-history"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...actionHistoryKeys.all, "list", createStableFilterKey(filters)] as const,
};

export const classKeys = {
  all: ["class"] as const,
  lists: () => [...classKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...classKeys.lists(), createStableFilterKey(filters)] as const,
  detail: (id: string) => [...classKeys.all, "detail", id] as const,
};

export const uniojKeys = {
  all: ["unioj"] as const,
  report: (name: string, days?: number) =>
    [...uniojKeys.all, "report", name, days] as const,
  reportPdf: (name: string, days?: number) =>
    [...uniojKeys.all, "report-pdf", name, days] as const,
  classesLevels: (classIds: string[]) =>
    [...uniojKeys.all, "classes-levels", classIds] as const,
};

