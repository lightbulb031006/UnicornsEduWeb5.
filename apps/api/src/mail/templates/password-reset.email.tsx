import {
  EmailButton,
  EmailCallout,
  EmailLayout,
  EmailLinkFallback,
  EmailMutedNote,
  EmailParagraph,
  EMAIL_COLORS,
  formatHoursDuration,
} from './components/email-layout';

export interface PasswordResetEmailProps {
  recipientEmail: string;
  resetLink: string;
  expiresInHours: number;
  logoSrc?: string | null;
  siteUrl?: string | null;
}

export function PasswordResetEmail({
  recipientEmail,
  resetLink,
  expiresInHours,
  logoSrc = null,
  siteUrl = null,
}: PasswordResetEmailProps) {
  return (
    <EmailLayout
      preview="Đặt lại mật khẩu UniEdu của bạn"
      icon="🔑"
      eyebrow="Bảo mật tài khoản"
      title="Đặt lại mật khẩu"
      logoSrc={logoSrc}
      siteUrl={siteUrl}
    >
      <EmailParagraph>Xin chào,</EmailParagraph>
      <EmailParagraph>
        UniEdu nhận được yêu cầu đổi mật khẩu cho tài khoản{' '}
        <strong style={{ color: EMAIL_COLORS.text }}>{recipientEmail}</strong>.
        Bấm nút bên dưới để tạo mật khẩu mới.
      </EmailParagraph>

      <EmailButton href={resetLink}>Đổi mật khẩu</EmailButton>

      <EmailLinkFallback href={resetLink} />

      <EmailCallout tone="danger" title="Không phải bạn yêu cầu?">
        Hãy bỏ qua email này. Mật khẩu hiện tại vẫn giữ nguyên nếu liên kết
        không được sử dụng.
      </EmailCallout>

      <EmailMutedNote>
        ⏱ Liên kết có hiệu lực trong{' '}
        <strong style={{ color: EMAIL_COLORS.textSecondary }}>
          {formatHoursDuration(expiresInHours)}
        </strong>{' '}
        và tự vô hiệu sau khi mật khẩu được đổi thành công.
      </EmailMutedNote>
    </EmailLayout>
  );
}
