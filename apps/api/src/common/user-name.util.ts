export interface UserNameParts {
  first_name?: string | null;
  last_name?: string | null;
}

export interface UserNameSource extends UserNameParts {
  accountHandle?: string | null;
  email?: string | null;
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getUserFullNameFromParts(user?: UserNameParts | null) {
  if (!user) {
    return null;
  }

  const firstName = normalizeOptionalText(user.first_name);
  const lastName = normalizeOptionalText(user.last_name);
  const fullName = [lastName, firstName].filter(Boolean).join(' ').trim();

  return fullName || null;
}

export function getPreferredUserFullName(user?: UserNameSource | null) {
  const fullName = getUserFullNameFromParts(user);
  if (fullName) {
    return fullName;
  }

  const accountHandle = normalizeOptionalText(user?.accountHandle);
  if (accountHandle) {
    return accountHandle;
  }

  return normalizeOptionalText(user?.email);
}

export function splitFullName(fullName: string) {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return {
      first_name: '',
      last_name: null,
    };
  }

  const parts = normalized.split(' ');
  const first_name = parts[parts.length - 1];
  const lastNameParts = parts.slice(0, -1);

  return {
    first_name,
    last_name: lastNameParts.length > 0 ? lastNameParts.join(' ') : null,
  };
}
