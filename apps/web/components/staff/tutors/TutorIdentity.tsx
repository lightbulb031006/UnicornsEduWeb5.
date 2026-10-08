import UserAvatar from "@/components/ui/UserAvatar";
import type { TrainingTutorSummary } from "@/dtos/training-tutor.dto";
import { pickAvatarUrl } from "@/lib/avatar";
import TutorStatusBadge from "./TutorStatusBadge";

/** Avatar + họ tên + trạng thái + trường; dùng cho thẻ danh sách và đầu hồ sơ. */
export default function TutorIdentity({
  tutor,
  size = "md",
}: {
  tutor: TrainingTutorSummary;
  size?: "md" | "lg";
}) {
  const name = tutor.fullName.trim() || "Gia sư";
  const schools = [tutor.university, tutor.highSchool]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar
        src={pickAvatarUrl(tutor.avatarUrl)}
        fallback={name.charAt(0).toUpperCase()}
        alt={name}
        className={`shrink-0 bg-bg-tertiary text-text-primary ${size === "lg" ? "size-16 text-xl" : "size-11"}`}
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={`truncate font-semibold text-text-primary ${size === "lg" ? "text-lg" : "text-sm"}`}
          >
            {name}
          </p>
          <TutorStatusBadge status={tutor.status} />
        </div>
        {schools ? (
          <p className="truncate text-xs text-text-muted">{schools}</p>
        ) : null}
      </div>
    </div>
  );
}
