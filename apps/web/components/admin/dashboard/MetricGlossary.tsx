type MetricGlossaryItem = {
  term: string;
  definition: string;
};

type MetricGlossaryProps = {
  title?: string;
  items: MetricGlossaryItem[];
};

export function MetricGlossary({ title = "Giải thích chỉ số", items }: MetricGlossaryProps) {
  return (
    <aside
      className="rounded-xl border border-border-default/80 bg-bg-secondary/40 px-3 py-3 sm:px-4"
      aria-label={title}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {title}
      </p>
      <dl className="space-y-2">
        {items.map((item) => (
          <div
            key={item.term}
            className="grid gap-0.5 text-xs leading-relaxed sm:grid-cols-[minmax(7rem,9rem)_1fr] sm:gap-3"
          >
            <dt className="font-medium text-text-primary">{item.term}</dt>
            <dd className="text-text-secondary">{item.definition}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

export const FINANCE_METRIC_GLOSSARY: MetricGlossaryItem[] = [
  {
    term: "Doanh thu",
    definition:
      "Tổng học phí của các buổi học viên đã học trong tháng (có mặt hoặc được miễn điểm danh). Đây là tiền trung tâm thực sự “kiếm được” theo buổi học.",
  },
  {
    term: "Chi phí",
    definition:
      "Toàn bộ tiền trung tâm đã chi trong tháng: trả nhân sự (dạy, chăm sóc khách hàng, giáo án, thưởng, trợ cấp…) và các khoản chi vận hành khác.",
  },
  {
    term: "Lợi nhuận",
    definition: "Số còn lại sau khi lấy Doanh thu trừ Chi phí trong cùng tháng.",
  },
  {
    term: "Tổng nạp",
    definition:
      "Tổng tiền phụ huynh/học viên nạp vào ví trong tháng. Đây chưa phải doanh thu — tiền nạp có thể dùng dần cho nhiều buổi học sau.",
  },
];

export const EXPENSE_METRIC_GLOSSARY: MetricGlossaryItem[] = [
  {
    term: "Dạy",
    definition: "Tiền trả gia sư cho các buổi dạy trong tháng.",
  },
  {
    term: "CSKH",
    definition: "Hoa hồng trả cho nhân viên chăm sóc khách hàng trong tháng.",
  },
  {
    term: "Giáo án",
    definition: "Chi phí làm / mua giáo án trong tháng.",
  },
  {
    term: "Thưởng",
    definition: "Tiền thưởng trả cho nhân sự trong tháng.",
  },
  {
    term: "Trợ cấp khác",
    definition: "Các khoản trợ cấp ngoài lương dạy và hoa hồng thông thường trong tháng.",
  },
  {
    term: "Lương cứng",
    definition: "Lương cứng đã chốt cho tháng đó. Tháng chưa chốt thì khoản này bằng 0.",
  },
  {
    term: "Trợ lí",
    definition: "Tiền hỗ trợ trả cho trợ lí lớp trong tháng.",
  },
  {
    term: "QL lớp",
    definition: "Tiền hỗ trợ người quản lý lớp trong tháng.",
  },
  {
    term: "Vận hành",
    definition: "Các khoản chi phí hoạt động khác của trung tâm ghi nhận trong tháng (ngoài trả nhân sự ở trên).",
  },
  {
    term: "Tổng",
    definition: "Cộng tất cả các khoản chi phí ở trên. Trùng với cột Chi phí ở bảng tài chính cùng tháng.",
  },
];

export const OPERATIONS_METRIC_GLOSSARY: MetricGlossaryItem[] = [
  {
    term: "Học sinh",
    definition:
      "Số học viên còn đang học tại thời điểm cuối tháng (đã vào học trước đó và chưa nghỉ).",
  },
  {
    term: "Lớp học",
    definition:
      "Số lớp có ít nhất một buổi học diễn ra trong tháng đó.",
  },
  {
    term: "Gia sư",
    definition:
      "Số gia sư có ít nhất một buổi dạy trong tháng đó.",
  },
];