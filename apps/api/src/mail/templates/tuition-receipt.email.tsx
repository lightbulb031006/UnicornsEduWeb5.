import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import {
  RECEIPT_CENTER_NAME,
  type TuitionReceiptEmailProps,
} from '../receipt.types';

const BORDER = '#1e40af';
const BLUE950 = '#172554';
const BLUE900 = '#1e3a8a';
const BLUE100 = '#dbeafe';
const BLUE50 = '#eff6ff';
const SLATE200 = '#e2e8f0';
const SLATE500 = '#64748b';

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function TuitionReceiptEmail({
  documentTitle,
  invoiceCode,
  issueDate,
  studentName,
  studentCode,
  receiverName,
  receiverBankName,
  receiverBankAccount,
  receiptSummary,
  lineItems,
  totalAmount,
  logoMathSrc,
}: TuitionReceiptEmailProps) {
  return (
    <Html lang="vi">
      <Head />
      <Preview>
        {documentTitle} — {invoiceCode} — {studentName} —{' '}
        {formatVnd(totalAmount)}
      </Preview>
      <Body
        style={{
          backgroundColor: '#f1f5f9',
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          padding: '24px 12px',
        }}
      >
        <Container style={{ maxWidth: '640px', margin: '0 auto' }}>
          <Text
            style={{
              margin: '0 0 12px',
              fontSize: '13px',
              color: SLATE500,
              lineHeight: 1.5,
            }}
          >
            Kính gửi Quý phụ huynh — dưới đây là biên lai điện tử tương ứng giao
            dịch nạp ví học sinh.
          </Text>

          {/* Khối biên lai */}
          <Section
            style={{
              backgroundColor: '#ffffff',
              border: `1px solid ${BORDER}`,
              borderRadius: '12px',
              padding: '14px 16px 16px',
              boxShadow: '0 12px 40px rgba(30, 64, 175, 0.12)',
            }}
          >
            <Section style={{ marginBottom: '8px', textAlign: 'center' }}>
              {logoMathSrc ? (
                <Img
                  src={logoMathSrc}
                  alt={RECEIPT_CENTER_NAME}
                  width={96}
                  height={96}
                  style={{ display: 'block', margin: '0 auto' }}
                />
              ) : null}
              <Text
                style={{
                  margin: '6px 0 0',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: BORDER,
                  letterSpacing: '0.02em',
                }}
              >
                {RECEIPT_CENTER_NAME}
              </Text>
            </Section>

            <Heading
              as="h2"
              style={{
                margin: '8px 0 10px',
                textAlign: 'center',
                fontSize: '13px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: BLUE900,
                lineHeight: 1.25,
              }}
            >
              {documentTitle}
            </Heading>

            {/* meta 2 cột */}
            <Section
              style={{
                marginBottom: '10px',
                padding: '8px 10px',
                backgroundColor: BLUE50,
                borderRadius: '8px',
                border: `1px solid ${BLUE100}`,
              }}
            >
              <Row>
                <Column style={{ width: '50%', verticalAlign: 'top' }}>
                  <MetaBlock label="Mã biên lai" value={invoiceCode} />
                  <MetaBlock
                    label="Mã học viên"
                    value={studentCode?.trim() || '—'}
                  />
                  <MetaBlock label="Học viên" value={studentName} />
                </Column>
                <Column style={{ width: '50%', verticalAlign: 'top' }}>
                  <MetaBlock label="Ngày lập" value={issueDate} />
                </Column>
              </Row>
            </Section>

            {receiptSummary ? (
              <Section
                style={{
                  marginBottom: '10px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  border: `1px solid ${SLATE200}`,
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: BLUE950,
                  }}
                >
                  <span style={{ fontWeight: 700, color: BORDER }}>
                    Nội dung:
                  </span>{' '}
                  {receiptSummary}
                </Text>
              </Section>
            ) : null}

            {/* Người nhận */}
            <Section
              style={{
                padding: '8px 10px',
                margin: '0 0 10px',
                fontSize: '11px',
                lineHeight: 1.45,
                border: '1px solid #93c5fd',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                color: BLUE950,
              }}
            >
              <Text style={{ margin: 0 }}>
                <span style={{ fontWeight: 700, color: BORDER }}>
                  Người nhận:
                </span>{' '}
                <strong>{receiverName}</strong>
                {receiverBankName ? (
                  <>
                    {' '}
                    <span style={{ color: SLATE500 }}>·</span>{' '}
                    {receiverBankName}
                  </>
                ) : null}
                {receiverBankAccount ? (
                  <>
                    {' '}
                    <span style={{ color: SLATE500 }}>·</span>{' '}
                    <span style={{ fontWeight: 700, color: BORDER }}>STK</span>{' '}
                    <span
                      style={{
                        fontFamily:
                          'ui-monospace, Consolas, "Cascadia Mono", monospace',
                        fontWeight: 600,
                      }}
                    >
                      {receiverBankAccount}
                    </span>
                  </>
                ) : null}
              </Text>
            </Section>

            {/* Bảng chi tiết — không cột xóa (email) */}
            <Section
              style={{
                borderRadius: '8px',
                border: `1px solid ${SLATE200}`,
                overflow: 'hidden',
              }}
            >
              <table
                cellPadding={0}
                cellSpacing={0}
                role="presentation"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '11px',
                }}
              >
                <thead>
                  <tr>
                    {['#', 'Ngày', 'Nội dung', 'Mã GD', 'Số tiền'].map((h) => (
                      <th
                        key={h}
                        style={{
                          border: `1px solid ${SLATE200}`,
                          padding: '5px 6px',
                          backgroundColor: BLUE100,
                          color: BLUE900,
                          fontWeight: 700,
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          textAlign: h === 'Số tiền' ? 'right' : 'left',
                          width:
                            h === '#'
                              ? '28px'
                              : h === 'Ngày'
                                ? '72px'
                                : h === 'Số tiền'
                                  ? '88px'
                                  : undefined,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((row, i) => (
                    <tr key={i}>
                      <td
                        style={{
                          border: `1px solid ${SLATE200}`,
                          padding: '5px 6px',
                          textAlign: 'center',
                          color: SLATE500,
                        }}
                      >
                        {i + 1}
                      </td>
                      <td
                        style={{
                          border: `1px solid ${SLATE200}`,
                          padding: '5px 6px',
                          whiteSpace: 'nowrap',
                          color: BLUE950,
                        }}
                      >
                        {row.date}
                      </td>
                      <td
                        style={{
                          border: `1px solid ${SLATE200}`,
                          padding: '5px 6px',
                          wordBreak: 'break-word',
                          color: BLUE950,
                        }}
                      >
                        {row.memo}
                      </td>
                      <td
                        style={{
                          border: `1px solid ${SLATE200}`,
                          padding: '5px 6px',
                          wordBreak: 'break-all',
                          fontFamily: 'ui-monospace, Consolas, monospace',
                          fontSize: '10px',
                          color: SLATE500,
                        }}
                      >
                        {row.referenceCode?.trim() || '—'}
                      </td>
                      <td
                        style={{
                          border: `1px solid ${SLATE200}`,
                          padding: '5px 6px',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                          fontWeight: 600,
                          color: BLUE900,
                        }}
                      >
                        {formatVnd(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        border: `1px solid ${SLATE200}`,
                        padding: '6px 8px',
                        fontWeight: 700,
                        backgroundColor: BLUE900,
                        color: '#ffffff',
                      }}
                    >
                      Tổng cộng
                    </td>
                    <td
                      style={{
                        border: `1px solid ${SLATE200}`,
                        padding: '6px 8px',
                        textAlign: 'right',
                        fontWeight: 700,
                        backgroundColor: BLUE900,
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatVnd(totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Section>

            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              width="100%"
              style={{
                marginTop: '12px',
                width: '100%',
                borderCollapse: 'collapse',
              }}
            >
              <tbody>
                <tr>
                  <td
                    valign="bottom"
                    style={{
                      textAlign: 'left',
                      verticalAlign: 'bottom',
                      paddingRight: '12px',
                      width: '58%',
                    }}
                  >
                    <Text
                      style={{
                        margin: 0,
                        fontSize: '11px',
                        color: SLATE500,
                        lineHeight: 1.45,
                      }}
                    >
                      Đối chiếu sao kê ngân hàng nếu cần.
                    </Text>
                  </td>
                  <td
                    valign="bottom"
                    style={{
                      textAlign: 'right',
                      verticalAlign: 'bottom',
                      width: '42%',
                    }}
                  >
                    <Text
                      style={{
                        margin: 0,
                        fontSize: '11px',
                        fontWeight: 700,
                        color: BLUE900,
                        lineHeight: 1.45,
                      }}
                    >
                      Đã nhận thanh toán
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: SLATE200, margin: '20px 0' }} />
          <Text style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
            {RECEIPT_CENTER_NAME} — email tự động, vui lòng không trả lời trực
            tiếp.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ marginBottom: '8px' }}>
      <Column>
        <Text
          style={{
            margin: '0 0 2px',
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: SLATE500,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            margin: 0,
            fontSize: '12px',
            fontWeight: 600,
            color: BLUE950,
            wordBreak: 'break-word',
          }}
        >
          {value}
        </Text>
      </Column>
    </Row>
  );
}
