export type UserNameSource = {
  first_name?: string | null;
  last_name?: string | null;
  fullName?: string | null;
  email?: string | null;
  accountHandle?: string | null;
};

export function resolveCanonicalUserName(
  source?: UserNameSource | null,
  fallback?: string | null,
): string {
  const first = source?.first_name?.trim() ?? "";
  const last = source?.last_name?.trim() ?? "";
  const canonical = [last, first].filter(Boolean).join(" ").trim();

  if (canonical) {
    return canonical;
  }

  const legacy =
    source?.fullName?.trim() ||
    fallback?.trim() ||
    source?.accountHandle?.trim() ||
    source?.email?.trim() ||
    "";

  return legacy;
}

export function splitCanonicalUserName(fullName: string): {
  first_name?: string;
  last_name?: string;
} {
  const normalized = fullName.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return {};
  }

  const parts = normalized.split(" ");

  if (parts.length === 1) {
    return {
      first_name: normalized,
    };
  }

  return {
    first_name: parts[parts.length - 1],
    last_name: parts.slice(0, -1).join(" "),
  };
}
