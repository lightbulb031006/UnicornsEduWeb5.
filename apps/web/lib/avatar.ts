export function pickAvatarUrl(
  ...sources: Array<string | null | undefined>
): string | null {
  for (const source of sources) {
    const trimmed = source?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}
