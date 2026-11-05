# Email Templates (API)

Email giao dịch gửi từ `apps/api/src/mail/MailService` (nodemailer + `@react-email/components`, render bằng `@react-email/render`). Mọi template dùng chung layout trong `apps/api/src/mail/templates/components/email-layout.tsx`.

## Danh sách email

| Email | Template | Tone | Gửi từ |
|-------|----------|------|--------|
| Xác thực email tài khoản | `email-verification.email.tsx` | brand (xanh) | `sendVerificationEmail` |
| Đặt lại mật khẩu | `password-reset.email.tsx` | brand | `sendForgotPasswordEmail` |
| Xác minh đăng nhập (magic link học sinh) | `login-verification.email.tsx` | brand | `sendLoginVerificationEmail` |
| Xác nhận yêu cầu nạp thẳng (gửi `ADMIN_EMAIL`) | `direct-topup-approval.email.tsx` | warning (cam) | `sendStudentWalletDirectTopUpApprovalEmail` |
| Biên lai nạp ví (phụ huynh + CSKH) | `tuition-receipt.email.tsx` | success (xanh lá) | `sendStudentWalletTopUpReceiptEmail` |

Mọi email đều kèm bản `text` thuần cho client không đọc HTML.

## Layout chung (`EmailLayout`)

- Thẻ trắng max 600px trên nền xám nhạt, thanh màu 6px phía trên theo tone.
- Header thương hiệu: logo tròn 40px (`assets/logo_mark_sm.png` — logo UNI căn giữa trên nền trắng vuông 144px, CID `brand-logo@unicorns-edu`) + «UniEdu / Học Tin cùng Chuyên tin». Không có logo thì chỉ hiện chữ.
- Hero: khung nền nhạt theo tone, icon emoji trong vòng tròn trắng, eyebrow in hoa, tiêu đề h1.
- Footer: dòng hỗ trợ + host truy cập (`siteUrl`), bên dưới là bản quyền và «Email gửi tự động».
- Primitive dùng lại: `EmailParagraph`, `EmailButton`, `EmailLinkFallback`, `EmailCallout`, `EmailDetailList`, `EmailAmountHighlight`, `EmailMutedNote`. Helper: `formatVnd`, `formatHoursDuration`.
- Màu khớp token web `--ue-*` (`EMAIL_COLORS`). Layout dùng table + inline style. Media query trong `<Head>` (class `ue-px`, `ue-title`, `ue-amount`) thu padding/cỡ chữ trên mobile. Meta `color-scheme: light` tránh client tự đảo màu.

## Biên lai (`tuition-receipt.email.tsx`)

- `variant: 'email'`: bọc trong `EmailLayout` (lời chào phụ huynh, khối số tiền, biên lai, ghi chú PDF đính kèm nếu `hasPdfAttachment`).
- `variant: 'pdf'`: chỉ khối biên lai trên nền trắng. Đây là HTML đưa cho `ReceiptPdfService` (Chromium), ảnh nhúng data URI.
- Khối biên lai: logo main + logo Tin, tiêu đề, bảng meta 2×2 (mã biên lai, ngày lập, học viên, mã học viên), nội dung + người nhận, bảng 3 cột **Ngày / Nội dung / Số tiền** (mã GD nằm dòng phụ dưới nội dung để không bóp cột trên mobile), dòng **Tổng cộng**, con dấu.

## Ảnh inline

- Email dùng CID attachment, không nhúng base64 (Gmail chặn data URI).
- Ảnh biên lai: `receipt-logo-main@`, `receipt-logo-tin@`, `receipt-stamp@unicorns-edu`. Logo thương hiệu header: `brand-logo@unicorns-edu`.
- Nguồn ảnh: `ReceiptAssetsService` đọc `apps/api/src/mail/assets/*` (copy sang `dist` qua glob `mail/assets/**/*` trong `nest-cli.json`). Thiếu file thì trả `null` và email vẫn gửi, chỉ không có ảnh.

## Xem trước khi sửa

Render template bằng `@react-email/render` (ví dụ script `npx tsx` gọi `render(<Template {...props} />)` rồi ghi ra `.html`), mở trên trình duyệt ở 600px và 375px. Spec `apps/api/src/mail/mail.service.spec.ts` kiểm nội dung chính, CID và escape HTML.
