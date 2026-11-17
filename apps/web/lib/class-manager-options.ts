import type { ClassTeacher, ClassTrainingManagerRef } from "@/dtos/class.dto";
import type { TrainingManagerStaffOption } from "@/dtos/training-manager.dto";

export type ClassManagerOption = { value: string; label: string };

/**
 * Lựa chọn «Quản lý lớp» cho popup giao / gỡ (#277, khớp form admin
 * `EditClassTeachersPopup`): «Chưa gán», nhân sự Ban Đào tạo đang hoạt động,
 * gia sư của lớp chưa thuộc Ban Đào tạo (backend tự cấp role `training`), và
 * giữ người đang quản lý nếu không còn trong hai nhóm trên.
 */
export function buildClassManagerOptions(input: {
  trainingStaff: readonly TrainingManagerStaffOption[];
  classTeachers: readonly Pick<ClassTeacher, "id" | "fullName">[];
  currentManager?: ClassTrainingManagerRef | null;
}): ClassManagerOption[] {
  const seen = new Set<string>();
  const options: ClassManagerOption[] = [{ value: "", label: "Chưa gán" }];
  const push = (value: string, label: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push({ value, label });
  };

  for (const staff of input.trainingStaff) {
    push(staff.id, staff.fullName?.trim() || staff.id);
  }
  for (const teacher of input.classTeachers) {
    push(teacher.id, `${teacher.fullName?.trim() || teacher.id} (gia sư lớp)`);
  }
  const current = input.currentManager;
  if (current?.id) {
    push(current.id, current.fullName?.trim() || current.id);
  }
  return options;
}
