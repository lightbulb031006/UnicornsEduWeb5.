import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import {
  GENERIC_LOGIN_ERROR_MESSAGE,
  getLoginErrorToastMessage,
  nestMessageFromResponseData,
} from "./auth-error-message.helpers";

function axiosErrorWithStatus(status: number, data: unknown = {}): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const error = new AxiosError("Request failed", "ERR_BAD_RESPONSE", config);
  error.response = {
    status,
    statusText: "",
    data,
    headers: new AxiosHeaders(),
    config,
  };
  return error;
}

function axiosErrorWithoutResponse(code: string): AxiosError {
  return new AxiosError("Network Error", code, {
    headers: new AxiosHeaders(),
  });
}

describe("nestMessageFromResponseData", () => {
  it("reads a plain string message", () => {
    expect(nestMessageFromResponseData({ message: "  Invalid credentials  " }))
      .toBe("Invalid credentials");
  });

  it("joins a validation message array", () => {
    expect(
      nestMessageFromResponseData({ message: ["password too short", "bad email"] }),
    ).toBe("password too short bad email");
  });

  it("returns null for shapes it cannot read", () => {
    expect(nestMessageFromResponseData(null)).toBeNull();
    expect(nestMessageFromResponseData("nope")).toBeNull();
    expect(nestMessageFromResponseData({ message: "   " })).toBeNull();
    expect(nestMessageFromResponseData({ message: [] })).toBeNull();
  });
});

describe("getLoginErrorToastMessage", () => {
  it("falls back to the generic message for non-axios errors", () => {
    expect(getLoginErrorToastMessage(new Error("boom"))).toBe(
      GENERIC_LOGIN_ERROR_MESSAGE,
    );
  });

  it("prefers the server message on 401 and mentions wrong credentials otherwise", () => {
    expect(
      getLoginErrorToastMessage(
        axiosErrorWithStatus(401, { message: "Tài khoản đã bị khoá." }),
      ),
    ).toBe("Tài khoản đã bị khoá.");
    expect(getLoginErrorToastMessage(axiosErrorWithStatus(401))).toBe(
      "Sai tài khoản hoặc mật khẩu.",
    );
  });

  it("keeps the 400 and 429 hints", () => {
    expect(getLoginErrorToastMessage(axiosErrorWithStatus(400))).toContain(
      "Mật khẩu cần ít nhất 6 ký tự",
    );
    expect(getLoginErrorToastMessage(axiosErrorWithStatus(429))).toContain(
      "Too many requests",
    );
  });

  // Hồi quy cho sự cố production: API trả 500 vì không kết nối được database,
  // nhưng người dùng chỉ thấy "Đăng nhập thất bại." và tưởng mình sai mật khẩu.
  it("says a 500 is a server-side incident, not a wrong password", () => {
    const message = getLoginErrorToastMessage(
      axiosErrorWithStatus(500, { message: "Internal server error" }),
    );
    expect(message).toContain("500");
    expect(message).toContain("không phải sai mật khẩu");
    // Không được lộ message vô nghĩa của Nest ra cho người dùng cuối.
    expect(message).not.toContain("Internal server error");
    expect(message).not.toBe(GENERIC_LOGIN_ERROR_MESSAGE);
  });

  it("treats gateway statuses as a temporary outage", () => {
    for (const status of [502, 503, 504]) {
      const message = getLoginErrorToastMessage(axiosErrorWithStatus(status));
      expect(message).toContain(String(status));
      expect(message).toContain("thử lại sau");
    }
  });

  it("distinguishes an unreachable server from a rejected login", () => {
    expect(getLoginErrorToastMessage(axiosErrorWithoutResponse("ERR_NETWORK"))).toBe(
      "Không kết nối được tới máy chủ. Kiểm tra kết nối mạng hoặc thử lại sau ít phút.",
    );
    expect(
      getLoginErrorToastMessage(axiosErrorWithoutResponse("ECONNABORTED")),
    ).toBe("Máy chủ phản hồi quá lâu. Vui lòng thử lại sau ít phút.");
  });
});
