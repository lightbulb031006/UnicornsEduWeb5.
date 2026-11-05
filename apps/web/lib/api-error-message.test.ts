import { describe, expect, it } from "vitest";
import {
  getStatusErrorMessage,
  localizeErrorMessage,
  markGenericLocalizedError,
  NETWORK_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  translateErrorMessage,
} from "./api-error-message";
import { getMutationErrorMessage } from "./mutation-feedback";

describe("translateErrorMessage", () => {
  it("giữ nguyên message đã là tiếng Việt", () => {
    expect(translateErrorMessage("Lớp đã kết thúc.")).toBe("Lớp đã kết thúc.");
  });

  it("dịch message khớp chính xác, không phân biệt hoa thường và dấu chấm cuối", () => {
    expect(translateErrorMessage("Invalid credentials")).toBe(
      "Tài khoản hoặc mật khẩu không đúng.",
    );
    expect(translateErrorMessage("insufficient balance for this withdrawal.")).toBe(
      "Số dư không đủ để rút.",
    );
    expect(translateErrorMessage("Unauthorized")).toBe(SESSION_EXPIRED_MESSAGE);
    expect(translateErrorMessage("Network Error")).toBe(NETWORK_ERROR_MESSAGE);
  });

  it("dịch '<entity> not found' kể cả khi kèm mã định danh", () => {
    expect(translateErrorMessage("Class UNICL-abc123 not found")).toBe(
      "Không tìm thấy lớp học. Có thể dữ liệu đã bị xoá, vui lòng tải lại trang.",
    );
    expect(translateErrorMessage("Class not found: UNICL-abc123")).toContain(
      "Không tìm thấy lớp học",
    );
    expect(translateErrorMessage("Student not found.")).toContain(
      "Không tìm thấy học sinh",
    );
    expect(translateErrorMessage("Something weird not found")).toContain(
      "Không tìm thấy dữ liệu",
    );
    expect(translateErrorMessage("One or more students not found")).toContain(
      "Có học sinh không tồn tại",
    );
  });

  it("dịch mã định danh sai định dạng", () => {
    expect(
      translateErrorMessage(
        'Invalid staff id: "abc". Expected format: UNISTAFF-xxxxxxxxxx',
      ),
    ).toBe("Mã nhân sự không hợp lệ. Vui lòng tải lại trang.");
  });

  it("dịch message mặc định của class-validator theo nhãn field", () => {
    expect(translateErrorMessage("email must be an email")).toBe(
      "Email không đúng định dạng.",
    );
    expect(
      translateErrorMessage("password must be longer than or equal to 6 characters"),
    ).toBe("Mật khẩu phải có ít nhất 6 ký tự.");
    expect(translateErrorMessage("items.0.amount must not be less than 0")).toBe(
      "Số tiền phải lớn hơn hoặc bằng 0.",
    );
    expect(translateErrorMessage("fooBar should not be empty")).toBe(
      "Một trường thông tin không được để trống.",
    );
    expect(translateErrorMessage("month must use YYYY-MM format.")).toBe(
      "Tháng không đúng định dạng.",
    );
  });

  it("dịch lỗi axios dạng status/timeout", () => {
    expect(translateErrorMessage("Request failed with status code 500")).toBe(
      getStatusErrorMessage(500),
    );
    expect(translateErrorMessage("timeout of 10000ms exceeded")).toContain(
      "phản hồi quá lâu",
    );
  });

  it("trả null khi không nhận diện được", () => {
    expect(translateErrorMessage("Prisma exploded somewhere")).toBeNull();
  });
});

describe("localizeErrorMessage", () => {
  it("gộp mảng message của ValidationPipe, bỏ trùng", () => {
    expect(
      localizeErrorMessage(
        ["email must be an email", "email must be an email", "title should not be empty"],
        400,
      ),
    ).toEqual({
      message: "Email không đúng định dạng. Tiêu đề không được để trống.",
      isGeneric: false,
    });
  });

  it("dùng câu theo status khi message không nhận diện được", () => {
    expect(localizeErrorMessage("Prisma exploded somewhere", 500)).toEqual({
      message: getStatusErrorMessage(500),
      isGeneric: true,
    });
    expect(localizeErrorMessage(undefined, 403)).toEqual({
      message: getStatusErrorMessage(403),
      isGeneric: true,
    });
  });

  it("trả null khi không có message và không có status", () => {
    expect(localizeErrorMessage(undefined)).toBeNull();
  });
});

describe("getMutationErrorMessage", () => {
  const axiosLike = (status: number, message: unknown) => ({
    message: `Request failed with status code ${status}`,
    response: { status, data: { message } },
  });

  it("hiện message đã dịch khi nhận diện được", () => {
    expect(
      getMutationErrorMessage(axiosLike(401, "Invalid credentials"), "Lỗi"),
    ).toBe("Tài khoản hoặc mật khẩu không đúng.");
  });

  it("ưu tiên fallback theo ngữ cảnh khi message tiếng Anh lạ", () => {
    expect(
      getMutationErrorMessage(axiosLike(400, "Weird backend thing"), "Không thể lưu lớp."),
    ).toBe("Không thể lưu lớp.");
    expect(getMutationErrorMessage(new Error("boom"), "Không thể lưu lớp.")).toBe(
      "Không thể lưu lớp.",
    );
  });

  it("dùng fallback khi interceptor đã thay message lạ bằng câu chung", () => {
    const error = axiosLike(500, getStatusErrorMessage(500));
    markGenericLocalizedError(error);
    expect(getMutationErrorMessage(error, "Không thể xoá buổi học.")).toBe(
      "Không thể xoá buổi học.",
    );
  });

  it("giữ message tiếng Việt từ backend", () => {
    expect(
      getMutationErrorMessage(axiosLike(400, "Lớp đã kết thúc."), "Lỗi"),
    ).toBe("Lớp đã kết thúc.");
  });
});
