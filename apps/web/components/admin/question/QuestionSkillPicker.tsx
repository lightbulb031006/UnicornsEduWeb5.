"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUESTION_SKILL_LABELS, QuestionSkillDto } from "@/dtos/question.dto";

const SKILLS = Object.values(QuestionSkillDto);

/** Chọn nhiều Kỹ năng (hồ sơ JP). Giữ thứ tự cố định khi gửi lên. */
export default function QuestionSkillPicker({
  value,
  onChange,
}: {
  value: QuestionSkillDto[];
  onChange: (skills: QuestionSkillDto[]) => void;
}) {
  const toggle = (skill: QuestionSkillDto) => {
    const next = value.includes(skill)
      ? value.filter((s) => s !== skill)
      : [...value, skill];
    onChange(SKILLS.filter((s) => next.includes(s)));
  };

  return (
    <fieldset>
      <legend className="mb-1 block text-xs font-medium text-text-muted">
        Kỹ năng <span className="text-error">*</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {SKILLS.map((skill) => {
          const selected = value.includes(skill);
          return (
            <button
              key={skill}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(skill)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border-default text-text-secondary hover:border-primary/40",
              )}
            >
              {selected ? <Check className="size-3.5" aria-hidden /> : null}
              {QUESTION_SKILL_LABELS[skill]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
