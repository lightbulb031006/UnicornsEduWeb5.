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
  /**
   * Chỉ hiện khoá cùng chế độ bán (true = bán một lần, false = thường). Dùng khi đổi
   * khoá của lớp đã có: lớp không được đổi sang khoá khác chế độ.
   */
  isOneTime?: boolean;
};

/** Danh sách khoá học (GET /courses), dùng chung cache với CourseSelect. */
export function useCourseList(includeInactive = false) {
  return useQuery({
    queryKey: courseKeys.list(includeInactive),
    queryFn: () => classApi.getCourses(includeInactive),
  });
}

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
  isOneTime,
}: Props) {
  const { data: allCourses = [] } = useCourseList(includeInactive);
  const courses =
    isOneTime === undefined
      ? allCourses
      : allCourses.filter((course) => Boolean(course.isOneTime) === isOneTime);

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
