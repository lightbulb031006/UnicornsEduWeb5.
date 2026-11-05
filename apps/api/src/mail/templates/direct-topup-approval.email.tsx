import {
  EmailAmountHighlight,
  EmailButton,
  EmailCallout,
  EmailDetailList,
  EmailLayout,
  EmailParagraph,
  formatVnd,
} from './components/email-layout';

export interface DirectTopUpApprovalEmailProps {
  approvalUrl: string;
  studentName: string;
  studentId: string;
  amount: number;
  reason: string;
  requestedByEmail: string | null;
  expiresAt: string;
  logoSrc?: string | null;
  siteUrl?: string | null;
}

export function DirectTopUpApprovalEmail({
  approvalUrl,
  studentName,
  studentId,
  amount,
  reason,
  requestedByEmail,
  expiresAt,
  logoSrc = null,
  siteUrl = null,
}: DirectTopUpApprovalEmailProps) {
  return (
    <EmailLayout
      preview={`Yêu cầu nạp thẳng ${formatVnd(amount)} cho ${studentName}`}
      tone="warning"
      icon="💳"
      eyebrow="Cần bạn xác nhận"
      title="Xác nhận yêu cầu nạp thẳng"
      logoSrc={logoSrc}
      siteUrl={siteUrl}
    >
      <EmailParagraph>
        Một nhân sự vừa tạo yêu cầu nạp thẳng vào ví học sinh. Vui lòng kiểm tra
        kỹ thông tin trước khi xác nhận.
      </EmailParagraph>

      <EmailAmountHighlight
        tone="warning"
        label="Số tiền nạp"
        amount={amount}
        caption={`cho học sinh ${studentName}`}
      />

      <EmailDetailList
        rows={[
          { label: 'Học sinh', value: studentName, strong: true },
          { label: 'Mã học sinh', value: studentId, mono: true },
          { label: 'Lý do', value: reason },
          {
            label: 'Người yêu cầu',
            value: requestedByEmail || 'Không có email',
          },
          { label: 'Hết hạn', value: expiresAt },
        ]}
      />

      <EmailButton href={approvalUrl}>Mở trang xác nhận</EmailButton>

      <EmailCallout tone="warning" title="Lưu ý">
        Liên kết chỉ dùng được một lần và hết hạn lúc {expiresAt}. Nếu không
        nhận ra yêu cầu này, đừng bấm và báo ngay cho quản trị viên.
      </EmailCallout>
    </EmailLayout>
  );
}
