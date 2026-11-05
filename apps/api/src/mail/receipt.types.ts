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
  /**
   * `pdf`: chỉ khối tài liệu (render PDF qua Chromium).
   * `email` (mặc định): bọc layout email chung, có lời chào + số tiền nổi bật.
   */
  variant?: 'email' | 'pdf';
  /** Tên phụ huynh cho lời chào (chỉ dùng ở `variant: 'email'`). */
  parentName?: string | null;
  /** Email có kèm file PDF biên lai hay không. */
  hasPdfAttachment?: boolean;
  /** Logo header email (`cid:...`), tách khỏi logo trên biên lai. */
  brandLogoSrc?: string | null;
  /** URL web công khai hiện ở footer email. */
  siteUrl?: string | null;
  /** `data:image/png;base64,...` cho PDF hoặc `cid:...` cho HTML email. */
  logoMathSrc?: string | null;
}
