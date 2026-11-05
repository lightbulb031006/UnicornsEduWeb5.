type SetMember = {
  question: { sharedMaterialId?: string | null; setPosition?: number | null };
};

/** Một mục trong tiết: câu lẻ, hoặc cả một Bộ câu hỏi. */
export interface PracticeUnit<L> {
  /** null = câu lẻ. */
  setId: string | null;
  links: L[];
}

/**
 * Chia câu của tiết thành mục: Bộ câu hỏi là một mục liền đứng ở chỗ câu đầu
 * tiên của bộ, bên trong theo thứ tự bộ (giống đề học sinh nhận).
 */
export function practiceUnits<L extends SetMember>(
  links: L[],
): PracticeUnit<L>[] {
  const units: PracticeUnit<L>[] = [];
  const bySet = new Map<string, PracticeUnit<L>>();
  for (const link of links) {
    const setId = link.question.sharedMaterialId ?? null;
    if (setId === null) {
      units.push({ setId, links: [link] });
      continue;
    }
    const unit = bySet.get(setId);
    if (unit) {
      unit.links.push(link);
    } else {
      const created = { setId, links: [link] };
      bySet.set(setId, created);
      units.push(created);
    }
  }
  for (const unit of bySet.values()) {
    unit.links.sort(
      (a, b) => (a.question.setPosition ?? 0) - (b.question.setPosition ?? 0),
    );
  }
  return units;
}

/** Đổi chỗ mục `index` với mục kề, trả danh sách câu phẳng theo thứ tự mới. */
export function moveUnit<L>(
  units: PracticeUnit<L>[],
  index: number,
  direction: -1 | 1,
): L[] {
  const next = [...units];
  const target = index + direction;
  [next[index], next[target]] = [next[target], next[index]];
  return next.flatMap((unit) => unit.links);
}

/** Một đoạn liền của danh sách hiển thị thuộc cùng một mục. */
export interface UnitSegment<T> {
  unitIndex: number;
  items: T[];
}

/**
 * Cắt danh sách hiển thị (đã theo thứ tự tiết) thành đoạn liền cùng mục — để
 * bọc cả Bộ câu hỏi (phần đầu bộ + các câu) trong một khung.
 */
export function segmentsByUnit<T>(
  items: T[],
  unitOf: (item: T) => number,
): UnitSegment<T>[] {
  const segments: UnitSegment<T>[] = [];
  for (const item of items) {
    const unitIndex = unitOf(item);
    const last = segments.at(-1);
    if (last && last.unitIndex === unitIndex) last.items.push(item);
    else segments.push({ unitIndex, items: [item] });
  }
  return segments;
}
