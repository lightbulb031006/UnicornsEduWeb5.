import {
  EmailButton,
  EmailLayout,
  EmailLinkFallback,
  EmailMutedNote,
  EmailParagraph,
  EMAIL_COLORS,
  formatHoursDuration,
} from './components/email-layout';

export interface EmailVerificationEmailProps {
  recipientEmail: string;
  verificationLink: string;
  expiresInHours: number;
  logoSrc?: string | null;
  siteUrl?: string | null;
}

export function EmailVerificationEmail({
  recipientEmail,
  verificationLink,
  expiresInHours,
  logoSrc = null,
  siteUrl = null,
}: EmailVerificationEmailProps) {
  return (
    <EmailLayout
      preview="Xác thực email tài khoản UniEdu của bạn"
      icon="📩"
      eyebrow="Kích hoạt tài khoản"
      title="Xác thực email tài khoản"
      logoSrc={logoSrc}
      siteUrl={siteUrl}
    >
      <EmailParagraph>Xin chào,</EmailParagraph>
      <EmailParagraph>
        Bạn vừa đăng ký hoặc yêu cầu xác minh email cho tài khoản{' '}
        <strong style={{ color: EMAIL_COLORS.text }}>{recipientEmail}</strong>.
        Bấm nút bên dưới để hoàn tất xác thực và mở đầy đủ tính năng trên
        UniEdu.
      </EmailParagraph>

      <EmailButton href={verificationLink}>Xác thực email</EmailButton>

      <EmailLinkFallback href={verificationLink} />

      <EmailMutedNote>
        ⏱ Liên kết có hiệu lực trong{' '}
        <strong style={{ color: EMAIL_COLORS.textSecondary }}>
          {formatHoursDuration(expiresInHours)}
        </strong>
        . Nếu bạn không tạo tài khoản hoặc không yêu cầu email này, cứ bỏ qua,
        không cần thao tác thêm.
      </EmailMutedNote>
    </EmailLayout>
  );
}
