export const RECEIPT_CENTER_NAME = 'Học Toán Cùng Chuyên Toán';

export interface ReceiptLineItem {
  date: string;
  memo: string;
  referenceCode?: string | null;
  amount: number;
}

/** Props React Email + PDF biên lai. */
export interface TuitionReceiptEmailProps {
  documentTitle: string;
  invoiceCode: string;
  issueDate: string;
  studentName: string;
  studentCode?: string | null;
  receiverName: string;
  receiverBankName?: string | null;
  receiverBankAccount?: string | null;
  receiptSummary?: string | null;
  lineItems: ReceiptLineItem[];
  totalAmount: number;
  /** `data:image/png;base64,...` cho PDF hoặc `cid:...` cho HTML email. */
  logoMathSrc?: string | null;
}
