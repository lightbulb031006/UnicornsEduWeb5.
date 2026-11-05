/**
 * Dịch thông báo lỗi kỹ thuật (tiếng Anh từ backend NestJS / class-validator / axios)
 * sang câu tiếng Việt dễ hiểu cho người dùng cuối.
 *
 * Thứ tự: giữ nguyên câu đã là tiếng Việt → từ điển khớp chính xác → mẫu regex
 * → câu chung theo HTTP status. Không khớp gì thì trả `null` để caller tự chọn fallback.
 */

const VIETNAMESE_CHAR_PATTERN =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

export const SESSION_EXPIRED_MESSAGE =
  "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
export const NETWORK_ERROR_MESSAGE =
  "Không kết nối được máy chủ. Vui lòng kiểm tra mạng rồi thử lại.";
export const TIMEOUT_ERROR_MESSAGE =
  "Máy chủ phản hồi quá lâu. Vui lòng thử lại.";
const FORBIDDEN_MESSAGE = "Bạn không có quyền thực hiện thao tác này.";
const NOT_FOUND_MESSAGE =
  "Không tìm thấy dữ liệu. Có thể dữ liệu đã bị xoá, vui lòng tải lại trang.";
const INVALID_INPUT_MESSAGE = "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.";
const SERVER_ERROR_MESSAGE =
  "Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút.";
const RATE_LIMIT_MESSAGE =
  "Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại.";
const FILE_TOO_LARGE_MESSAGE = "Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn.";
const RELOAD_MESSAGE =
  "Thiếu thông tin cần thiết. Vui lòng tải lại trang rồi thử lại.";
const DUPLICATE_ID_MESSAGE = "Hệ thống tạo mã bị trùng. Vui lòng thử lại.";
const MISSING_STAFF_PROFILE_MESSAGE =
  "Tài khoản chưa được liên kết hồ sơ nhân sự. Vui lòng liên hệ quản trị viên.";
const MISSING_STUDENT_PROFILE_MESSAGE =
  "Tài khoản chưa được liên kết hồ sơ học sinh. Vui lòng liên hệ quản trị viên.";
const MISSING_ACTOR_MESSAGE =
  "Không xác định được người thực hiện. Vui lòng đăng nhập lại.";
const PAYMENT_UNAVAILABLE_MESSAGE =
  "Chức năng nạp tiền tạm thời gián đoạn. Vui lòng thử lại sau.";
const SYSTEM_KEY_MESSAGE =
  "Hệ thống chưa được cấu hình đúng. Vui lòng liên hệ quản trị viên.";
const VERIFY_LINK_INVALID_MESSAGE =
  "Liên kết xác minh không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu gửi lại email.";
const RESET_LINK_INVALID_MESSAGE =
  "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu gửi lại.";

/** Khoá: message viết thường, bỏ dấu chấm cuối. */
const EXACT_MESSAGES: Record<string, string> = {
  // Xác thực & phiên đăng nhập
  "invalid credentials": "Tài khoản hoặc mật khẩu không đúng.",
  unauthorized: SESSION_EXPIRED_MESSAGE,
  "invalid or expired token": SESSION_EXPIRED_MESSAGE,
  "invalid or expired refresh token": SESSION_EXPIRED_MESSAGE,
  "missing access token": SESSION_EXPIRED_MESSAGE,
  "token refresh failed": SESSION_EXPIRED_MESSAGE,
  "inactive account": "Tài khoản đã bị khoá hoặc chưa được kích hoạt.",
  "handle already exists":
    "Tên đăng nhập đã có người dùng. Vui lòng chọn tên khác.",
  "email already exists": "Email này đã được đăng ký cho tài khoản khác.",
  "email or account handle already exists":
    "Email hoặc tên đăng nhập đã được sử dụng.",
  "email is required for verification":
    "Tài khoản chưa có email để xác minh. Vui lòng cập nhật email trước.",
  "verification token is required": VERIFY_LINK_INVALID_MESSAGE,
  "invalid or expired verification token": VERIFY_LINK_INVALID_MESSAGE,
  "invalid verification token payload": VERIFY_LINK_INVALID_MESSAGE,
  "reset password token is required": RESET_LINK_INVALID_MESSAGE,
  "invalid or expired reset password token": RESET_LINK_INVALID_MESSAGE,
  "invalid reset password token payload": RESET_LINK_INVALID_MESSAGE,
  "unable to send forgot password email":
    "Không gửi được email đặt lại mật khẩu. Vui lòng thử lại sau.",
  "user not found after verification":
    "Không tìm thấy tài khoản sau khi xác minh. Vui lòng liên hệ quản trị viên.",
  "login request not found":
    "Yêu cầu đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.",
  "login request expired":
    "Yêu cầu đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  "login request not verified yet":
    "Bạn chưa xác nhận đăng nhập. Vui lòng kiểm tra email.",
  "invalid activation secret": "Mã kích hoạt không đúng.",
  "target must be a student account":
    "Tài khoản được chọn không phải tài khoản học sinh.",
  "actor not found": MISSING_ACTOR_MESSAGE,
  "missing api key": SYSTEM_KEY_MESSAGE,
  "invalid api key": SYSTEM_KEY_MESSAGE,
  "landing api key is not configured": SYSTEM_KEY_MESSAGE,

  // Phân quyền & quyền truy cập lớp
  forbidden: FORBIDDEN_MESSAGE,
  "forbidden resource": FORBIDDEN_MESSAGE,
  "only authorized roles can access this resource": FORBIDDEN_MESSAGE,
  "you do not have access to this class":
    "Bạn không có quyền truy cập lớp học này.",
  "you are not enrolled in this class": "Bạn chưa tham gia lớp học này.",
  "this class has expired": "Lớp học đã hết hạn.",
  "content access period has expired":
    "Đã hết thời hạn truy cập nội dung này.",
  "student not a member of the class": "Học sinh không thuộc lớp này.",
  "student is not enrolled in this class": "Học sinh không thuộc lớp này.",
  "staff profile required": MISSING_STAFF_PROFILE_MESSAGE,
  "staff profile is not available": MISSING_STAFF_PROFILE_MESSAGE,
  "staff profile not found": MISSING_STAFF_PROFILE_MESSAGE,
  "user has no linked staff record": MISSING_STAFF_PROFILE_MESSAGE,
  "student profile not found": MISSING_STUDENT_PROFILE_MESSAGE,
  "user has no linked student record": MISSING_STUDENT_PROFILE_MESSAGE,

  // Lớp học, nội dung, bài tập
  "assignment has no duration": "Bài kiểm tra chưa được đặt thời lượng.",
  "assignment has no lesson": "Bài tập chưa được gắn tiết học.",
  "practice assignments require openat":
    "Bài luyện tập cần có thời gian mở.",
  "only practice assignments have openat":
    "Chỉ bài luyện tập mới được đặt thời gian mở.",
  "openat is not a valid date": "Thời gian mở không hợp lệ.",
  "closeat is not a valid date": "Thời gian đóng không hợp lệ.",
  "progress is only for theory lessons":
    "Chỉ tiết lý thuyết mới ghi nhận tiến độ.",
  "attempts are only for practice assignments":
    "Chỉ bài luyện tập mới có lượt làm bài.",
  "lesson is already in this class content list":
    "Tiết học này đã có trong nội dung lớp.",
  "question is used by practice lessons":
    "Câu hỏi đang được dùng trong bài luyện tập nên không thể xoá.",
  "module does not belong to the specified course":
    "Học phần không thuộc khoá học đã chọn.",
  "difficulty level does not belong to the specified course":
    "Mức độ không thuộc khoá học đã chọn.",
  "resource link label requires a resource link":
    "Vui lòng nhập đường dẫn tài liệu trước khi đặt tên hiển thị.",
  "some ids do not belong to this class or do not exist":
    "Một số mục không thuộc lớp này hoặc đã bị xoá. Vui lòng tải lại trang.",
  "only existing class teachers can have compensation updated":
    "Chỉ cập nhật được thù lao cho giáo viên đang dạy lớp này.",
  "class teacher not found for this class and teacher":
    "Giáo viên không thuộc lớp này.",
  "invalid timeline cursor":
    "Không tải được thêm dữ liệu. Vui lòng tải lại trang.",

  // Tài chính, ví, lương
  "insufficient balance for this withdrawal": "Số dư không đủ để rút.",
  "amount must be a positive integer": "Số tiền phải là số nguyên dương.",
  "amount must be a non-zero number": "Số tiền phải khác 0.",
  "assistant cannot top up student balance directly":
    "Trợ giảng không được nạp tiền trực tiếp vào ví học sinh.",
  "use sepay top-up order endpoint for self-service wallet top-ups":
    "Vui lòng nạp tiền bằng mã QR thanh toán.",
  "sepay order amount must be a positive integer":
    "Số tiền nạp phải là số nguyên dương.",
  "sepay order_code must be 6-50 alphanumeric characters":
    "Mã đơn nạp tiền không hợp lệ.",
  "sepay wallet order storage is not available": PAYMENT_UNAVAILABLE_MESSAGE,
  "a rate already exists for this effective date":
    "Đã có mức áp dụng cho ngày hiệu lực này.",
  "fixed salary amount must be a non-negative integer":
    "Lương cố định phải là số nguyên không âm.",
  "fixed-salary operating rate percent must be between 0 and 100":
    "Tỷ lệ vận hành phải nằm trong khoảng 0–100%.",
  "fixed-salary override is only allowed for a role this staff currently holds":
    "Chỉ đặt được lương cố định riêng cho vai trò nhân sự đang đảm nhận.",
  "duplicate roletype found in bulk payload":
    "Mỗi vai trò chỉ được xuất hiện một lần.",
  "each roletype may appear only once in the payload":
    "Mỗi vai trò chỉ được xuất hiện một lần.",
  "cannot set customer care profit percent without a customer care staff":
    "Cần chọn nhân sự chăm sóc khách hàng trước khi đặt % lợi nhuận.",
  "customer care profit percent must be a valid number":
    "% lợi nhuận chăm sóc khách hàng phải là số hợp lệ.",
  "customer care profit percent must be between 0.00 and 0.99":
    "% lợi nhuận phải nằm trong khoảng 0–99%.",
  "profitpercent must be between 0 and 0.99":
    "% lợi nhuận phải nằm trong khoảng 0–99%.",
  "trainingmanagerratepercent must be between 0 and 100":
    "Tỷ lệ phải nằm trong khoảng 0–100%.",
  "selected staff is not eligible for customer care assignment":
    "Nhân sự được chọn không thể phụ trách chăm sóc khách hàng.",
  "customer-care staff not found for this assistant manager":
    "Không tìm thấy nhân sự chăm sóc khách hàng thuộc quản lý này.",
  "paymentstatus must be pending or paid": "Trạng thái thanh toán không hợp lệ.",
  "paymentstatus must be either pending or paid":
    "Trạng thái thanh toán không hợp lệ.",

  // Lý do / nội dung bắt buộc
  "reason is required": "Vui lòng nhập lý do.",
  "reason is required for manual balance changes":
    "Vui lòng nhập lý do khi điều chỉnh số dư.",
  "student full name is required": "Vui lòng nhập họ tên học sinh.",
  "title is required": "Vui lòng nhập tiêu đề.",
  "content is required": "Vui lòng nhập nội dung.",
  "message must not be empty": "Nội dung không được để trống.",
  "at least one audience is required":
    "Vui lòng chọn ít nhất một đối tượng áp dụng.",
  "customersource is required for this row":
    "Vui lòng chọn nguồn khách hàng cho dòng này.",
  "invalid regulation payload": "Dữ liệu quy định không hợp lệ.",

  // Thông báo
  "notification audience must include at least one target when targetall is false":
    "Vui lòng chọn ít nhất một người nhận thông báo.",
  "notification feed is not available for this role":
    "Vai trò hiện tại không xem được thông báo.",
  "one or more selected users cannot receive notifications":
    "Có người được chọn không thể nhận thông báo.",
  "only eligible admin or staff accounts can receive notifications":
    "Chỉ tài khoản quản trị hoặc nhân sự hợp lệ mới nhận được thông báo.",
  "published notifications must use the push endpoint to apply changes":
    "Thông báo đã phát hành không sửa trực tiếp được. Vui lòng gửi lại thông báo để cập nhật.",

  // Ngày tháng & bộ lọc
  "days must be a positive integer": "Số ngày phải là số nguyên dương.",
  "month range must not exceed 36 months":
    "Khoảng thời gian không được vượt quá 36 tháng.",
  "month is required when scope is month": "Vui lòng chọn tháng.",
  "frommonth/fromyear must not be after tomonth/toyear":
    "Tháng bắt đầu không được sau tháng kết thúc.",
  "asofdate must be a valid date": "Ngày không hợp lệ.",
  "cost date must be a valid iso date": "Ngày chi không hợp lệ.",
  "cost id is required": RELOAD_MESSAGE,
  "session id is required": RELOAD_MESSAGE,

  // Mặc định của NestJS / multer / pipe
  "bad request": INVALID_INPUT_MESSAGE,
  "not found": NOT_FOUND_MESSAGE,
  conflict:
    "Dữ liệu đã tồn tại hoặc vừa bị thay đổi. Vui lòng tải lại trang và thử lại.",
  "internal server error": SERVER_ERROR_MESSAGE,
  "service unavailable": SERVER_ERROR_MESSAGE,
  "bad gateway": SERVER_ERROR_MESSAGE,
  "too many requests": RATE_LIMIT_MESSAGE,
  "throttlerexception: too many requests": RATE_LIMIT_MESSAGE,
  "file too large": FILE_TOO_LARGE_MESSAGE,
  "payload too large": FILE_TOO_LARGE_MESSAGE,
  "unexpected field": "Tệp tải lên không hợp lệ.",
  "validation failed (uuid is expected)":
    "Mã định danh không hợp lệ. Vui lòng tải lại trang.",
  "validation failed (numeric string is expected)": "Giá trị số không hợp lệ.",
  "validation failed (boolean string is expected)": INVALID_INPUT_MESSAGE,

  // Lỗi mạng phía trình duyệt
  "network error": NETWORK_ERROR_MESSAGE,
  "failed to fetch": NETWORK_ERROR_MESSAGE,
};

/** Tên thực thể trong câu "X not found" / "Invalid X id". Khoá viết thường. */
const ENTITY_LABELS: Record<string, string> = {
  class: "lớp học",
  "class survey": "khảo sát lớp",
  "class content item": "nội dung lớp",
  student: "học sinh",
  staff: "nhân sự",
  "assistant staff": "trợ giảng",
  "customer care staff": "nhân sự chăm sóc khách hàng",
  "training manager staff": "quản lý đào tạo",
  user: "tài khoản",
  bonus: "khoản thưởng",
  cost: "khoản chi",
  session: "buổi học",
  "makeup schedule event": "buổi học bù",
  course: "khoá học",
  module: "học phần",
  lesson: "tiết học",
  "lesson resource": "tài nguyên giáo án",
  "lesson task": "công việc giáo án",
  "staff lesson task": "công việc giáo án",
  "lesson output": "bài giáo án",
  assignment: "bài tập",
  attempt: "lượt làm bài",
  "essay answer": "bài làm tự luận",
  question: "câu hỏi",
  "question link": "câu hỏi trong bài luyện tập",
  notification: "thông báo",
  "published notification": "thông báo",
  achievement: "thành tích",
  "gallery item": "ảnh",
  device: "thiết bị",
  regulation: "quy định",
  "extra allowance": "khoản phụ cấp",
  "action history": "lịch sử thao tác",
  "direct top-up request": "yêu cầu nạp tiền",
  "role default tax deduction rate": "mức khấu trừ thuế mặc định của vai trò",
  "staff override tax deduction rate": "mức khấu trừ thuế riêng của nhân sự",
  entity: "dữ liệu",
};

/** Tên field (camelCase, viết thường) → nhãn hiển thị. */
const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  password: "Mật khẩu",
  newpassword: "Mật khẩu mới",
  currentpassword: "Mật khẩu hiện tại",
  accounthandle: "Tên đăng nhập",
  fullname: "Họ tên",
  name: "Tên",
  studentname: "Tên học sinh",
  classname: "Tên lớp",
  title: "Tiêu đề",
  content: "Nội dung",
  description: "Mô tả",
  message: "Nội dung",
  note: "Ghi chú",
  reason: "Lý do",
  label: "Nhãn",
  phone: "Số điện thoại",
  school: "Trường",
  province: "Tỉnh/thành",
  gender: "Giới tính",
  birthday: "Ngày sinh",
  dateofbirth: "Ngày sinh",
  amount: "Số tiền",
  status: "Trạng thái",
  paymentstatus: "Trạng thái thanh toán",
  teacherpaymentstatus: "Trạng thái thanh toán giáo viên",
  type: "Loại",
  roletype: "Vai trò",
  roles: "Vai trò",
  month: "Tháng",
  year: "Năm",
  frommonth: "Tháng bắt đầu",
  tomonth: "Tháng kết thúc",
  fromyear: "Năm bắt đầu",
  toyear: "Năm kết thúc",
  date: "Ngày",
  datefrom: "Ngày bắt đầu",
  dateto: "Ngày kết thúc",
  startdate: "Ngày bắt đầu",
  enddate: "Ngày kết thúc",
  originaldate: "Ngày gốc",
  effectivefrom: "Ngày hiệu lực",
  asofdate: "Ngày",
  starttime: "Giờ bắt đầu",
  endtime: "Giờ kết thúc",
  from: "Giờ bắt đầu",
  to: "Giờ kết thúc",
  openat: "Thời gian mở",
  closeat: "Thời gian đóng",
  durationminutes: "Thời lượng",
  resourcelink: "Đường dẫn tài liệu",
  sortorder: "Thứ tự",
  order: "Thứ tự",
  search: "Từ khoá tìm kiếm",
  options: "Các lựa chọn",
  explanation: "Lời giải",
  tags: "Thẻ",
};

const UNKNOWN_FIELD_LABEL = "Một trường thông tin";

function normalizeKey(message: string): string {
  return message.trim().replace(/\s+/g, " ").replace(/\.+$/, "").toLowerCase();
}

function fieldLabel(rawField: string): string {
  // class-validator lồng nhau trả "items.0.amount" → lấy segment cuối.
  const lastSegment = rawField.split(".").pop() ?? rawField;
  return FIELD_LABELS[lastSegment.toLowerCase()] ?? UNKNOWN_FIELD_LABEL;
}

function lookupEntity(rawEntity: string): string | null {
  const key = rawEntity.trim().toLowerCase();
  if (!key) return null;
  return (
    ENTITY_LABELS[key] ??
    ENTITY_LABELS[key.replace(/es$/, "")] ??
    ENTITY_LABELS[key.replace(/s$/, "")] ??
    null
  );
}

/** Bỏ token trông như mã (UNICL-xxx, uuid, số...) khỏi "Class UNICL-1 not found". */
function stripIdTokens(text: string): string {
  return text
    .split(" ")
    .filter((token) => token && !/\d/.test(token) && !/^["'`]/.test(token))
    .join(" ");
}

type PatternRule = {
  pattern: RegExp;
  translate: (match: RegExpMatchArray) => string;
};

const PATTERN_RULES: PatternRule[] = [
  {
    pattern: /^could not generate a unique .+ id/i,
    translate: () => DUPLICATE_ID_MESSAGE,
  },
  {
    pattern: /^missing actor for /i,
    translate: () => MISSING_ACTOR_MESSAGE,
  },
  {
    pattern: /^sepay webhook /i,
    translate: () => PAYMENT_UNAVAILABLE_MESSAGE,
  },
  {
    pattern: /^question (\d+): content is required$/i,
    translate: (m) => `Câu ${m[1]}: chưa nhập nội dung.`,
  },
  {
    pattern: /^invalid ([a-z ]+?) id\b/i,
    translate: (m) => {
      const entity = lookupEntity(m[1]);
      return entity
        ? `Mã ${entity} không hợp lệ. Vui lòng tải lại trang.`
        : "Mã định danh không hợp lệ. Vui lòng tải lại trang.";
    },
  },
  {
    pattern: /^one or more ([a-z ]+?) not found$/i,
    translate: (m) => {
      const entity = lookupEntity(m[1]);
      return entity
        ? `Có ${entity} không tồn tại hoặc đã bị xoá. Vui lòng tải lại trang.`
        : NOT_FOUND_MESSAGE;
    },
  },
  {
    pattern: /^(.+?) not found(?::.*)?$/i,
    translate: (m) => {
      const entity = lookupEntity(stripIdTokens(m[1]));
      return entity
        ? `Không tìm thấy ${entity}. Có thể dữ liệu đã bị xoá, vui lòng tải lại trang.`
        : NOT_FOUND_MESSAGE;
    },
  },
  {
    pattern: /^(\S+) must contain at least one id$/i,
    translate: () => "Vui lòng chọn ít nhất một mục.",
  },
  {
    pattern: /^(\S+) must (?:use|be in) (.+?) format/i,
    translate: (m) => `${fieldLabel(m[1])} không đúng định dạng.`,
  },
  {
    pattern: /^(\S+) (?:must not|should not) be empty$/i,
    translate: (m) => `${fieldLabel(m[1])} không được để trống.`,
  },
  {
    pattern: /^(\S+) must be longer than or equal to (\d+) characters$/i,
    translate: (m) => `${fieldLabel(m[1])} phải có ít nhất ${m[2]} ký tự.`,
  },
  {
    pattern: /^(\S+) must be shorter than or equal to (\d+) characters$/i,
    translate: (m) => `${fieldLabel(m[1])} chỉ được tối đa ${m[2]} ký tự.`,
  },
  {
    pattern: /^(\S+) must not be less than (-?[\d.]+)$/i,
    translate: (m) =>
      `${fieldLabel(m[1])} phải lớn hơn hoặc bằng ${m[2]}.`,
  },
  {
    pattern: /^(\S+) must not be greater than (-?[\d.]+)$/i,
    translate: (m) => `${fieldLabel(m[1])} phải nhỏ hơn hoặc bằng ${m[2]}.`,
  },
  {
    pattern: /^(\S+) must be between (\S+) and (\S+?)$/i,
    translate: (m) =>
      `${fieldLabel(m[1])} phải nằm trong khoảng ${m[2]} đến ${m[3]}.`,
  },
  {
    pattern: /^(\S+) must be one of the following values/i,
    translate: (m) =>
      `${fieldLabel(m[1])} không nằm trong các lựa chọn cho phép.`,
  },
  {
    pattern: /^(\S+) must be an email$/i,
    translate: () => "Email không đúng định dạng.",
  },
  {
    pattern: /^(\S+) must be a positive (?:number|integer)$/i,
    translate: (m) => `${fieldLabel(m[1])} phải là số dương.`,
  },
  {
    pattern: /^(\S+) must be (?:a |an )?(?:string|number|integer number|boolean|array|object|valid .+|uuid|date .+|url .+|.+ string)$/i,
    translate: (m) => `${fieldLabel(m[1])} không hợp lệ.`,
  },
  {
    pattern: /^property (\S+) should not exist$/i,
    translate: () => INVALID_INPUT_MESSAGE,
  },
  {
    pattern: /^cannot (?:get|post|put|patch|delete) /i,
    translate: () =>
      "Chức năng này hiện không khả dụng. Vui lòng tải lại trang hoặc liên hệ quản trị viên.",
  },
  {
    pattern: /^timeout of \d+ms exceeded$/i,
    translate: () => TIMEOUT_ERROR_MESSAGE,
  },
  {
    pattern: /^request failed with status code (\d+)$/i,
    translate: (m) =>
      getStatusErrorMessage(Number(m[1])) ?? INVALID_INPUT_MESSAGE,
  },
];

export function isVietnameseMessage(message: string): boolean {
  return VIETNAMESE_CHAR_PATTERN.test(message);
}

/** Câu chung theo HTTP status, dùng khi message gốc không dịch được. */
export function getStatusErrorMessage(
  status: number | undefined,
): string | null {
  if (!status) return null;
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return FORBIDDEN_MESSAGE;
  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status === 409) return EXACT_MESSAGES.conflict;
  if (status === 413) return FILE_TOO_LARGE_MESSAGE;
  if (status === 429) return RATE_LIMIT_MESSAGE;
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  if (status >= 400) return INVALID_INPUT_MESSAGE;
  return null;
}

/**
 * Dịch một message lỗi. Trả về `null` nếu là tiếng Anh nhưng không nhận diện được
 * (caller tự chọn fallback theo ngữ cảnh hoặc theo status).
 */
export function translateErrorMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  if (isVietnameseMessage(trimmed)) return trimmed;

  const exact = EXACT_MESSAGES[normalizeKey(trimmed)];
  if (exact) return exact;

  const singleLine = trimmed.replace(/\s+/g, " ").replace(/\.+$/, "");
  for (const rule of PATTERN_RULES) {
    const match = singleLine.match(rule.pattern);
    if (match) return rule.translate(match);
  }
  return null;
}

/** Lỗi mà message gốc không nhận diện được, đã bị thay bằng câu chung theo status. */
const genericLocalizedErrors = new WeakSet<object>();

export function markGenericLocalizedError(error: object): void {
  genericLocalizedErrors.add(error);
}

export function isGenericLocalizedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    genericLocalizedErrors.has(error)
  );
}

export type LocalizedErrorMessage = {
  message: string;
  /** true khi không nhận diện được message gốc và phải dùng câu chung theo status. */
  isGeneric: boolean;
};

/**
 * Dịch `message` của body lỗi NestJS (string hoặc string[] từ ValidationPipe).
 * Trả `null` khi không có gì để hiển thị (vd. request bị huỷ).
 */
export function localizeErrorMessage(
  rawMessage: unknown,
  status?: number,
): LocalizedErrorMessage | null {
  const parts = (Array.isArray(rawMessage) ? rawMessage : [rawMessage]).filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );

  const statusMessage = getStatusErrorMessage(status);
  const translated: string[] = [];
  let isGeneric = false;

  for (const part of parts) {
    const result = translateErrorMessage(part);
    if (result) {
      translated.push(result);
    } else {
      isGeneric = true;
      if (statusMessage) translated.push(statusMessage);
    }
  }

  const unique = [...new Set(translated)];
  if (unique.length > 0) {
    return { message: unique.join(" "), isGeneric };
  }
  if (statusMessage) return { message: statusMessage, isGeneric: true };
  return null;
}
