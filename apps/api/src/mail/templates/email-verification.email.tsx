import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface EmailVerificationEmailProps {
  recipientEmail: string;
  verificationLink: string;
  expiresInHours: number;
}

const BLUE950 = '#172554';
const PRIMARY = '#1d4ed8';
const SLATE50 = '#f8fafc';
const SLATE100 = '#f1f5f9';
const SLATE200 = '#e2e8f0';
const SLATE500 = '#64748b';
const SLATE700 = '#334155';

export function EmailVerificationEmail({
  recipientEmail,
  verificationLink,
  expiresInHours,
}: EmailVerificationEmailProps) {
  return (
    <Html lang="vi">
      <Head />
      <Preview>Xác thực email tài khoản Unicorns Edu của bạn</Preview>
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
              Unicorns Edu
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
              Xác thực email tài khoản
            </Heading>
          </Section>

          <Section style={{ padding: '28px' }}>
            <Text style={{ margin: '0 0 16px', color: SLATE700, fontSize: '15px', lineHeight: 1.6 }}>
              Xin chào,
            </Text>
            <Text style={{ margin: '0 0 20px', color: SLATE700, fontSize: '15px', lineHeight: 1.6 }}>
              Bạn vừa đăng ký hoặc yêu cầu xác minh email cho tài khoản{' '}
              <strong style={{ color: BLUE950 }}>{recipientEmail}</strong>. Nhấn nút bên
              dưới để hoàn tất xác thực và mở đầy đủ các tính năng trên Unicorns Edu.
            </Text>

            <Section style={{ textAlign: 'center', margin: '28px 0' }}>
              <Button
                href={verificationLink}
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
                Xác thực email
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
              <Text style={{ margin: '0 0 8px', color: SLATE500, fontSize: '12px' }}>
                Nếu nút không hoạt động, sao chép liên kết sau vào trình duyệt:
              </Text>
              <Link
                href={verificationLink}
                style={{
                  color: PRIMARY,
                  fontSize: '13px',
                  lineHeight: 1.5,
                  wordBreak: 'break-all',
                }}
              >
                {verificationLink}
              </Link>
            </Section>

            <Hr style={{ borderColor: SLATE200, margin: '24px 0' }} />

            <Text style={{ margin: 0, color: SLATE500, fontSize: '13px', lineHeight: 1.6 }}>
              Liên kết có hiệu lực trong <strong>{expiresInHours} giờ</strong>. Sau khi xác
              thực, bạn có thể đăng nhập và sử dụng hệ thống bình thường.
            </Text>
            <Text style={{ margin: '12px 0 0', color: SLATE500, fontSize: '13px', lineHeight: 1.6 }}>
              Nếu bạn không tạo tài khoản hoặc không yêu cầu email này, hãy bỏ qua — không
              cần thao tác thêm.
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
          © Unicorns Edu — Email tự động, vui lòng không trả lời.
        </Text>
      </Body>
    </Html>
  );
}
