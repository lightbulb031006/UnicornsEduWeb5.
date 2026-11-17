"use client";

import type { StudentDemographicsDataQuality } from "@/dtos/dashboard.dto";
import { StudentListTable } from "./StudentListTable";

/** Tab "Cần rà soát": học sinh thiếu năm sinh và năm sinh ngoài độ tuổi phổ thông. */
export function DataQualityTab({ dataQuality }: { dataQuality: StudentDemographicsDataQuality }) {
  const { missingBirthYear, unusualBirthYear, normalAgeRange } = dataQuality;
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-bold text-text-primary">
          Chưa có năm sinh hoặc năm sinh không hợp lệ ({missingBirthYear.length})
        </h3>
        <p className="mb-2 text-xs text-text-secondary">
          Nhóm này hiện là «Chưa cập nhật» trong các bảng và không được vẽ trên biểu đồ độ tuổi.
        </p>
        <StudentListTable students={missingBirthYear} showRawBirthYear emptyText="Không có học sinh thiếu năm sinh." />
      </section>
      <section>
        <h3 className="text-sm font-bold text-text-primary">
          Ngoài độ tuổi phổ thông {normalAgeRange.min}–{normalAgeRange.max} tuổi ({unusualBirthYear.length})
        </h3>
        <p className="mb-2 text-xs text-text-secondary">
          Có thể đúng (sinh viên, người đi làm) hoặc nhập nhầm. Cần đối chiếu lại hồ sơ.
        </p>
        <StudentListTable students={unusualBirthYear} showRawBirthYear emptyText="Không có năm sinh bất thường." />
      </section>
    </div>
  );
}
