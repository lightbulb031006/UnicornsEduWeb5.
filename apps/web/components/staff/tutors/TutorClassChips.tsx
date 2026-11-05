import type { TrainingTutorClass } from "@/dtos/training-tutor.dto";

/** Lớp của gia sư dạng chip, hiện đủ (không cắt, không gắn link). */
export default function TutorClassChips({
  classes,
  emptyLabel = "—",
}: {
  classes: TrainingTutorClass[];
  emptyLabel?: string;
}) {
  if (classes.length === 0) {
    return <span className="text-sm text-text-muted">{emptyLabel}</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {classes.map((item) => (
        <li
          key={item.id}
          className="max-w-full rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium wrap-anywhere text-text-secondary"
        >
          {item.name}
        </li>
      ))}
    </ul>
  );
}
