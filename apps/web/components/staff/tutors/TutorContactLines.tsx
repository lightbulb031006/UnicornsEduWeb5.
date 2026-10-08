import { Mail, Phone } from "lucide-react";
import type { TrainingTutorSummary } from "@/dtos/training-tutor.dto";

/** SĐT + email bấm được; ẩn khi không có cả hai. */
export default function TutorContactLines({ tutor }: { tutor: TrainingTutorSummary }) {
  if (!tutor.email && !tutor.phone) return null;
  return (
    <div className="space-y-1 text-xs text-text-secondary">
      {tutor.phone ? (
        <a
          href={`tel:${tutor.phone}`}
          className="flex min-h-6 items-center gap-1.5 hover:underline"
        >
          <Phone className="size-3.5 shrink-0" aria-hidden />
          {tutor.phone}
        </a>
      ) : null}
      {tutor.email ? (
        <a
          href={`mailto:${tutor.email}`}
          className="flex min-h-6 items-center gap-1.5 truncate hover:underline"
        >
          <Mail className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{tutor.email}</span>
        </a>
      ) : null}
    </div>
  );
}
