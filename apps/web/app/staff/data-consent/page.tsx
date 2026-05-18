"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import type { UserInfoDto } from "@/dtos/Auth.dto";
import * as authApi from "@/lib/apis/auth.api";
import { readSafeNextPath } from "@/lib/auth-redirect";

const CONSENT_MARKDOWN = `# ĐIỀU KHOẢN ĐỒNG Ý TẠO TÀI KHOẢN, THU THẬP VÀ XỬ LÝ DỮ LIỆU CÁ NHÂN

_Áp dụng đối với nền tảng quản lý gia sư thuộc hệ thống UNICORNS EDU_

---

## LỜI MỞ ĐẦU

UNICORNS EDU cam kết bảo vệ dữ liệu cá nhân của người dùng theo quy định pháp luật Việt Nam hiện hành. Điều khoản này quy định cụ thể về phạm vi thu thập, mục đích sử dụng, lưu trữ, xử lý và bảo mật dữ liệu cá nhân đối với người dùng đăng ký tài khoản trên nền tảng quản lý gia sư của UNICORNS EDU.

Người dùng khi tạo tài khoản đồng nghĩa với việc đã đọc, hiểu và đồng ý toàn bộ nội dung điều khoản này.

---

# CHƯƠNG I - QUY ĐỊNH CHUNG

## Điều 1. Giải thích thuật ngữ

1. **“UNICORNS EDU”** là đơn vị quản lý, sở hữu và vận hành hệ thống nền tảng quản lý gia sư.

2. **“Người dùng”** bao gồm gia sư, ứng viên gia sư, cộng tác viên hoặc cá nhân đăng ký tài khoản trên hệ thống.

3. **“Dữ liệu cá nhân”** là thông tin giúp xác định danh tính của một cá nhân cụ thể.

4. **“Xử lý dữ liệu cá nhân”** bao gồm hoạt động thu thập, lưu trữ, chỉnh sửa, phân tích, chia sẻ hoặc xóa dữ liệu.

## Điều 2. Phạm vi áp dụng

Điều khoản này áp dụng đối với toàn bộ cá nhân sử dụng nền tảng thuộc hệ thống UNICORNS EDU.

---

# CHƯƠNG II - THU THẬP DỮ LIỆU CÁ NHÂN

## Điều 3. Mục đích thu thập dữ liệu

UNICORNS EDU thu thập dữ liệu cá nhân nhằm:

- Tạo và quản lý tài khoản người dùng;
- Xác minh danh tính gia sư;
- Xét duyệt hồ sơ và đánh giá năng lực;
- Kết nối lớp học và quản lý lịch dạy;
- Hỗ trợ chăm sóc người dùng và giải quyết khiếu nại;
- Đảm bảo an ninh, an toàn hệ thống;
- Thực hiện nghĩa vụ theo quy định pháp luật.

## Điều 4. Loại dữ liệu được thu thập

Hệ thống có thể thu thập các thông tin sau:

- Họ và tên đầy đủ;
- Ngày tháng năm sinh;
- Giới tính;
- Số điện thoại liên hệ;
- Địa chỉ email cá nhân;
- Địa chỉ thường trú hoặc tạm trú;
- Ảnh chân dung;
- CCCD/CMND/Hộ chiếu;
- Thông tin học vấn, trường học, chuyên ngành;
- Bằng cấp, chứng chỉ chuyên môn;
- Kinh nghiệm giảng dạy và kỹ năng;
- Thông tin tài khoản ngân hàng (nếu có);
- Các tài liệu minh chứng khác do người dùng tự nguyện cung cấp.

## Điều 5. Nguồn thu thập dữ liệu

Dữ liệu được thu thập trực tiếp từ người dùng thông qua:

- Biểu mẫu đăng ký;
- Hồ sơ tải lên hệ thống;
- Email hoặc tin nhắn liên hệ;
- Quá trình sử dụng website hoặc ứng dụng.

---

# CHƯƠNG III - BẢO MẬT VÀ LƯU TRỮ DỮ LIỆU

## Điều 6. Cam kết bảo mật

UNICORNS EDU cam kết:

- Không tiết lộ dữ liệu cá nhân trái phép;
- Không bán hoặc trao đổi dữ liệu cá nhân vì mục đích thương mại;
- Áp dụng biện pháp kỹ thuật và quản trị phù hợp để bảo vệ dữ liệu;
- Giới hạn quyền truy cập dữ liệu đối với nhân sự có thẩm quyền.

## Điều 7. Thời gian lưu trữ dữ liệu

Dữ liệu cá nhân được lưu trữ:

- Trong thời gian tài khoản còn hoạt động;
- Theo thời hạn pháp luật quy định;
- Theo yêu cầu của cơ quan nhà nước có thẩm quyền.

## Điều 8. Chia sẻ dữ liệu

UNICORNS EDU chỉ chia sẻ dữ liệu trong các trường hợp:

- Có sự đồng ý của người dùng;
- Theo yêu cầu của cơ quan nhà nước có thẩm quyền;
- Để bảo vệ quyền và lợi ích hợp pháp của UNICORNS EDU.

---

# CHƯƠNG IV - QUYỀN VÀ NGHĨA VỤ CỦA NGƯỜI DÙNG

## Điều 9. Quyền của người dùng

Người dùng có quyền:

- Truy cập dữ liệu cá nhân;
- Chỉnh sửa hoặc cập nhật thông tin;
- Yêu cầu xóa dữ liệu;
- Rút lại sự đồng ý xử lý dữ liệu;
- Khiếu nại hoặc yêu cầu hỗ trợ.

## Điều 10. Nghĩa vụ của người dùng

Người dùng cam kết:

- Cung cấp thông tin trung thực và chính xác;
- Không sử dụng giấy tờ giả mạo;
- Tự bảo mật thông tin đăng nhập;
- Chịu trách nhiệm đối với toàn bộ thông tin đã cung cấp.

---

# CHƯƠNG V - ĐIỀU KHOẢN CUỐI CÙNG

## Điều 11. Quyền của UNICORNS EDU

UNICORNS EDU có quyền:

- Xác minh thông tin người dùng;
- Từ chối xét duyệt hồ sơ;
- Tạm khóa hoặc chấm dứt tài khoản nếu phát hiện vi phạm;
- Báo cáo cơ quan có thẩm quyền nếu có dấu hiệu vi phạm pháp luật.

## Điều 12. Sửa đổi điều khoản

UNICORNS EDU có quyền sửa đổi điều khoản này nhằm phù hợp với quy định pháp luật và nhu cầu vận hành hệ thống.

---

# XÁC NHẬN ĐỒNG Ý

- [ ] Tôi xác nhận đã đọc, hiểu và đồng ý với toàn bộ điều khoản thu thập và xử lý dữ liệu cá nhân của UNICORNS EDU.

- [ ] Tôi cam kết toàn bộ thông tin cung cấp là chính xác, trung thực và hợp pháp.
`;

function resolveReturnPath(rawFrom: string | null) {
  const safeFrom = readSafeNextPath(rawFrom);
  if (
    safeFrom &&
    (safeFrom.startsWith("/staff") || safeFrom.startsWith("/admin")) &&
    !safeFrom.startsWith("/staff/data-consent")
  ) {
    return safeFrom;
  }

  return "/staff";
}

export default function StaffDataConsentPage() {
  const [hasReadTerms, setHasReadTerms] = useState(false);
  const [hasConfirmedAccuracy, setHasConfirmedAccuracy] = useState(false);
  const { user, setUser, isAuthReady } = useAuth();
  const queryClient = useQueryClient();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const returnPath = useMemo(
    () => resolveReturnPath(searchParams.get("from")),
    [searchParams],
  );
  const canSubmit = hasReadTerms && hasConfirmedAccuracy;

  useEffect(() => {
    if (!isAuthReady || user.requiresStaffDataConsent) {
      return;
    }

    replace(returnPath);
  }, [isAuthReady, replace, returnPath, user.requiresStaffDataConsent]);

  const acceptMutation = useMutation({
    mutationFn: authApi.acceptDataConsent,
    onSuccess: async (payload) => {
      let nextUser: UserInfoDto = {
        ...user,
        dataConsentAcceptedAt: payload.dataConsentAcceptedAt,
        dataConsentVersion: payload.dataConsentVersion,
        requiresStaffDataConsent: false,
      };

      try {
        nextUser = await authApi.getSession();
      } catch {
        // Keep the local optimistic session if the refresh read fails.
      }

      setUser(nextUser);
      queryClient.setQueryData(["auth", "session"], nextUser);
      toast.success("Đã ghi nhận đồng ý điều khoản.");
      replace(returnPath);
    },
    onError: () => {
      toast.error("Không ghi nhận được xác nhận. Vui lòng thử lại.");
    },
  });

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8">
      <div className="rounded-lg border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Xác nhận bắt buộc
        </p>
        <h1 className="mt-2 text-xl font-semibold text-text-primary sm:text-2xl">
          Điều khoản thu thập và xử lý dữ liệu cá nhân
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
          Staff cần đọc và xác nhận điều khoản này trước khi tiếp tục thao tác
          trên workspace.
        </p>
      </div>

      <div className="max-h-[62vh] overflow-y-auto rounded-lg border border-border-default bg-bg-surface px-4 py-5 shadow-sm sm:px-6">
        <div className="prose prose-sm max-w-none break-words text-text-primary [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_hr]:my-5 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {CONSENT_MARKDOWN}
          </ReactMarkdown>
        </div>
      </div>

      <form
        className="rounded-lg border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            acceptMutation.mutate();
          }
        }}
      >
        <div className="space-y-3">
          <label className="flex cursor-pointer gap-3 text-sm leading-6 text-text-primary">
            <input
              type="checkbox"
              checked={hasReadTerms}
              onChange={(event) => setHasReadTerms(event.target.checked)}
              className="mt-1 size-4 rounded border-border-default text-primary focus:ring-border-focus"
            />
            <span>
              Tôi xác nhận đã đọc, hiểu và đồng ý với toàn bộ điều khoản thu
              thập và xử lý dữ liệu cá nhân của UNICORNS EDU.
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 text-sm leading-6 text-text-primary">
            <input
              type="checkbox"
              checked={hasConfirmedAccuracy}
              onChange={(event) =>
                setHasConfirmedAccuracy(event.target.checked)
              }
              className="mt-1 size-4 rounded border-border-default text-primary focus:ring-border-focus"
            />
            <span>
              Tôi cam kết toàn bộ thông tin cung cấp là chính xác, trung thực và
              hợp pháp.
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-border-default pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-text-muted">
            Phiên bản điều khoản: 2026-05-19.
          </p>
          <button
            type="submit"
            disabled={!canSubmit || acceptMutation.isPending}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
          >
            {acceptMutation.isPending
              ? "Đang ghi nhận..."
              : "Đồng ý và tiếp tục"}
          </button>
        </div>
      </form>
    </section>
  );
}
