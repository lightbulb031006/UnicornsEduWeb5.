import {
  EmailButton,
  EmailCallout,
  EmailDetailList,
  EmailLayout,
  EmailLinkFallback,
  EmailParagraph,
  EMAIL_COLORS,
} from './components/email-layout';

export interface LoginVerificationEmailProps {
  recipientEmail: string;
  verifyUrl: string;
  expiresInMinutes: number;
  /** Thời điểm gửi yêu cầu, đã format giờ Việt Nam. */
  requestedAt: string;
  logoSrc?: string | null;
  siteUrl?: string | null;
}

export function LoginVerificationEmail({
  recipientEmail,
  verifyUrl,
  expiresInMinutes,
  requestedAt,
  logoSrc = null,
  siteUrl = null,
}: LoginVerificationEmailProps) {
  return (
    <EmailLayout
      preview={`Xác minh đăng nhập UniEdu, hiệu lực ${expiresInMinutes} phút`}
      icon="🛡️"
      eyebrow="Bảo mật tài khoản"
      title="Xác minh đăng nhập"
      logoSrc={logoSrc}
      siteUrl={siteUrl}
    >
      <EmailParagraph>Xin chào,</EmailParagraph>
      <EmailParagraph>
        Có một yêu cầu đăng nhập vào tài khoản{' '}
        <strong style={{ color: EMAIL_COLORS.text }}>{recipientEmail}</strong>.
        Nếu đúng là bạn, bấm nút bên dưới để hoàn tất đăng nhập.
      </EmailParagraph>

      <EmailDetailList
        rows={[
          { label: 'Thời điểm yêu cầu', value: requestedAt },
          {
            label: 'Hiệu lực',
            value: `${expiresInMinutes} phút kể từ lúc gửi`,
            strong: true,
          },
        ]}
      />

      <EmailButton href={verifyUrl}>Xác minh đăng nhập</EmailButton>

      <EmailLinkFallback href={verifyUrl} />

      <EmailCallout tone="danger" title="Không phải bạn đăng nhập?">
        Đừng bấm nút trên. Bỏ qua email này và đổi mật khẩu sớm nếu bạn nghi ngờ
        tài khoản bị lộ.
      </EmailCallout>
    </EmailLayout>
  );
}
