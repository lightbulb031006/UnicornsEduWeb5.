"use client";

import { useQuery } from "@tanstack/react-query";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import * as classApi from "@/lib/apis/class.api";
import { courseKeys } from "@/lib/query-keys";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  /** Admin-only: also show deactivated courses (they stay disabled in the list). */
  includeInactive?: boolean;
  buttonClassName?: string;
  labelId?: string;
};

/** Dropdown chọn khoá học, lấy danh sách động từ GET /courses. */
export default function CourseSelect({
  value,
  onValueChange,
  id,
  name,
  disabled,
  includeInactive = false,
  buttonClassName,
  labelId,
}: Props) {
  const { data: courses = [] } = useQuery({
    queryKey: courseKeys.list(includeInactive),
    queryFn: () => classApi.getCourses(includeInactive),
  });

  return (
    <UpgradedSelect
      id={id}
      name={name}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      placeholder="Chọn khoá học"
      emptyStateLabel="Chưa có khoá học nào."
      labelId={labelId}
      options={courses.map((course) => ({
        value: course.id,
        label: course.isActive ? course.name : `${course.name} (đã ẩn)`,
        disabled: !course.isActive,
      }))}
      buttonClassName={buttonClassName}
    />
  );
}
