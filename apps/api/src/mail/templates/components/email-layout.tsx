import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';

/** Bảng màu khớp token `--ue-*` của apps/web (theme sáng). */
export const EMAIL_COLORS = {
  page: '#eef2f7',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  textFaint: '#94a3b8',
  primary: '#2563eb',
  primaryInk: '#1e40af',
  primarySoft: '#eff6ff',
} as const;

export const EMAIL_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const EMAIL_MONO_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export type EmailTone = 'brand' | 'success' | 'warning' | 'danger';

const TONES: Record<
  EmailTone,
  { accent: string; soft: string; ink: string; border: string }
> = {
  brand: {
    accent: '#2563eb',
    soft: '#eff6ff',
    ink: '#1e40af',
    border: '#bfdbfe',
  },
  success: {
    accent: '#059669',
    soft: '#ecfdf5',
    ink: '#065f46',
    border: '#a7f3d0',
  },
  warning: {
    accent: '#d97706',
    soft: '#fffbeb',
    ink: '#92400e',
    border: '#fde68a',
  },
  danger: {
    accent: '#dc2626',
    soft: '#fef2f2',
    ink: '#991b1b',
    border: '#fecaca',
  },
};

export function getEmailTone(tone: EmailTone) {
  return TONES[tone];
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** 168 → "7 ngày", 24 → "24 giờ", 36 → "36 giờ". */
export function formatHoursDuration(hours: number): string {
  if (hours >= 48 && hours % 24 === 0) {
    return `${hours / 24} ngày`;
  }
  return `${hours} giờ`;
}

const PX = '32px';

/** Media query cho Gmail/Apple Mail; client không hỗ trợ vẫn dùng style inline. */
const RESPONSIVE_CSS = `
@media only screen and (max-width: 600px) {
  .ue-shell { padding: 16px 8px !important; }
  .ue-px { padding-left: 20px !important; padding-right: 20px !important; }
  .ue-title { font-size: 20px !important; }
  .ue-amount { font-size: 26px !important; }
  .ue-detail-label, .ue-detail-value { display: block !important; width: 100% !important; }
  .ue-detail-label { padding-bottom: 2px !important; border-bottom: 0 !important; }
  .ue-detail-value { padding-top: 0 !important; text-align: left !important; }
}
`;

export interface EmailLayoutProps {
  /** Dòng xem trước trong hộp thư. */
  preview: string;
  tone?: EmailTone;
  /** Ký tự/emoji hiển thị trong huy hiệu tròn ở đầu thư. */
  icon: string;
  eyebrow: string;
  title: string;
  logoSrc?: string | null;
  /** URL web công khai, hiện ở footer nếu có. */
  siteUrl?: string | null;
  children: ReactNode;
}

export function EmailLayout({
  preview,
  tone = 'brand',
  icon,
  eyebrow,
  title,
  logoSrc = null,
  siteUrl = null,
  children,
}: EmailLayoutProps) {
  const palette = getEmailTone(tone);
  const year = new Date().getFullYear();

  return (
    <Html lang="vi">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <style>{RESPONSIVE_CSS}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        className="ue-shell"
        style={{
          backgroundColor: EMAIL_COLORS.page,
          fontFamily: EMAIL_FONT_FAMILY,
          margin: 0,
          padding: '32px 12px',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <Container
          style={{ maxWidth: '600px', width: '100%', margin: '0 auto' }}
        >
          <Section
            style={{
              backgroundColor: EMAIL_COLORS.surface,
              border: `1px solid ${EMAIL_COLORS.border}`,
              borderRadius: '20px',
              overflow: 'hidden',
            }}
          >
            <Section
              style={{
                backgroundColor: palette.accent,
                height: '6px',
                lineHeight: '6px',
                fontSize: '1px',
              }}
            >
              &nbsp;
            </Section>

            <Section className="ue-px" style={{ padding: `22px ${PX} 0` }}>
              <BrandMark logoSrc={logoSrc} />
            </Section>

            <Section className="ue-px" style={{ padding: `20px ${PX} 0` }}>
              <Section
                style={{
                  backgroundColor: palette.soft,
                  border: `1px solid ${palette.border}`,
                  borderRadius: '16px',
                  padding: '18px 20px',
                }}
              >
                <table
                  role="presentation"
                  cellPadding={0}
                  cellSpacing={0}
                  width="100%"
                  style={{ width: '100%', borderCollapse: 'collapse' }}
                >
                  <tbody>
                    <tr>
                      <td
                        valign="middle"
                        style={{ width: '56px', paddingRight: '14px' }}
                      >
                        <table
                          role="presentation"
                          cellPadding={0}
                          cellSpacing={0}
                          style={{ borderCollapse: 'separate' }}
                        >
                          <tbody>
                            <tr>
                              <td
                                align="center"
                                valign="middle"
                                style={{
                                  width: '48px',
                                  height: '48px',
                                  backgroundColor: '#ffffff',
                                  border: `1px solid ${palette.border}`,
                                  borderRadius: '999px',
                                  fontSize: '22px',
                                  lineHeight: '48px',
                                  textAlign: 'center',
                                }}
                              >
                                {icon}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                      <td valign="middle">
                        <Text
                          style={{
                            margin: 0,
                            color: palette.ink,
                            fontSize: '12px',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            lineHeight: '16px',
                            textTransform: 'uppercase',
                          }}
                        >
                          {eyebrow}
                        </Text>
                        <Heading
                          as="h1"
                          className="ue-title"
                          style={{
                            margin: '4px 0 0',
                            color: EMAIL_COLORS.text,
                            fontSize: '24px',
                            fontWeight: 800,
                            letterSpacing: '-0.01em',
                            lineHeight: 1.25,
                          }}
                        >
                          {title}
                        </Heading>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            </Section>

            <Section className="ue-px" style={{ padding: `24px ${PX} 32px` }}>
              {children}
            </Section>

            <Section
              className="ue-px"
              style={{
                backgroundColor: EMAIL_COLORS.surfaceMuted,
                borderTop: `1px solid ${EMAIL_COLORS.border}`,
                padding: `18px ${PX}`,
              }}
            >
              <Text
                style={{
                  margin: 0,
                  color: EMAIL_COLORS.textMuted,
                  fontSize: '13px',
                  lineHeight: 1.6,
                }}
              >
                Cần hỗ trợ? Liên hệ trung tâm UniEdu qua kênh bạn vẫn trao
                đổi hằng ngày.
                {siteUrl ? (
                  <>
                    {' '}
                    Truy cập hệ thống tại{' '}
                    <Link
                      href={siteUrl}
                      style={{
                        color: EMAIL_COLORS.primary,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {siteUrl.replace(/^https?:\/\//, '')}
                    </Link>
                    .
                  </>
                ) : null}
              </Text>
            </Section>
          </Section>

          <Text
            style={{
              margin: '20px 0 0',
              color: EMAIL_COLORS.textFaint,
              fontSize: '12px',
              lineHeight: 1.6,
              textAlign: 'center',
            }}
          >
            © {year} UniEdu · Học Tin cùng Chuyên tin
            <br />
            Email gửi tự động, vui lòng không trả lời thư này.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function BrandMark({ logoSrc }: { logoSrc: string | null }) {
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      style={{ borderCollapse: 'collapse' }}
    >
      <tbody>
        <tr>
          {logoSrc ? (
            <td valign="middle" style={{ paddingRight: '12px' }}>
              <Img
                src={logoSrc}
                alt="UniEdu"
                width="40"
                height="40"
                style={{ display: 'block', borderRadius: '999px' }}
              />
            </td>
          ) : null}
          <td valign="middle">
            <Text
              style={{
                margin: 0,
                color: EMAIL_COLORS.text,
                fontSize: '17px',
                fontWeight: 800,
                lineHeight: '20px',
              }}
            >
              UniEdu
            </Text>
            <Text
              style={{
                margin: '2px 0 0',
                color: EMAIL_COLORS.textMuted,
                fontSize: '12px',
                lineHeight: '16px',
              }}
            >
              Học Tin cùng Chuyên tin
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function EmailParagraph({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Text
      style={{
        margin: '0 0 14px',
        color: EMAIL_COLORS.textSecondary,
        fontSize: '15px',
        lineHeight: 1.65,
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={{ margin: '26px 0 22px', textAlign: 'center' }}>
      <Button
        href={href}
        style={{
          backgroundColor: EMAIL_COLORS.primary,
          border: `1px solid ${EMAIL_COLORS.primaryInk}`,
          borderRadius: '12px',
          color: '#ffffff',
          display: 'inline-block',
          fontSize: '15px',
          fontWeight: 700,
          lineHeight: '20px',
          padding: '14px 30px',
          textDecoration: 'none',
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

export function EmailLinkFallback({ href }: { href: string }) {
  return (
    <Section
      style={{
        backgroundColor: EMAIL_COLORS.surfaceMuted,
        border: `1px dashed ${EMAIL_COLORS.border}`,
        borderRadius: '12px',
        padding: '12px 16px',
      }}
    >
      <Text
        style={{
          margin: '0 0 6px',
          color: EMAIL_COLORS.textMuted,
          fontSize: '12px',
          lineHeight: 1.5,
        }}
      >
        Nút không bấm được? Sao chép liên kết sau vào trình duyệt:
      </Text>
      <Link
        href={href}
        style={{
          color: EMAIL_COLORS.primary,
          fontSize: '13px',
          lineHeight: 1.5,
          wordBreak: 'break-all',
        }}
      >
        {href}
      </Link>
    </Section>
  );
}

export function EmailCallout({
  tone = 'brand',
  title,
  children,
  style,
}: {
  tone?: EmailTone;
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const palette = getEmailTone(tone);
  return (
    <Section
      style={{
        backgroundColor: palette.soft,
        border: `1px solid ${palette.border}`,
        borderLeft: `4px solid ${palette.accent}`,
        borderRadius: '12px',
        margin: '18px 0 0',
        padding: '12px 16px',
        ...style,
      }}
    >
      {title ? (
        <Text
          style={{
            margin: '0 0 4px',
            color: palette.ink,
            fontSize: '14px',
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {title}
        </Text>
      ) : null}
      <Text
        style={{
          margin: 0,
          color: palette.ink,
          fontSize: '13px',
          lineHeight: 1.6,
        }}
      >
        {children}
      </Text>
    </Section>
  );
}

export interface EmailDetailRow {
  label: string;
  value: ReactNode;
  mono?: boolean;
  strong?: boolean;
}

/** Bảng nhãn – giá trị; trên mobile mỗi dòng xếp dọc. */
export function EmailDetailList({ rows }: { rows: EmailDetailRow[] }) {
  return (
    <Section
      style={{
        border: `1px solid ${EMAIL_COLORS.border}`,
        borderRadius: '14px',
        overflow: 'hidden',
      }}
    >
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        width="100%"
        style={{ width: '100%', borderCollapse: 'collapse' }}
      >
        <tbody>
          {rows.map((row, index) => {
            const borderTop =
              index === 0 ? 'none' : `1px solid ${EMAIL_COLORS.border}`;
            return (
              <tr key={row.label}>
                <td
                  className="ue-detail-label"
                  valign="top"
                  style={{
                    width: '36%',
                    padding: '12px 16px',
                    borderTop,
                    backgroundColor: EMAIL_COLORS.surfaceMuted,
                    color: EMAIL_COLORS.textMuted,
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  {row.label}
                </td>
                <td
                  className="ue-detail-value"
                  valign="top"
                  style={{
                    padding: '12px 16px',
                    borderTop,
                    color: EMAIL_COLORS.text,
                    fontFamily: row.mono ? EMAIL_MONO_FONT_FAMILY : undefined,
                    fontSize: row.mono ? '12px' : '14px',
                    fontWeight: row.strong ? 700 : 500,
                    lineHeight: 1.5,
                    wordBreak: 'break-word',
                  }}
                >
                  {row.value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

/** Khối số tiền nổi bật. */
export function EmailAmountHighlight({
  label,
  amount,
  caption,
  tone = 'brand',
}: {
  label: string;
  amount: number;
  caption?: ReactNode;
  tone?: EmailTone;
}) {
  const palette = getEmailTone(tone);
  return (
    <Section
      style={{
        backgroundColor: palette.soft,
        border: `1px solid ${palette.border}`,
        borderRadius: '16px',
        margin: '4px 0 18px',
        padding: '18px 20px',
        textAlign: 'center',
      }}
    >
      <Text
        style={{
          margin: 0,
          color: palette.ink,
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          lineHeight: '16px',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text
        className="ue-amount"
        style={{
          margin: '6px 0 0',
          color: EMAIL_COLORS.text,
          fontSize: '32px',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}
      >
        {formatVnd(amount)}
      </Text>
      {caption ? (
        <Text
          style={{
            margin: '6px 0 0',
            color: EMAIL_COLORS.textMuted,
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          {caption}
        </Text>
      ) : null}
    </Section>
  );
}

export function EmailMutedNote({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: '18px 0 0',
        color: EMAIL_COLORS.textMuted,
        fontSize: '13px',
        lineHeight: 1.6,
      }}
    >
      {children}
    </Text>
  );
}
