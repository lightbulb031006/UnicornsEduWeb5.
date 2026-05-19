import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface PasswordResetEmailProps {
  recipientEmail: string;
  resetLink: string;
  expiresInHours: number;
  logoSrc?: string | null;
}

const BLUE950 = '#172554';
const PRIMARY = '#1d4ed8';
const SLATE50 = '#f8fafc';
const SLATE100 = '#f1f5f9';
const SLATE200 = '#e2e8f0';
const SLATE500 = '#64748b';
const SLATE700 = '#334155';
const RED50 = '#fef2f2';
const RED700 = '#b91c1c';

export function PasswordResetEmail({
  recipientEmail,
  resetLink,
  expiresInHours,
  logoSrc = null,
}: PasswordResetEmailProps) {
  return (
    <Html lang="vi">
      <Head />
      <Preview>Đặt lại mật khẩu Unicorns Edu của bạn</Preview>
      <Body
        style={{
          backgroundColor: SLATE100,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          padding: '24px 12px',
        }}
      >
        <Container
          style={{
            maxWidth: '560px',
            margin: '0 auto',
            backgroundColor: '#ffffff',
            border: `1px solid ${SLATE200}`,
            borderRadius: '18px',
            overflow: 'hidden',
          }}
        >
          <Section
            style={{
              backgroundColor: BLUE950,
              padding: '28px 28px 24px',
            }}
          >
            <Section style={{ margin: '0 0 18px' }}>
              {logoSrc ? (
                <Img
                  src={logoSrc}
                  alt="Unicorns Edu"
                  width="64"
                  height="43"
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '999px',
                    display: 'inline-block',
                    margin: '0 12px 0 0',
                    padding: '4px',
                    verticalAlign: 'middle',
                  }}
                />
              ) : null}
              <Text
                style={{
                  color: '#ffffff',
                  display: 'inline-block',
                  fontSize: '20px',
                  fontWeight: 800,
                  lineHeight: 1,
                  margin: 0,
                  verticalAlign: 'middle',
                }}
              >
                Unicorns Edu
              </Text>
            </Section>
            <Text
              style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#93c5fd',
              }}
            >
              Bảo mật tài khoản
            </Text>
            <Heading
              as="h1"
              style={{
                margin: '10px 0 0',
                color: '#ffffff',
                fontSize: '26px',
                lineHeight: 1.25,
                fontWeight: 700,
              }}
            >
              Đặt lại mật khẩu
            </Heading>
          </Section>

          <Section style={{ padding: '28px' }}>
            <Text
              style={{
                margin: '0 0 16px',
                color: SLATE700,
                fontSize: '15px',
                lineHeight: 1.6,
              }}
            >
              Xin chào,
            </Text>
            <Text
              style={{
                margin: '0 0 20px',
                color: SLATE700,
                fontSize: '15px',
                lineHeight: 1.6,
              }}
            >
              Unicorns Edu nhận được yêu cầu đổi mật khẩu cho tài khoản{' '}
              <strong style={{ color: BLUE950 }}>{recipientEmail}</strong>. Nhấn
              nút bên dưới để tạo mật khẩu mới.
            </Text>

            <Section style={{ textAlign: 'center', margin: '28px 0' }}>
              <Button
                href={resetLink}
                style={{
                  backgroundColor: PRIMARY,
                  borderRadius: '10px',
                  color: '#ffffff',
                  display: 'inline-block',
                  fontSize: '15px',
                  fontWeight: 700,
                  padding: '14px 24px',
                  textDecoration: 'none',
                }}
              >
                Đổi mật khẩu
              </Button>
            </Section>

            <Section
              style={{
                backgroundColor: SLATE50,
                border: `1px solid ${SLATE200}`,
                borderRadius: '12px',
                padding: '14px 16px',
              }}
            >
              <Text
                style={{
                  margin: '0 0 8px',
                  color: SLATE500,
                  fontSize: '12px',
                }}
              >
                Nếu nút không hoạt động, sao chép liên kết sau vào trình duyệt:
              </Text>
              <Link
                href={resetLink}
                style={{
                  color: PRIMARY,
                  fontSize: '13px',
                  lineHeight: 1.5,
                  wordBreak: 'break-all',
                }}
              >
                {resetLink}
              </Link>
            </Section>

            <Section
              style={{
                backgroundColor: RED50,
                border: '1px solid #fecaca',
                borderRadius: '12px',
                marginTop: '20px',
                padding: '14px 16px',
              }}
            >
              <Text
                style={{
                  margin: 0,
                  color: RED700,
                  fontSize: '13px',
                  lineHeight: 1.6,
                }}
              >
                Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này. Tài
                khoản của bạn sẽ không thay đổi nếu liên kết không được sử dụng.
              </Text>
            </Section>

            <Hr style={{ borderColor: SLATE200, margin: '24px 0' }} />

            <Text
              style={{
                margin: 0,
                color: SLATE500,
                fontSize: '13px',
                lineHeight: 1.6,
              }}
            >
              Liên kết có hiệu lực trong <strong>{expiresInHours} giờ</strong>{' '}
              và tự vô hiệu sau khi mật khẩu được đổi thành công.
            </Text>
          </Section>
        </Container>

        <Text
          style={{
            margin: '16px auto 0',
            maxWidth: '560px',
            textAlign: 'center',
            color: SLATE500,
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          © Unicorns Edu - Email tự động, vui lòng không trả lời.
        </Text>
      </Body>
    </Html>
  );
}
