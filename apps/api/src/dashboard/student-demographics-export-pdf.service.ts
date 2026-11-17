import { Injectable, Logger } from '@nestjs/common';
import { ReceiptPdfService } from 'src/mail/receipt-pdf.service';
import type {
  AdminDashboardStudentDemographicsDto,
  StudentDemographicsCourseBreakdownDto,
  StudentDemographicsMatrixColumnDto,
  StudentDemographicsStudentRowDto,
} from '../dtos/dashboard.dto';

function escapeHtml(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInt(value: number | null | undefined): string {
  return new Intl.NumberFormat('vi-VN').format(value ?? 0);
}

function formatCurrency(value: number | null | undefined): string {
  return `${new Intl.NumberFormat('vi-VN').format(value ?? 0)} đ`;
}

/** Rút gọn tiền cho nhãn biểu đồ: 756,9 tr / 1,2 tỷ. */
function formatCompactMoney(value: number): string {
  const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  if (Math.abs(value) >= 1_000_000_000) return `${nf.format(value / 1e9)} tỷ`;
  if (Math.abs(value) >= 1_000_000) return `${nf.format(value / 1e6)} tr`;
  if (Math.abs(value) >= 1_000) return `${nf.format(value / 1e3)}k`;
  return nf.format(value);
}

/** Một chuỗi dữ liệu → một màu (không tô theo thứ hạng). */
const COUNT_COLOR = '#2563eb';
const REVENUE_COLOR = '#0f766e';
const INK = '#111827';
const INK_SECONDARY = '#4b5563';
const INK_MUTED = '#6b7280';
const GRID = '#e5e7eb';

/** Cột bo 4px ở đầu dữ liệu, đáy vuông bám baseline. */
function barPathVertical(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function barPathHorizontal(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h / 2, w);
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}

interface VerticalBarItem {
  label: string;
  sub?: string;
  value: number;
  valueLabel: string;
}

function renderVerticalBars(params: {
  title: string;
  items: VerticalBarItem[];
  footnote?: string;
  width?: number;
  height?: number;
  color?: string;
}): string {
  const { title, items, footnote } = params;
  const width = params.width ?? 560;
  const height = params.height ?? 220;
  const color = params.color ?? COUNT_COLOR;
  if (items.length === 0) {
    return `<div class="empty-chart">${escapeHtml(title)}: chưa có dữ liệu năm sinh.</div>`;
  }

  const left = 20;
  const right = 20;
  const top = 34;
  const bottomY = height - (footnote ? 52 : 40);
  const plotHeight = bottomY - top;
  const slot = (width - left - right) / items.length;
  const barWidth = Math.max(8, Math.min(40, slot - 8));
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  const bars = items
    .map((item, idx) => {
      const h =
        item.value > 0
          ? Math.max(2, Math.round((item.value / maxValue) * plotHeight))
          : 0;
      const cx = left + slot * idx + slot / 2;
      const x = cx - barWidth / 2;
      const y = bottomY - h;
      return `
        <g>
          ${h > 0 ? `<path d="${barPathVertical(x, y, barWidth, h)}" fill="${color}" />` : ''}
          <text x="${cx}" y="${y - 4}" text-anchor="middle" font-size="9" font-weight="700" fill="${INK}">${escapeHtml(item.valueLabel)}</text>
          <text x="${cx}" y="${bottomY + 13}" text-anchor="middle" font-size="9" font-weight="600" fill="${INK_SECONDARY}">${escapeHtml(item.label)}</text>
          ${item.sub ? `<text x="${cx}" y="${bottomY + 24}" text-anchor="middle" font-size="8" fill="${INK_MUTED}">${escapeHtml(item.sub)}</text>` : ''}
        </g>`;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#f9fafb" rx="6" />
      <text x="14" y="20" font-size="11" font-weight="700" fill="#1f2937">${escapeHtml(title)}</text>
      <line x1="${left}" y1="${bottomY}" x2="${width - right}" y2="${bottomY}" stroke="${GRID}" stroke-width="1" />
      ${bars}
      ${footnote ? `<text x="14" y="${height - 10}" font-size="8.5" fill="${INK_MUTED}">${escapeHtml(footnote)}</text>` : ''}
    </svg>`;
}

function renderHorizontalBars(params: {
  title: string;
  items: Array<{ label: string; value: number; valueLabel: string }>;
  width?: number;
  color?: string;
  labelWidth?: number;
}): string {
  const { title, items } = params;
  const width = params.width ?? 560;
  const color = params.color ?? COUNT_COLOR;
  if (items.length === 0) return '';
  const labelWidth = params.labelWidth ?? 110;
  const barHeight = 14;
  const gap = 6;
  const top = 32;
  const height = top + items.length * (barHeight + gap) + 8;
  const maxBarWidth = width - labelWidth - 110;
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  const bars = items
    .map((item, idx) => {
      const y = top + idx * (barHeight + gap);
      const w =
        item.value > 0
          ? Math.max(2, Math.round((item.value / maxValue) * maxBarWidth))
          : 0;
      return `
        <g>
          <text x="${labelWidth - 8}" y="${y + 11}" text-anchor="end" font-size="10" font-weight="500" fill="${INK_SECONDARY}">${escapeHtml(item.label)}</text>
          ${w > 0 ? `<path d="${barPathHorizontal(labelWidth, y, w, barHeight)}" fill="${color}" />` : ''}
          <text x="${labelWidth + w + 6}" y="${y + 11}" font-size="10" font-weight="600" fill="${INK}">${escapeHtml(item.valueLabel)}</text>
        </g>`;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#f9fafb" rx="6" />
      <text x="14" y="20" font-size="11" font-weight="700" fill="#1f2937">${escapeHtml(title)}</text>
      <line x1="${labelWidth}" y1="${top - 4}" x2="${labelWidth}" y2="${height - 6}" stroke="${GRID}" stroke-width="1" />
      ${bars}
    </svg>`;
}

/** Bảng màu categorical (khớp `--ue-viz-1..8` light của web) — gán theo tên khoá, không theo hạng. */
const CATEGORICAL_COLORS = [
  '#2A78D6',
  '#EB6834',
  '#1BAF7A',
  '#EDA100',
  '#E87BA4',
  '#008300',
  '#4A3AA7',
  '#E34948',
];
const OTHER_COLOR = '#94a3b8';
const COST_SLICE_COLORS = {
  teacher: '#EB6834',
  trainingManager: '#EDA100',
  customerCare: '#4A3AA7',
  profit: '#1BAF7A',
};

interface DonutRow {
  label: string;
  value: number;
  color: string;
  /** Cột phải legend (vd "23,4%" hoặc "Lỗ"). */
  share: string;
}

function truncateLabel(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function donutArcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number,
): string {
  const point = (r: number, a: number) =>
    `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${point(rOuter, start)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${point(rOuter, end)}`,
    `L ${point(rInner, end)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${point(rInner, start)}`,
    'Z',
  ].join(' ');
}

/**
 * Donut tỷ trọng + legend bên phải (tên, tiền rút gọn, %). Lát giá trị ≤ 0 không vẽ
 * nhưng vẫn nằm trong legend (vd khoá lỗ).
 */
function renderDonut(params: {
  title: string;
  formula: string;
  rows: DonutRow[];
  centerLabel: string;
  centerValue: string;
  footnote?: string;
}): string {
  const { title, formula, rows, centerLabel, centerValue, footnote } = params;
  const width = 360;
  const legendTop = 52;
  const rowHeight = 15;
  const maxRows = 10;
  const shown = rows.slice(0, maxRows);
  const hidden = rows.length - shown.length;
  const legendBottom =
    legendTop + (shown.length + (hidden > 0 ? 1 : 0)) * rowHeight;
  const height = Math.max(196, legendBottom + (footnote ? 22 : 10));
  const cx = 82;
  const cy = 52 + 66;
  const rOuter = 64;
  const rInner = 42;

  const positive = rows.filter((r) => r.value > 0);
  const total = positive.reduce((sum, r) => sum + r.value, 0);
  let arcs = '';
  if (total <= 0) {
    arcs = `<circle cx="${cx}" cy="${cy}" r="${(rOuter + rInner) / 2}" fill="none" stroke="${GRID}" stroke-width="${rOuter - rInner}" />`;
  } else if (positive.length === 1) {
    arcs = `<circle cx="${cx}" cy="${cy}" r="${(rOuter + rInner) / 2}" fill="none" stroke="${positive[0].color}" stroke-width="${rOuter - rInner}" />`;
  } else {
    let angle = 0;
    arcs = positive
      .map((r) => {
        const sweep = (r.value / total) * Math.PI * 2;
        const path = donutArcPath(cx, cy, rOuter, rInner, angle, angle + sweep);
        angle += sweep;
        // Viền trắng 1.5px = khe giữa các lát.
        return `<path d="${path}" fill="${r.color}" stroke="#ffffff" stroke-width="1.5" />`;
      })
      .join('');
  }

  const legendX = 170;
  const legend = shown
    .map((r, i) => {
      const y = legendTop + i * rowHeight;
      return `
        <g>
          <circle cx="${legendX + 4}" cy="${y - 3}" r="4" fill="${r.color}" />
          <text x="${legendX + 13}" y="${y}" font-size="9" fill="${INK}">${escapeHtml(truncateLabel(r.label, 18))}</text>
          <text x="${width - 58}" y="${y}" text-anchor="end" font-size="8.5" fill="${INK_SECONDARY}">${escapeHtml(formatCompactMoney(r.value))}</text>
          <text x="${width - 12}" y="${y}" text-anchor="end" font-size="9" font-weight="700" fill="${INK}">${escapeHtml(r.share)}</text>
        </g>`;
    })
    .join('');
  const more =
    hidden > 0
      ? `<text x="${legendX + 13}" y="${legendTop + shown.length * rowHeight}" font-size="8.5" fill="${INK_MUTED}">+${hidden} khoá khác</text>`
      : '';

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#f9fafb" rx="6" />
      <text x="14" y="20" font-size="11" font-weight="700" fill="#1f2937">${escapeHtml(title)}</text>
      <text x="14" y="34" font-size="8.5" fill="${INK_MUTED}">${escapeHtml(formula)}</text>
      ${arcs}
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="8.5" fill="${INK_SECONDARY}">${escapeHtml(centerLabel)}</text>
      <text x="${cx}" y="${cy + 11}" text-anchor="middle" font-size="12" font-weight="800" fill="${INK}">${escapeHtml(centerValue)}</text>
      ${legend}
      ${more}
      ${footnote ? `<text x="14" y="${height - 10}" font-size="8" fill="${INK_MUTED}">${escapeHtml(footnote)}</text>` : ''}
    </svg>`;
}

/** Học phí (= 100%) tách thành Gia sư / QL lớp / CSKH / Lợi nhuận. */
function buildMarginDonutRows(parts: {
  tuition: number;
  teacher: number;
  manager: number;
  care: number;
  profit: number;
}): DonutRow[] {
  const pct = (v: number) =>
    parts.tuition > 0 ? `${Math.round((v / parts.tuition) * 1000) / 10}%` : '—';
  return [
    { label: 'Gia sư', value: parts.teacher, color: COST_SLICE_COLORS.teacher },
    {
      label: 'QL lớp',
      value: parts.manager,
      color: COST_SLICE_COLORS.trainingManager,
    },
    { label: 'CSKH', value: parts.care, color: COST_SLICE_COLORS.customerCare },
    {
      label: 'Lợi nhuận',
      value: parts.profit,
      color: COST_SLICE_COLORS.profit,
    },
  ].map((r) => ({
    ...r,
    share: r.label === 'Lợi nhuận' && r.value < 0 ? 'Lỗ' : pct(r.value),
  }));
}

/** Donut đầu PDF: tỷ trọng doanh thu, tỷ trọng lợi nhuận, biên LN chung, rồi biên LN từng khoá. */
function renderCourseSharePies(
  data: AdminDashboardStudentDemographicsDto,
): string {
  const courses = data.byCourse;
  const sortedByName = [...courses].sort((a, b) =>
    a.courseName.localeCompare(b.courseName, 'vi'),
  );
  const colorByKey = new Map(
    sortedByName.map((c, i) => [c.key, CATEGORICAL_COLORS[i] ?? OTHER_COLOR]),
  );
  const colorOf = (c: StudentDemographicsCourseBreakdownDto) =>
    colorByKey.get(c.key) ?? OTHER_COLOR;

  const totalRevenue = courses.reduce((s, c) => s + c.totalRevenue, 0);
  const revenueRows: DonutRow[] = courses
    .filter((c) => c.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .map((c) => ({
      label: c.courseName,
      value: c.totalRevenue,
      color: colorOf(c),
      share: `${c.revenueShare}%`,
    }));

  const profitCourses = courses
    .filter((c) => c.profit !== 0)
    .sort((a, b) => b.profit - a.profit);
  const profitRows: DonutRow[] = profitCourses.map((c) => ({
    label: c.courseName,
    value: c.profit,
    color: colorOf(c),
    share: c.profit < 0 ? 'Lỗ' : `${c.profitShare}%`,
  }));
  const hasLoss = profitCourses.some((c) => c.profit < 0);

  const sum = (pick: (c: StudentDemographicsCourseBreakdownDto) => number) =>
    courses.reduce((s, c) => s + pick(c), 0);
  const tuition = sum((c) => c.profitRevenue);
  const teacher = sum((c) => c.teacherCost);
  const manager = sum((c) => c.trainingManagerCost);
  const care = sum((c) => c.customerCareCost);
  const profit = data.summary.totalProfit;
  const pct = (v: number) =>
    tuition > 0 ? `${Math.round((v / tuition) * 1000) / 10}%` : '0%';
  const marginRows = buildMarginDonutRows({
    tuition,
    teacher,
    manager,
    care,
    profit,
  });
  const perCourseSvgs = courses
    .filter((c) => c.profitRevenue > 0 || c.totalCost > 0)
    .sort((a, b) => b.profitRevenue - a.profitRevenue)
    .map((c) =>
      renderDonut({
        title: `BIÊN LN · ${c.courseName.toUpperCase()}`,
        formula: `LN khoá / học phí khoá (học phí ${formatCompactMoney(c.profitRevenue)} = 100%)`,
        rows: buildMarginDonutRows({
          tuition: c.profitRevenue,
          teacher: c.teacherCost,
          manager: c.trainingManagerCost,
          care: c.customerCareCost,
          profit: c.profit,
        }),
        centerLabel: 'Biên LN',
        centerValue: c.profitRevenue > 0 ? `${c.profitMargin}%` : '—',
      }),
    );

  const revenueSvg = renderDonut({
    title: 'TỶ TRỌNG DOANH THU',
    formula: 'Doanh thu khoá / tổng doanh thu tất cả khoá',
    rows: revenueRows,
    centerLabel: 'Tổng DT',
    centerValue: formatCompactMoney(totalRevenue),
  });
  const profitSvg = renderDonut({
    title: 'TỶ TRỌNG LỢI NHUẬN',
    formula: 'Lợi nhuận khoá / tổng lợi nhuận tất cả khoá',
    rows: profitRows,
    centerLabel: 'Tổng LN',
    centerValue: formatCompactMoney(profit),
    footnote: hasLoss
      ? 'Khoá lỗ không vẽ trên biểu đồ nhưng vẫn trừ vào tổng LN.'
      : undefined,
  });
  const marginSvg = renderDonut({
    title: 'BIÊN LỢI NHUẬN CHUNG',
    formula: 'Tổng lợi nhuận / tổng học phí (học phí = 100%)',
    rows: marginRows,
    centerLabel: 'Biên LN chung',
    centerValue: pct(profit),
  });

  return `
  <div class="pies-row">
    <div>${revenueSvg}</div>
    <div>${profitSvg}</div>
    <div>${marginSvg}</div>
  </div>
  ${
    perCourseSvgs.length > 0
      ? `<p class="section-desc" style="margin-top: 4px;"><strong>Biên lợi nhuận từng khoá</strong> = lợi nhuận khoá / doanh thu (học phí) của chính khoá đó.</p>
  <div class="pies-row">${perCourseSvgs.map((svg) => `<div>${svg}</div>`).join('')}</div>`
      : ''
  }`;
}

function statusLabel(status: string | null): string {
  if (status === 'active') return 'Đang học';
  if (status === 'inactive') return 'Đã nghỉ';
  return status ?? '—';
}

@Injectable()
export class StudentDemographicsExportPdfService {
  private readonly logger = new Logger(
    StudentDemographicsExportPdfService.name,
  );

  constructor(private readonly receiptPdfService: ReceiptPdfService) {}

  private birthYearItems(
    years: Array<{ birthYear: number | null; studentCount: number }>,
    currentYear: number,
  ): VerticalBarItem[] {
    return years
      .filter((y) => y.birthYear != null)
      .map((y) => ({
        label: String(y.birthYear),
        sub: `${currentYear - (y.birthYear ?? 0)}t`,
        value: y.studentCount,
        valueLabel: String(y.studentCount),
      }));
  }

  private renderCountMatrix(params: {
    firstHeader: string;
    columns: StudentDemographicsMatrixColumnDto[];
    rows: Array<{
      label: string;
      totalStudents: number;
      totalTopup: number;
      totalRevenue: number;
      cells: Record<string, number>;
    }>;
  }): string {
    const { columns, rows } = params;
    const body = rows
      .map((row, idx) => {
        const cellTds = columns
          .map((col) => {
            const count = row.cells[col.key] || 0;
            return `<td class="num ${count > 0 ? 'highlight-cell' : 'zero-cell'}">${count > 0 ? count : '—'}</td>`;
          })
          .join('');
        return `
          <tr>
            <td class="idx-col">${idx + 1}</td>
            <td class="name-col font-semibold">${escapeHtml(row.label)}</td>
            <td class="num total-col font-bold">${formatInt(row.totalStudents)}</td>
            <td class="num total-col font-bold revenue-text">${formatInt(row.totalRevenue)}</td>
            <td class="num total-col topup-text">${formatInt(row.totalTopup)}</td>
            ${cellTds}
          </tr>`;
      })
      .join('');

    const total = (pick: (r: (typeof rows)[number]) => number) =>
      rows.reduce((sum, r) => sum + pick(r), 0);
    const footer = `
      <tr class="footer-row">
        <td colspan="2" class="font-bold">TỔNG CỘNG</td>
        <td class="num font-bold">${formatInt(total((r) => r.totalStudents))}</td>
        <td class="num font-bold revenue-text">${formatInt(total((r) => r.totalRevenue))}</td>
        <td class="num font-bold topup-text">${formatInt(total((r) => r.totalTopup))}</td>
        ${columns.map((c) => `<td class="num font-bold">${formatInt(total((r) => r.cells[c.key] || 0))}</td>`).join('')}
      </tr>`;

    return `
      <table>
        <thead>
          <tr>
            <th class="idx-col">STT</th>
            <th>${escapeHtml(params.firstHeader)}</th>
            <th class="num">Tổng HS</th>
            <th class="num revenue-text">Doanh thu (đ)</th>
            <th class="num topup-text">Tổng nạp (đ)</th>
            ${columns.map((c) => `<th class="num">${escapeHtml(c.label)} (HS)</th>`).join('')}
          </tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>${footer}</tfoot>
      </table>`;
  }

  private renderRevenueMatrix(params: {
    firstHeader: string;
    columns: StudentDemographicsMatrixColumnDto[];
    rows: Array<{
      label: string;
      totalRevenue: number;
      revenueCells: Record<string, number>;
    }>;
  }): string {
    // Cột "Chưa xếp lớp" không có doanh thu theo khoá → bỏ khỏi ma trận tiền.
    const columns = params.columns.filter((c) =>
      params.rows.some((r) => (r.revenueCells[c.key] || 0) > 0),
    );
    const grandTotal = params.rows.reduce((s, r) => s + r.totalRevenue, 0);
    const body = params.rows
      .map((row, idx) => {
        const cellTds = columns
          .map((col) => {
            const amount = row.revenueCells[col.key] || 0;
            return `<td class="num ${amount > 0 ? 'revenue-cell' : 'zero-cell'}">${amount > 0 ? formatInt(amount) : '—'}</td>`;
          })
          .join('');
        const share =
          grandTotal > 0
            ? Math.round((row.totalRevenue / grandTotal) * 1000) / 10
            : 0;
        return `
          <tr>
            <td class="idx-col">${idx + 1}</td>
            <td class="name-col font-semibold">${escapeHtml(row.label)}</td>
            <td class="num total-col font-bold revenue-text">${formatInt(row.totalRevenue)}</td>
            <td class="num total-col">${share}%</td>
            ${cellTds}
          </tr>`;
      })
      .join('');
    const footer = `
      <tr class="footer-row">
        <td colspan="2" class="font-bold">TỔNG CỘNG</td>
        <td class="num font-bold revenue-text">${formatInt(grandTotal)}</td>
        <td class="num font-bold">100%</td>
        ${columns
          .map(
            (c) =>
              `<td class="num font-bold">${formatInt(params.rows.reduce((s, r) => s + (r.revenueCells[c.key] || 0), 0))}</td>`,
          )
          .join('')}
      </tr>`;
    return `
      <table>
        <thead>
          <tr>
            <th class="idx-col">STT</th>
            <th>${escapeHtml(params.firstHeader)}</th>
            <th class="num revenue-text">Tổng doanh thu (đ)</th>
            <th class="num">Tỉ trọng</th>
            ${columns.map((c) => `<th class="num">${escapeHtml(c.label)} (đ)</th>`).join('')}
          </tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>${footer}</tfoot>
      </table>`;
  }

  private renderCourseCard(
    course: StudentDemographicsCourseBreakdownDto,
    currentYear: number,
  ): string {
    const yearItems = this.birthYearItems(course.birthYears, currentYear);
    const chart = renderVerticalBars({
      title: `ĐỘ TUỔI HỌC SINH KHOÁ ${course.courseName.toUpperCase()}`,
      items: yearItems,
      width: 620,
      height: 175,
      footnote:
        course.missingBirthYearCount > 0
          ? `+ ${course.missingBirthYearCount} HS chưa cập nhật năm sinh (không vẽ trên biểu đồ)`
          : undefined,
    });

    const yearRows = course.birthYears
      .map(
        (y) => `
          <tr>
            <td class="num">${y.birthYear ?? 'Chưa cập nhật'}</td>
            <td class="num">${y.birthYear != null ? currentYear - y.birthYear : '—'}</td>
            <td class="num font-bold">${y.studentCount}</td>
            <td class="num">${y.percentage}%</td>
            <td class="num revenue-text">${formatInt(y.totalRevenue)}</td>
          </tr>`,
      )
      .join('');

    const topProvinces = course.provinces
      .slice(0, 5)
      .map(
        (p) =>
          `<span class="cat-pill"><strong>${escapeHtml(p.province)}</strong>: ${p.studentCount}</span>`,
      )
      .join(' ');

    const ageRange =
      course.minBirthYear != null && course.maxBirthYear != null
        ? `${course.maxBirthYear}–${course.minBirthYear} (${currentYear - course.maxBirthYear}–${currentYear - course.minBirthYear} tuổi)`
        : '—';

    return `
      <div class="course-card">
        <div class="course-card-head">
          <div class="course-name">${escapeHtml(course.courseName)}</div>
          <div class="course-meta">${formatInt(course.studentCount)} HS (${course.percentage}% tổng) · ${formatInt(course.classCount)} lớp</div>
        </div>
        <div class="course-stats">
          <div><span>Doanh thu</span><strong class="revenue-text">${formatCurrency(course.totalRevenue)}</strong><em>${course.revenueShare}% tổng DT · TB ${formatCurrency(course.averageRevenue)}/HS<br/>LN ${formatCurrency(course.profit)} · tỷ trọng LN ${course.profitShare}% · biên LN ${course.profitMargin}%</em></div>
          <div><span>Tuổi trung bình</span><strong>${course.averageAge != null ? `${course.averageAge} tuổi` : '—'}</strong><em>Tập trung: ${course.topBirthYear ?? '—'}${course.topBirthYear ? ` (${currentYear - course.topBirthYear}t)` : ''}</em></div>
          <div><span>Khoảng năm sinh</span><strong style="font-size: 11px;">${escapeHtml(ageRange)}</strong><em>Tổng nạp nhóm: ${formatCurrency(course.totalTopup)}</em></div>
        </div>
        <div class="course-body">
          <div class="course-chart">${chart}</div>
          <div class="course-table">
            <table class="compact">
              <thead><tr><th class="num">Năm sinh</th><th class="num">Tuổi</th><th class="num">HS</th><th class="num">%</th><th class="num revenue-text">DT khoá (đ)</th></tr></thead>
              <tbody>${yearRows}</tbody>
            </table>
          </div>
        </div>
        <div class="course-provinces"><span class="text-muted-plain">Khu vực:</span> ${topProvinces || '—'}</div>
      </div>`;
  }

  private renderStudentListTable(
    students: StudentDemographicsStudentRowDto[],
    courseKey: string | null,
  ): string {
    const rows = students
      .map((s, idx) => {
        const courseRevenue =
          courseKey != null ? s.revenueByCourse[courseKey] || 0 : null;
        return `
          <tr>
            <td class="idx-col">${idx + 1}</td>
            <td class="font-semibold">${escapeHtml(s.fullName)}<div class="sub-id">${escapeHtml(s.studentId)}</div></td>
            <td>${escapeHtml(s.birthYearLabel)}</td>
            <td>${escapeHtml(s.province)}</td>
            <td>${escapeHtml(s.school || '—')}</td>
            <td class="classes-cell">${escapeHtml(s.classNames.join(', ') || '—')}</td>
            <td>${statusLabel(s.status)}</td>
            <td class="num">${formatInt(s.attendanceCount)}</td>
            ${courseRevenue != null ? `<td class="num revenue-text font-bold">${formatInt(courseRevenue)}</td>` : ''}
            <td class="num revenue-text">${formatInt(s.totalRevenue)}</td>
            <td class="num topup-text">${formatInt(s.totalTopup)}</td>
          </tr>`;
      })
      .join('');
    return `
      <table class="compact">
        <thead>
          <tr>
            <th class="idx-col">STT</th>
            <th>Học sinh</th>
            <th>Năm sinh</th>
            <th>Tỉnh/TP</th>
            <th>Trường</th>
            <th>Lớp</th>
            <th>Trạng thái</th>
            <th class="num">Buổi học</th>
            ${courseKey != null ? '<th class="num revenue-text">DT khoá này (đ)</th>' : ''}
            <th class="num revenue-text">Tổng DT (đ)</th>
            <th class="num topup-text">Tổng nạp (đ)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  private buildHtml(data: AdminDashboardStudentDemographicsDto): string {
    const currentYear = new Date().getFullYear();
    const generatedDateStr = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'full',
      timeStyle: 'medium',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date());

    const summary = data.summary;
    const statusFilter = summary.statusFilter ?? 'all';
    const scopeText =
      statusFilter === 'active'
        ? 'Học sinh đang học (active)'
        : statusFilter === 'inactive'
          ? 'Học sinh đã nghỉ (inactive)'
          : 'Toàn bộ học sinh hệ thống (cả đang học và đã nghỉ)';

    const period = data.period;
    const hasPeriod = period.type !== 'all';
    const periodText = hasPeriod
      ? `${period.label} (chỉ học sinh có buổi học trong kỳ; doanh thu, chi phí, tổng nạp phát sinh trong kỳ)`
      : 'Toàn thời gian';
    const timeWord = hasPeriod
      ? `trong ${period.label.toLowerCase()}`
      : 'toàn thời gian';

    const kpiStudentLabel =
      statusFilter === 'active'
        ? 'Học sinh đang học'
        : statusFilter === 'inactive'
          ? 'Học sinh đã nghỉ'
          : 'Tổng số học sinh';

    const columns = data.provinceMatrix.columns;
    const courseCards = data.byCourse.filter(
      (c) => c.courseId != null && c.studentCount > 0,
    );

    // Biểu đồ tổng quan
    const topProvincesSvg = renderHorizontalBars({
      title: 'TOP 10 TỈNH/THÀNH NHIỀU HỌC SINH NHẤT',
      items: data.byProvince.slice(0, 10).map((p) => ({
        label: p.province,
        value: p.studentCount,
        valueLabel: `${p.studentCount} HS (${p.percentage}%)`,
      })),
    });
    const birthYearsSvg = renderVerticalBars({
      title: 'PHÂN BỐ NĂM SINH / ĐỘ TUỔI HỌC SINH',
      items: this.birthYearItems(data.byBirthYear, currentYear),
      footnote:
        summary.missingBirthYearCount > 0
          ? `+ ${summary.missingBirthYearCount} HS chưa cập nhật năm sinh (xem Phụ lục B)`
          : undefined,
    });
    const revenueByCourseSvg = renderHorizontalBars({
      title: 'DOANH THU (HỌC PHÍ ĐÃ HỌC) THEO KHOÁ',
      color: REVENUE_COLOR,
      items: data.byCourse
        .filter((c) => c.totalRevenue > 0)
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .map((c) => ({
          label: c.courseName,
          value: c.totalRevenue,
          valueLabel: `${formatCompactMoney(c.totalRevenue)} (${c.revenueShare}%)`,
        })),
    });
    const studentsByCourseSvg = renderHorizontalBars({
      title: 'SỐ HỌC SINH THEO KHOÁ',
      items: data.byCourse
        .filter((c) => c.studentCount > 0)
        .map((c) => ({
          label: c.courseName,
          value: c.studentCount,
          valueLabel: `${c.studentCount} HS (${c.percentage}%)`,
        })),
    });

    // Bảng tổng quan theo khoá
    const courseOverviewRows = data.byCourse
      .map((c, idx) => {
        const range =
          c.minBirthYear != null && c.maxBirthYear != null
            ? `${c.minBirthYear}–${c.maxBirthYear}`
            : '—';
        return `
          <tr>
            <td class="idx-col">${idx + 1}</td>
            <td class="font-semibold">${escapeHtml(c.courseName)}</td>
            <td class="num font-bold">${formatInt(c.studentCount)}</td>
            <td class="num">${c.percentage}%</td>
            <td class="num">${formatInt(c.classCount)}</td>
            <td class="num">${c.averageAge != null ? c.averageAge : '—'}</td>
            <td class="num">${c.topBirthYear ?? '—'}</td>
            <td class="num">${range}</td>
            <td class="num">${c.missingBirthYearCount || '—'}</td>
            <td class="num revenue-text font-bold">${formatInt(c.totalRevenue)}</td>
            <td class="num">${c.revenueShare}%</td>
            <td class="num revenue-text">${formatInt(c.averageRevenue)}</td>
            <td class="num">${formatInt(c.totalCost)}</td>
            <td class="num font-bold ${c.profit < 0 ? 'loss-text' : 'profit-text'}">${formatInt(c.profit)}</td>
            <td class="num">${c.profitShare}%</td>
            <td class="num topup-text">${formatInt(c.totalTopup)}</td>
          </tr>`;
      })
      .join('');

    // Bảng chi tiết lợi nhuận theo khoá
    const courseProfitRows = data.byCourse
      .filter((c) => c.profitRevenue !== 0 || c.totalCost !== 0)
      .map(
        (c, idx) => `
          <tr>
            <td class="idx-col">${idx + 1}</td>
            <td class="font-semibold">${escapeHtml(c.courseName)}</td>
            <td class="num revenue-text">${formatInt(c.profitRevenue)}</td>
            <td class="num">${formatInt(c.teacherCost)}</td>
            <td class="num">${formatInt(c.trainingManagerCost)}</td>
            <td class="num">${formatInt(c.customerCareCost)}</td>
            <td class="num font-bold ${c.profit < 0 ? 'loss-text' : 'profit-text'}">${formatInt(c.profit)}</td>
            <td class="num">${c.profitMargin}%</td>
            <td class="num font-bold">${c.profitShare}%</td>
          </tr>`,
      )
      .join('');

    // Bảng phân cấp
    let hierarchyRowsHtml = '';
    data.byProvince.forEach((prov) => {
      prov.birthYears.forEach((by, bIdx) => {
        const catsSummary = by.categories
          .map(
            (c) =>
              `<span class="cat-pill"><strong>${escapeHtml(c.courseName)}</strong>: ${c.studentCount}</span>`,
          )
          .join(' ');
        hierarchyRowsHtml += `
          <tr>
            ${
              bIdx === 0
                ? `<td rowspan="${prov.birthYears.length}" class="prov-cell" style="vertical-align: top;">
                    <div class="prov-name">${escapeHtml(prov.province)}</div>
                    <div class="prov-meta">${prov.studentCount} HS (${prov.percentage}%)</div>
                    <div class="prov-meta revenue-text">DT: ${formatCurrency(prov.totalRevenue)}</div>
                    <div class="prov-meta topup-text">Nạp: ${formatCurrency(prov.totalTopup)}</div>
                   </td>`
                : ''
            }
            <td class="year-cell">${escapeHtml(by.label)}</td>
            <td class="num font-bold">${by.studentCount}</td>
            <td class="num revenue-text">${formatInt(by.totalRevenue)}</td>
            <td class="num topup-text">${formatInt(by.totalTopup)}</td>
            <td>${catsSummary || '<span class="text-muted">Chưa xếp lớp</span>'}</td>
          </tr>`;
      });
    });

    // Phụ lục A: danh sách học sinh theo khoá
    const appendixA = data.byCourse
      .filter((c) => c.studentCount > 0)
      .map((course) => {
        const members = data.students
          .filter((s) => s.courseKeys.includes(course.key))
          .sort(
            (a, b) =>
              (a.birthYear ?? 9999) - (b.birthYear ?? 9999) ||
              a.fullName.localeCompare(b.fullName, 'vi'),
          );
        const isUnassigned = course.courseId == null;
        return `
          <div class="appendix-block">
            <div class="appendix-title">${escapeHtml(course.courseName)} — ${formatInt(members.length)} học sinh · DT khoá ${formatCurrency(course.totalRevenue)}</div>
            ${this.renderStudentListTable(members, isUnassigned ? null : course.key)}
          </div>`;
      })
      .join('');

    // Phụ lục B: rà soát năm sinh
    const { missingBirthYear, unusualBirthYear, normalAgeRange } =
      data.dataQuality;
    const reviewRow = (s: StudentDemographicsStudentRowDto, idx: number) => `
      <tr>
        <td class="idx-col">${idx + 1}</td>
        <td class="font-semibold">${escapeHtml(s.fullName)}<div class="sub-id">${escapeHtml(s.studentId)}</div></td>
        <td class="num">${s.rawBirthYear ?? '<span class="text-muted">trống</span>'}</td>
        <td class="num">${s.age ?? '—'}</td>
        <td>${statusLabel(s.status)}</td>
        <td>${escapeHtml(s.school || '—')}</td>
        <td>${escapeHtml(s.province)}</td>
        <td class="classes-cell">${escapeHtml(s.classNames.join(', ') || '—')}</td>
        <td class="num revenue-text">${formatInt(s.totalRevenue)}</td>
        <td class="num topup-text">${formatInt(s.totalTopup)}</td>
      </tr>`;
    const reviewTable = (list: StudentDemographicsStudentRowDto[]) =>
      list.length === 0
        ? '<p class="text-muted">Không có học sinh nào.</p>'
        : `<table class="compact">
            <thead><tr>
              <th class="idx-col">STT</th><th>Học sinh</th><th class="num">Năm sinh (DB)</th><th class="num">Tuổi</th>
              <th>Trạng thái</th><th>Trường</th><th>Tỉnh/TP</th><th>Lớp</th>
              <th class="num revenue-text">Tổng DT (đ)</th><th class="num topup-text">Tổng nạp (đ)</th>
            </tr></thead>
            <tbody>${list.map(reviewRow).join('')}</tbody>
          </table>`;

    const provinceMatrixRows = data.provinceMatrix.rows.map((r) => ({
      ...r,
      label: r.province,
    }));

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Báo cáo học sinh theo khu vực, độ tuổi, khoá học & doanh thu</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #111827; background: #ffffff; margin: 0; padding: 0;
      font-size: 11px; line-height: 1.45; -webkit-font-smoothing: antialiased;
    }
    .header-banner { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 14px; }
    .brand-title { font-size: 18px; font-weight: 800; color: #1e3a8a; letter-spacing: -0.02em; margin: 0 0 4px; }
    .report-subtitle { font-size: 13px; font-weight: 600; color: #374151; margin: 0 0 2px; }
    .report-meta { font-size: 10px; color: #6b7280; }
    .brand-badge { text-align: right; font-size: 10px; color: #4b5563; }
    .brand-logo-text { font-size: 15px; font-weight: 800; color: #2563eb; letter-spacing: 0.05em; }

    .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 14px; }
    .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 9px 10px; }
    .kpi-card.revenue { background: #f0fdfa; border-color: #99f6e4; }
    .kpi-card.topup { background: #f0fdf4; border-color: #bbf7d0; }
    .kpi-label { font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; }
    .kpi-value { font-size: 17px; font-weight: 800; color: #0f172a; line-height: 1.15; }
    .kpi-value small { font-size: 11px; font-weight: 500; }
    .kpi-sub { font-size: 9px; color: #64748b; margin-top: 3px; }

    .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; page-break-inside: avoid; }
    .pies-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 6px; page-break-inside: avoid; }
    .empty-chart { padding: 24px; background: #f9fafb; border-radius: 6px; color: #6b7280; text-align: center; }

    .section-title { font-size: 12px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.04em; border-left: 4px solid #2563eb; padding-left: 8px; margin: 18px 0 6px; }
    .section-desc { font-size: 9.5px; color: #64748b; margin: 0 0 6px; }

    table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10px; page-break-inside: auto; }
    table.compact { font-size: 9px; }
    table.compact th, table.compact td { padding: 3px 5px; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th, td { border: 1px solid #e5e7eb; padding: 4px 7px; text-align: left; vertical-align: middle; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.02em; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    td.idx-col, th.idx-col { width: 26px; text-align: center; color: #94a3b8; }
    td.name-col { color: #1e293b; }
    td.total-col { background: #f8fafc; }
    td.highlight-cell { color: #1d4ed8; font-weight: 600; background: #eff6ff; }
    td.revenue-cell { color: #0f766e; font-weight: 600; background: #f0fdfa; }
    td.zero-cell { color: #cbd5e1; }
    tr.footer-row td { background: #e2e8f0; color: #0f172a; border-top: 2px solid #94a3b8; }
    .revenue-text { color: #0f766e; }
    .profit-text { color: #15803d; }
    .loss-text { color: #b91c1c; }
    .topup-text { color: #15803d; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .sub-id { font-size: 8px; color: #94a3b8; font-weight: 400; }
    .classes-cell { max-width: 220px; font-size: 8.5px; color: #475569; }

    .page-break { page-break-before: always; }

    .prov-cell { background: #f8fafc; border-right: 2px solid #cbd5e1; width: 160px; }
    .prov-name { font-size: 11px; font-weight: 700; color: #0f172a; }
    .prov-meta { font-size: 9px; color: #64748b; margin-top: 1px; }
    .year-cell { width: 120px; color: #334155; font-weight: 500; }
    .cat-pill { display: inline-block; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 0 5px; margin: 1px 3px 1px 0; font-size: 9px; color: #334155; }
    .cat-pill strong { color: #1d4ed8; }
    .text-muted { color: #94a3b8; font-style: italic; }
    .text-muted-plain { color: #64748b; }

    .course-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
    .course-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; page-break-inside: avoid; }
    .course-card-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 6px; }
    .course-name { font-size: 13px; font-weight: 800; color: #1e3a8a; }
    .course-meta { font-size: 9.5px; color: #475569; font-weight: 600; }
    .course-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 6px; }
    .course-stats div { background: #f8fafc; border-radius: 6px; padding: 5px 7px; }
    .course-stats span { display: block; font-size: 8.5px; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .course-stats strong { display: block; font-size: 12px; color: #0f172a; }
    .course-stats em { display: block; font-style: normal; font-size: 8.5px; color: #64748b; }
    .course-body { display: grid; grid-template-columns: 3fr 2fr; gap: 10px; align-items: start; }
    .course-provinces { margin-top: 5px; font-size: 9px; }

    .appendix-block { margin-bottom: 12px; }
    .appendix-title { font-size: 11px; font-weight: 700; color: #1e3a8a; background: #eff6ff; padding: 4px 8px; border-radius: 4px; margin-bottom: 2px; page-break-after: avoid; }

    .glossary { margin-top: 10px; padding: 8px 10px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 9.5px; color: #475569; }
    .glossary li { margin: 1px 0; }
    .footer-note { margin-top: 16px; padding-top: 8px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; color: #94a3b8; font-size: 9px; }
  </style>
</head>
<body>

  <div class="header-banner">
    <div>
      <h1 class="brand-title">UNICORNS EDUCATION · BÁO CÁO HỌC SINH</h1>
      <div class="report-subtitle">THỐNG KÊ HỌC SINH THEO KHU VỰC, ĐỘ TUỔI, KHOÁ HỌC & DOANH THU</div>
      <div class="report-meta">Phạm vi: ${escapeHtml(scopeText)} · Kỳ: ${escapeHtml(periodText)} · Xuất lúc: ${escapeHtml(generatedDateStr)}</div>
    </div>
    <div class="brand-badge">
      <div class="brand-logo-text">🦄 UNICORNS EDU</div>
      <div>Báo cáo quản trị</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">${escapeHtml(kpiStudentLabel)}</div>
      <div class="kpi-value">${formatInt(summary.totalActiveStudents)} <small>HS</small></div>
      <div class="kpi-sub">${formatInt(summary.enrolledStudentsCount)} có lớp · ${formatInt(summary.unenrolledStudentsCount)} chưa xếp lớp</div>
    </div>
    <div class="kpi-card revenue">
      <div class="kpi-label revenue-text">Doanh thu (học phí đã học)</div>
      <div class="kpi-value revenue-text">${formatCompactMoney(summary.totalRevenue)}</div>
      <div class="kpi-sub">${formatCurrency(summary.totalRevenue)}<br/>TB ${formatCurrency(summary.averageRevenue)} / HS có học (${formatInt(summary.revenueStudentsCount)} HS)</div>
    </div>
    <div class="kpi-card topup">
      <div class="kpi-label topup-text">Tổng nạp ví</div>
      <div class="kpi-value topup-text">${formatCompactMoney(summary.totalTopup)}</div>
      <div class="kpi-sub">${formatCurrency(summary.totalTopup)}<br/>TB ${formatCurrency(summary.averageTopup)} / HS</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Độ tuổi</div>
      <div class="kpi-value">${summary.averageAge != null ? summary.averageAge : '—'} <small>tuổi TB</small></div>
      <div class="kpi-sub">Tập trung: <strong>${summary.topBirthYear ?? '—'}</strong>${summary.topBirthYear ? ` (${currentYear - summary.topBirthYear} tuổi)` : ''}<br/>${summary.missingBirthYearCount} chưa có năm sinh · ${summary.unusualBirthYearCount} cần rà soát</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Độ phủ tỉnh/thành</div>
      <div class="kpi-value">${summary.totalProvincesCount} <small>tỉnh/TP</small></div>
      <div class="kpi-sub">Nhiều HS nhất: <strong>${escapeHtml(summary.topProvince || '—')}</strong></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Khoá học</div>
      <div class="kpi-value">${summary.totalCategoriesCount} <small>khoá</small></div>
      <div class="kpi-sub">Đông HS nhất: <strong>${escapeHtml(summary.topCategory || '—')}</strong><br/>DT cao nhất: <strong>${escapeHtml(summary.topRevenueCategory || '—')}</strong></div>
    </div>
  </div>

  ${renderCourseSharePies(data)}

  <div class="charts-row">
    <div>${topProvincesSvg}</div>
    <div>${birthYearsSvg}</div>
  </div>
  <div class="charts-row">
    <div>${studentsByCourseSvg}</div>
    <div>${revenueByCourseSvg}</div>
  </div>

  <div class="page-break"></div>
  <div class="section-title">1. Tổng quan theo khoá học</div>
  <p class="section-desc">Một học sinh học nhiều khoá được đếm ở mỗi khoá. Doanh thu khoá = học phí đã học ở các lớp thuộc khoá đó. DT TB/HS chia cho số HS có doanh thu ở khoá.</p>
  <table>
    <thead>
      <tr>
        <th class="idx-col">STT</th><th>Khoá</th><th class="num">Số HS</th><th class="num">% HS</th><th class="num">Số lớp</th>
        <th class="num">Tuổi TB</th><th class="num">Năm sinh tập trung</th><th class="num">Khoảng năm sinh</th><th class="num">Thiếu năm sinh</th>
        <th class="num revenue-text">Doanh thu (đ)</th><th class="num">% DT</th><th class="num revenue-text">DT TB/HS (đ)</th>
        <th class="num">Chi phí (đ)</th><th class="num profit-text">Lợi nhuận (đ)</th><th class="num">Tỷ trọng LN</th><th class="num topup-text">Tổng nạp (đ)</th>
      </tr>
    </thead>
    <tbody>${courseOverviewRows}</tbody>
  </table>

  <p class="section-desc" style="margin-top: 12px;"><strong>Lợi nhuận theo khoá</strong> = học phí − trợ cấp gia sư (sau khấu trừ vận hành) − trợ cấp quản lý lớp − hoa hồng CSKH, ${timeWord}, tính trên toàn bộ học sinh (không theo bộ lọc trạng thái). <strong>Tỷ trọng lợi nhuận</strong> = lợi nhuận khoá / tổng lợi nhuận tất cả khoá (${formatCurrency(data.summary.totalProfit)}). <strong>Biên lợi nhuận khoá</strong> = lợi nhuận khoá / doanh thu (học phí) của chính khoá đó.</p>
  <table>
    <thead>
      <tr>
        <th class="idx-col">STT</th><th>Khoá</th><th class="num revenue-text">Học phí (đ)</th><th class="num">Gia sư (đ)</th><th class="num">QL lớp (đ)</th><th class="num">CSKH (đ)</th>
        <th class="num profit-text">Lợi nhuận (đ)</th><th class="num">Biên LN khoá<br/>(LN / DT khoá)</th><th class="num">Tỷ trọng LN<br/>(LN / tổng LN)</th>
      </tr>
    </thead>
    <tbody>${courseProfitRows}</tbody>
  </table>

  <div class="section-title">2. Phân bố độ tuổi & doanh thu từng khoá</div>
  <p class="section-desc">Mỗi khoá: biểu đồ số học sinh theo năm sinh, bảng tỉ lệ từng năm sinh và doanh thu của khoá đến từ nhóm tuổi đó.</p>
  <div class="course-grid">
    ${courseCards.map((c) => this.renderCourseCard(c, currentYear)).join('')}
  </div>

  <div class="page-break"></div>
  <div class="section-title">3. Ma trận năm sinh × khoá (số học sinh)</div>
  ${this.renderCountMatrix({ firstHeader: 'Năm sinh (độ tuổi)', columns, rows: data.birthYearMatrix.rows })}

  <div class="section-title">4. Ma trận năm sinh × khoá (doanh thu)</div>
  ${this.renderRevenueMatrix({ firstHeader: 'Năm sinh (độ tuổi)', columns, rows: data.birthYearMatrix.rows })}

  <div class="page-break"></div>
  <div class="section-title">5. Ma trận tỉnh/thành × khoá (số học sinh)</div>
  ${this.renderCountMatrix({ firstHeader: 'Tỉnh / Thành phố', columns, rows: provinceMatrixRows })}

  <div class="section-title">6. Ma trận tỉnh/thành × khoá (doanh thu)</div>
  ${this.renderRevenueMatrix({ firstHeader: 'Tỉnh / Thành phố', columns, rows: provinceMatrixRows })}

  <div class="page-break"></div>
  <div class="section-title">7. Phân cấp chi tiết: Tỉnh/thành ➔ Năm sinh ➔ Khoá đang học</div>
  <table>
    <thead>
      <tr>
        <th>Tỉnh / Thành phố</th><th>Năm sinh (độ tuổi)</th><th class="num">Số HS</th>
        <th class="num revenue-text">Doanh thu (đ)</th><th class="num topup-text">Tổng nạp (đ)</th><th>Khoá đang theo học (số HS)</th>
      </tr>
    </thead>
    <tbody>${hierarchyRowsHtml}</tbody>
  </table>

  <div class="page-break"></div>
  <div class="section-title">Phụ lục A. Danh sách học sinh theo từng khoá</div>
  <p class="section-desc">Sắp theo năm sinh rồi tên. "DT khoá này" = học phí đã học ở lớp của khoá đang xem; "Tổng DT" = mọi khoá.</p>
  ${appendixA}

  <div class="page-break"></div>
  <div class="section-title">Phụ lục B. Học sinh cần rà soát năm sinh</div>
  <p class="section-desc"><strong>B1. Chưa có năm sinh hoặc năm sinh không hợp lệ (${missingBirthYear.length} HS)</strong> — nhóm "Chưa cập nhật" trong các bảng trên.</p>
  ${reviewTable(missingBirthYear)}
  <p class="section-desc" style="margin-top: 10px;"><strong>B2. Năm sinh ngoài độ tuổi phổ thông ${normalAgeRange.min}–${normalAgeRange.max} tuổi (${unusualBirthYear.length} HS)</strong> — có thể đúng (sinh viên, người đi làm) hoặc nhập nhầm; cần đối chiếu.</p>
  ${reviewTable(unusualBirthYear)}

  <ul class="glossary">
    <li><strong>Doanh thu</strong>: học phí đã học — tổng <em>attendance.tuition_fee</em> của các buổi có mặt / vắng có phép, ${timeWord} (cùng định nghĩa KPI Doanh thu trên dashboard), gán theo khoá của lớp có buổi học.</li>
    <li><strong>Tổng nạp</strong>: tổng tiền nạp ví (<em>topup</em>) ${timeWord} của học sinh — là dòng tiền vào, khác doanh thu.</li>
    <li><strong>Khoá của học sinh</strong>: khoá của các lớp học sinh đang ghi danh; học sinh nhiều khoá được đếm ở mỗi khoá nên tổng các cột khoá có thể lớn hơn tổng HS.</li>
    <li><strong>Tuổi</strong> = năm ${currentYear} − năm sinh.</li>
  </ul>

  <div class="footer-note">
    <div>© ${currentYear} Unicorns Education. Số liệu kết xuất tự động từ hệ thống quản trị.</div>
    <div>Phạm vi: ${escapeHtml(scopeText)}</div>
  </div>

</body>
</html>`;
  }

  async toPdfBuffer(
    data: AdminDashboardStudentDemographicsDto,
  ): Promise<Buffer> {
    const html = this.buildHtml(data);
    const buffer = await this.receiptPdfService.renderToPdf(html, {
      landscape: true,
      margin: { top: '8mm', right: '10mm', bottom: '8mm', left: '10mm' },
    });

    if (!buffer) {
      this.logger.error('Không thể tạo file PDF thống kê học sinh.');
      throw new Error('Không thể tạo file PDF thống kê học sinh.');
    }

    return buffer;
  }

  /** Dùng cho preview/test: trả HTML báo cáo. */
  toHtml(data: AdminDashboardStudentDemographicsDto): string {
    return this.buildHtml(data);
  }
}
