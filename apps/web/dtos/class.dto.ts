
import { StaffInfoDto, StaffStatus } from "./staff.dto";

export type ClassStatus = "running" | "ended";

export type ClassPricingMode = "per_session" | "per_block";

/** Khoá học — chương trình học độc lập có nội dung học thuật riêng. */
export interface Course {
    id: string;
    name: string;
    /** Số ngày thời hạn mặc định. null/undefined = vô hạn. */
    defaultDurationDays?: number | null;
    sortOrder: number;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
    /** Present when returned from GET /courses (list). */
    _count?: {
        classes: number;
        lessonPlanMembers: number;
        difficultyLevels: number;
    };
}

/** Mức độ khó do Khoá học tự định nghĩa. */
export interface CourseDifficultyLevel {
    id: string;
    courseId: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface CreateCourseDifficultyLevelPayload {
    name: string;
    sort_order?: number;
}

export interface UpdateCourseDifficultyLevelPayload {
    name?: string;
    sort_order?: number;
    is_active?: boolean;
}

/** Nhân sự thuộc đội giáo án của một Khoá học. */
export interface CourseLessonPlanMember {
    id: string;
    courseId: string;
    staff: {
        id: string;
        fullName: string;
        roles: string[];
        status: string;
    };
}

/** Candidate nhân sự lesson_plan/lesson_plan_head để gán vào đội giáo án. */
export interface LessonPlanStaffOption {
    id: string;
    fullName: string;
    roles: string[];
}

/** Chi tiết khoá học (GET /courses/:id). */
export interface CourseDetail extends Course {
    difficultyLevels?: CourseDifficultyLevel[];
    lessonPlanMembers?: CourseLessonPlanMember[];
}

export interface CreateCoursePayload {
    name: string;
    default_duration_days?: number | null;
    sort_order?: number;
}

export interface UpdateCoursePayload {
    name?: string;
    default_duration_days?: number | null;
    sort_order?: number;
    is_active?: boolean;
}

export interface AssignCourseLessonPlanMembersPayload {
    staff_ids: string[];
}

export interface ClassScheduleItem {
    id?: string;
    dayOfWeek: number;
    from: string;
    to: string;
    teacherId?: string;
    googleCalendarEventId?: string | null;
    meetLink?: string | null;
    createdAt?: string | null;
    deletedAt?: string | null;
    /** Ngày slot có hiệu lực (YYYY-MM-DD). Dùng để backdate khi sửa lịch trễ so với ngày đổi thực tế. */
    effectiveFrom?: string | null;
}

export interface ClassListItem {
    id: string;
    name: string;
    courseId: string;
    course?: Course;
    status: ClassStatus;
    studentCount?: number;
    maxStudents: number;
    noAttendance: boolean;
    allowancePerSessionPerStudent: number;
    /** Expand: per 30-minute block; payroll still uses per-session fields. */
    allowancePerBlockPerStudent?: number | null;
    maxAllowancePerSession?: number | null;
    maxAllowancePerBlock?: number | null;
    scaleAmount?: number | null;
    schedule?: ClassScheduleItem[];
    studentTuitionPerSession?: number | null;
    studentTuitionPerBlock?: number | null;
    pricingMode?: ClassPricingMode;
    tuitionPackageTotal?: number | null;
    tuitionPackageSession?: number | null;
    teachers?: ClassTeacher[];
    createdAt: string;
    updatedAt: string;
}

export interface ClassListMeta {
    total: number;
    page: number;
    limit: number;
}

export interface ClassListResponse {
    data: ClassListItem[];
    meta: ClassListMeta;
}

export interface ClassTeacher {
    id: string;
    fullName: string;
    status?: StaffStatus;
    assignmentStatus?: "active" | "inactive" | string | null;
    /** Custom allowance for this teacher in this class (VNĐ). From class_teachers.custom_allowance. */
    customAllowance?: number | null;
    /** Operating deduction rate for this teacher in this class in percent. */
    operatingDeductionRatePercent?: number | null;
}

export interface ClassTrainingManagerRef {
    id: string;
    fullName: string;
}

export type ClassStudentStatus = "active" | "inactive" | string;

/** CSKH đang gán qua customer_care_service — chỉ id + họ tên trên response lớp. */
export interface ClassStudentCaretaker {
    id: string;
    fullName: string;
}

export interface ClassStudent {
    id: string;
    fullName: string;
    status?: ClassStudentStatus;
    /** Present when viewer may see wallet balance; omitted when redacted. */
    accountBalance?: number | null;
    /** Người chăm sóc (CSKH) đang gán; null/undefined khi chưa gán. */
    customerCareStaff?: ClassStudentCaretaker | null;
    customTuitionPerSession?: number | null;
    customTuitionPerBlock?: number | null;
    customTuitionPackageTotal?: number | null;
    customTuitionPackageSession?: number | null;
    effectiveTuitionPerSession?: number | null;
    effectiveTuitionPackageTotal?: number | null;
    effectiveTuitionPackageSession?: number | null;
    tuitionPackageSource?: "custom" | "class" | "unset";
    totalAttendedSession?: number | null;
}

export interface ClassEndEligibility {
    canEnd: boolean;
    sessionCount: number;
    unpaidSessionCount: number;
    blockReason?: string | null;
    canEndClass?: boolean;
}

export interface ClassDetail extends ClassListItem {
    teachers?: ClassTeacher[];
    students?: ClassStudent[];
    sessionTuitionTotal?: number | null;
    endClassEligibility?: ClassEndEligibility;
    trainingManagerStaffId?: string | null;
    trainingManagerRatePercent?: number | null;
    trainingManager?: ClassTrainingManagerRef | null;
}

export interface CreateClassPayload {
    name: string;
    course_id?: string;
    status?: ClassStatus;
    max_students?: number;
    allowance_per_session_per_student?: number;
    max_allowance_per_session?: number | null;
    scale_amount?: number;
    schedule?: ClassScheduleItem[];
    student_tuition_per_session?: number;
    student_tuition_per_block?: number | null;
    pricing_mode?: ClassPricingMode;
    tuition_package_total?: number;
    tuition_package_session?: number;
    teacher_ids?: string[];
    /** Teachers with optional custom allowance. Takes precedence over teacher_ids when both sent. */
    teachers?: ClassTeacherPayload[];
    student_ids?: string[];
}

export interface UpdateClassPayload {
    id: string;
    name?: string;
    course_id?: string;
    status?: ClassStatus;
    max_students?: number;
    allowance_per_session_per_student?: number;
    max_allowance_per_session?: number | null;
    scale_amount?: number;
    schedule?: ClassScheduleItem[];
    student_tuition_per_session?: number;
    student_tuition_per_block?: number | null;
    tuition_package_total?: number;
    tuition_package_session?: number;
    teacher_ids?: string[];
    teachers?: ClassTeacherPayload[];
    student_ids?: string[];
}

/** Payload for PATCH /class/:id/basic-info */
export interface UpdateClassBasicInfoPayload {
    name?: string;
    course_id?: string;
    status?: ClassStatus;
    max_students?: number;
    no_attendance?: boolean;
    allowance_per_session_per_student?: number;
    max_allowance_per_session?: number | null;
    scale_amount?: number;
    student_tuition_per_session?: number;
    student_tuition_per_block?: number | null;
    tuition_package_total?: number;
    tuition_package_session?: number;
}

export interface UpdateClassPricingModePayload {
    pricing_mode: ClassPricingMode;
}

/** Payload for PATCH /class/:id/teachers */
export interface UpdateClassTeachersPayload {
    teachers: ClassTeacherPayload[];
}

export interface UpdateClassTeacherCompensationPayload {
    teachers: Array<{
        teacher_id: string;
        custom_allowance?: number | null;
        operating_deduction_rate_percent?: number;
    }>;
}

export interface ClassStatusActionPayload {
    reason?: string;
}

export interface ClassTeacherPayload {
    teacher_id: string;
    custom_allowance?: number | null;
    operating_deduction_rate_percent?: number;
}

/** Payload for PATCH /class/:id/schedule */
export interface UpdateClassSchedulePayload {
    schedule: ClassScheduleItem[];
    /** Id các slot cần xoá tường minh (soft-delete). Slot active vắng mặt trong `schedule` mà không có ở đây sẽ được giữ nguyên. */
    removedEntryIds?: string[];
    /** `updatedAt` của lớp lúc client tải dữ liệu — dùng để bật optimistic lock, tránh ghi đè thay đổi của người khác. */
    expectedUpdatedAt?: string;
}

/** Payload for PATCH /class/:id/students */
export interface UpdateClassStudentItemPayload {
    id: string;
    custom_tuition_per_session?: number;
    custom_tuition_package_total?: number;
    custom_tuition_package_session?: number;
}

/** Payload for PATCH /class/:id/students */
export interface UpdateClassStudentsPayload {
    students: UpdateClassStudentItemPayload[];
}

/** Payload for PATCH /class/:id/student-tuition */
export interface UpdateClassStudentTuitionPayload {
    student_id: string;
    custom_tuition_per_session?: number;
    custom_tuition_package_total?: number;
    custom_tuition_package_session?: number;
}

export interface ClassListItemDto {
    id: string;
    name: string;
    status: ClassStatus;
    courseId: string;
    course?: Course;
    studentCount?: number;
    maxStudents?: number;
    createdAt: Date;
    updatedAt: Date;
    teachers: StaffInfoDto[];
}
