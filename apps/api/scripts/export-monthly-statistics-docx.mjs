/**
 * One-off export: monthly statistics DOCX (charts + tables) for 01/2026 → 07/2026.
 * Usage: cd apps/api && node scripts/export-monthly-statistics-docx.mjs
 */
import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pg from 'pg';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  ShadingType,
} = require('docx');

const FROM_MONTH_KEY = '2026-01';
const TO_MONTH_KEY = '2026-07';
const PERIOD_START = '2026-01-01';
const PERIOD_END_EXCLUSIVE = '2026-08-01';
const TO_KEY_EXCLUSIVE = '2026-08';

const COLORS = {
  primary: '#2563eb',
  error: '#dc2626',
  success: '#16a34a',
  topup: '#8b5cf6',
  info: '#0ea5e9',
  warning: '#d97706',
  grid: '#e5e7eb',
  text: '#111827',
  muted: '#6b7280',
  viz: ['#2563eb', '#db2777', '#059669', '#8b5cf6', '#ea580c', '#0891b2', '#ca8a04', '#64748b'],
};

const EXPENSE_SERIES = [
  { key: 'teacherCost', name: 'Dạy', color: COLORS.viz[0] },
  { key: 'customerCareCost', name: 'CSKH', color: COLORS.viz[1] },
  { key: 'lessonCost', name: 'Giáo án', color: COLORS.viz[2] },
  { key: 'bonusCost', name: 'Thưởng', color: COLORS.viz[3] },
  { key: 'extraAllowanceCost', name: 'Trợ cấp khác', color: COLORS.viz[4] },
  { key: 'assistantCost', name: 'Trợ lí', color: COLORS.viz[5] },
  { key: 'trainingManagerCost', name: 'QL lớp', color: COLORS.viz[6] },
  { key: 'operatingCost', name: 'Vận hành', color: COLORS.viz[7] },
];

function money(value) {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function integer(value) {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? Math.floor(amount) : 0;
}

function formatCurrency(value) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} đ`;
}

function formatCompact(value) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(value);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function niceMax(value) {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const frac = value / 10 ** exp;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

function monthKeyFromValue(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}/.test(value)) {
    return value.slice(0, 7);
  }
  const d = value instanceof Date ? value : new Date(value);
  // DATE from pg arrives as local midnight in VN (+7); use local calendar parts.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthShortFromKey(monthKey) {
  const month = monthKey.slice(5, 7);
  return `T${month}`;
}

function buildExpenseProfit(components) {
  const personnelCost =
    components.teacherCost +
    components.customerCareCost +
    components.lessonCost +
    components.bonusCost +
    components.extraAllowanceCost +
    components.assistantCost +
    components.trainingManagerCost;
  const otherCost = components.operatingCost;
  const expense = personnelCost + otherCost;
  return {
    ...components,
    expense,
    profit: components.revenue - expense,
  };
}

async function fetchMonths(client) {
  const sql = `
    WITH month_series AS (
      SELECT generate_series(
        DATE '${PERIOD_START}',
        (DATE '${PERIOD_END_EXCLUSIVE}' - INTERVAL '1 month')::date,
        INTERVAL '1 month'
      )::date AS month_start
    ),
    monthly_students AS (
      SELECT
        month_series.month_start,
        COUNT(student_info.id) AS student_count
      FROM month_series
      LEFT JOIN student_info
        ON student_info.created_at < (month_series.month_start + INTERVAL '1 month')
        AND (
          student_info.drop_out_date IS NULL
          OR student_info.drop_out_date >= (month_series.month_start + INTERVAL '1 month')::date
        )
      GROUP BY 1
    ),
    monthly_activity AS (
      SELECT
        date_trunc('month', sessions.date)::date AS month_start,
        COUNT(DISTINCT sessions.class_id) AS class_count,
        COUNT(DISTINCT sessions.teacher_id) AS teacher_count
      FROM sessions
      WHERE sessions.date >= DATE '${PERIOD_START}'
        AND sessions.date < DATE '${PERIOD_END_EXCLUSIVE}'
      GROUP BY 1
    ),
    monthly_revenue AS (
      SELECT
        date_trunc('month', sessions.date)::date AS month_start,
        COALESCE(SUM(COALESCE(attendance.tuition_fee, 0)), 0) AS revenue
      FROM attendance
      INNER JOIN sessions ON sessions.id = attendance.session_id
      WHERE sessions.date >= DATE '${PERIOD_START}'
        AND sessions.date < DATE '${PERIOD_END_EXCLUSIVE}'
        AND attendance.status IN ('present', 'excused')
      GROUP BY 1
    ),
    session_allowances AS (
      SELECT
        date_trunc('month', sessions.date)::date AS month_start,
        sessions.id AS session_id,
        LEAST(
          COALESCE(
            NULLIF(classes.max_allowance_per_session, 0),
            COALESCE(sessions.allowance_amount, 0) * COALESCE(sessions.coefficient, 1)
          ),
          COALESCE(sessions.allowance_amount, 0) * COALESCE(sessions.coefficient, 1)
        ) AS teacher_allowance_total
      FROM attendance
      INNER JOIN sessions ON sessions.id = attendance.session_id
      INNER JOIN classes ON classes.id = sessions.class_id
      WHERE sessions.date >= DATE '${PERIOD_START}'
        AND sessions.date < DATE '${PERIOD_END_EXCLUSIVE}'
      GROUP BY
        1, sessions.id, sessions.allowance_amount,
        classes.max_allowance_per_session, sessions.coefficient
    ),
    monthly_teacher_cost AS (
      SELECT month_start, COALESCE(SUM(teacher_allowance_total), 0) AS amount
      FROM session_allowances
      GROUP BY 1
    ),
    monthly_customer_care_cost AS (
      SELECT
        date_trunc('month', sessions.date)::date AS month_start,
        COALESCE(SUM(ROUND((COALESCE(attendance.tuition_fee, 0) * COALESCE(attendance.customer_care_coef, 0))::numeric, 0)), 0) AS amount
      FROM attendance
      INNER JOIN sessions ON sessions.id = attendance.session_id
      WHERE sessions.date >= DATE '${PERIOD_START}'
        AND sessions.date < DATE '${PERIOD_END_EXCLUSIVE}'
      GROUP BY 1
    ),
    monthly_lesson_cost AS (
      SELECT
        date_trunc('month', lesson_outputs.date)::date AS month_start,
        COALESCE(SUM(COALESCE(lesson_outputs.cost, 0)), 0) AS amount
      FROM lesson_outputs
      WHERE lesson_outputs.date >= DATE '${PERIOD_START}'
        AND lesson_outputs.date < DATE '${PERIOD_END_EXCLUSIVE}'
      GROUP BY 1
    ),
    monthly_bonus_cost AS (
      SELECT
        date_trunc('month', bonuses.date)::date AS month_start,
        COALESCE(SUM(COALESCE(bonuses.amount, 0)), 0) AS amount
      FROM bonuses
      WHERE bonuses.date >= DATE '${PERIOD_START}'
        AND bonuses.date < DATE '${PERIOD_END_EXCLUSIVE}'
      GROUP BY 1
    ),
    monthly_extra_allowance_cost AS (
      SELECT
        TO_DATE(CONCAT(extra_allowances.month, '-01'), 'YYYY-MM-DD') AS month_start,
        COALESCE(SUM(COALESCE(extra_allowances.amount, 0)), 0) AS amount
      FROM extra_allowances
      WHERE extra_allowances.month::text >= '${FROM_MONTH_KEY}'
        AND extra_allowances.month::text < '${TO_KEY_EXCLUSIVE}'
      GROUP BY 1
    ),
    monthly_assistant_cost AS (
      SELECT
        date_trunc('month', sessions.date)::date AS month_start,
        COALESCE(SUM(ROUND((COALESCE(attendance.tuition_fee, 0) * 0.03)::numeric, 0)), 0) AS amount
      FROM attendance
      INNER JOIN sessions ON sessions.id = attendance.session_id
      WHERE attendance.status IN ('present', 'excused')
        AND attendance.assistant_manager_staff_id IS NOT NULL
        AND (
          attendance.assistant_manager_staff_id IS NULL
          OR attendance.customer_care_staff_id IS NULL
          OR attendance.assistant_manager_staff_id <> attendance.customer_care_staff_id
        )
        AND sessions.date >= DATE '${PERIOD_START}'
        AND sessions.date < DATE '${PERIOD_END_EXCLUSIVE}'
      GROUP BY 1
    ),
    monthly_training_manager_cost AS (
      SELECT
        date_trunc('month', sessions.date)::date AS month_start,
        COALESCE(SUM(COALESCE(sessions.training_manager_allowance_amount, 0)), 0) AS amount
      FROM sessions
      WHERE sessions.date >= DATE '${PERIOD_START}'
        AND sessions.date < DATE '${PERIOD_END_EXCLUSIVE}'
      GROUP BY 1
    ),
    monthly_operating_cost AS (
      SELECT
        TO_DATE(
          CONCAT(
            COALESCE(NULLIF(BTRIM(cost_extend.month::text), ''), TO_CHAR(cost_extend.date, 'YYYY-MM')),
            '-01'
          ),
          'YYYY-MM-DD'
        ) AS month_start,
        COALESCE(SUM(COALESCE(cost_extend.amount, 0)), 0) AS amount
      FROM cost_extend
      WHERE (
        cost_extend.month IS NOT NULL
        AND BTRIM(cost_extend.month::text) <> ''
        AND cost_extend.month::text >= '${FROM_MONTH_KEY}'
        AND cost_extend.month::text < '${TO_KEY_EXCLUSIVE}'
      ) OR (
        cost_extend.date IS NOT NULL
        AND cost_extend.date >= DATE '${PERIOD_START}'
        AND cost_extend.date < DATE '${PERIOD_END_EXCLUSIVE}'
      )
      GROUP BY 1
    ),
    monthly_topup AS (
      SELECT
        date_trunc('month', wallet_transactions_history.created_at)::date AS month_start,
        COALESCE(SUM(COALESCE(wallet_transactions_history.amount, 0)), 0) AS amount
      FROM wallet_transactions_history
      WHERE wallet_transactions_history.type::text = 'topup'
        AND wallet_transactions_history.created_at >= DATE '${PERIOD_START}'
        AND wallet_transactions_history.created_at < DATE '${PERIOD_END_EXCLUSIVE}'
      GROUP BY 1
    ),
    wallet_cumulative AS (
      SELECT
        wallet_transactions_history.student_id,
        wallet_transactions_history.created_at,
        SUM(
          CASE
            WHEN wallet_transactions_history.type::text = 'topup'
              THEN wallet_transactions_history.amount
            ELSE -wallet_transactions_history.amount
          END
        ) OVER (
          PARTITION BY wallet_transactions_history.student_id
          ORDER BY wallet_transactions_history.created_at
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_balance
      FROM wallet_transactions_history
      WHERE wallet_transactions_history.created_at < DATE '${PERIOD_END_EXCLUSIVE}'
    ),
    monthly_student_balance AS (
      SELECT DISTINCT ON (month_series.month_start, wallet_cumulative.student_id)
        month_series.month_start,
        wallet_cumulative.student_id,
        wallet_cumulative.cumulative_balance
      FROM month_series
      INNER JOIN wallet_cumulative
        ON wallet_cumulative.created_at < (month_series.month_start + INTERVAL '1 month')
      ORDER BY
        month_series.month_start,
        wallet_cumulative.student_id,
        wallet_cumulative.created_at DESC
    ),
    monthly_unpaid AS (
      SELECT
        month_start,
        COALESCE(SUM(ABS(cumulative_balance)) FILTER (WHERE cumulative_balance < 0), 0) AS amount
      FROM monthly_student_balance
      GROUP BY 1
    )
    SELECT
      to_char(month_series.month_start, 'YYYY-MM') AS "monthKey",
      month_series.month_start AS "monthStart",
      COALESCE(monthly_students.student_count, 0) AS students,
      COALESCE(monthly_activity.class_count, 0) AS classes,
      COALESCE(monthly_activity.teacher_count, 0) AS teachers,
      COALESCE(monthly_revenue.revenue, 0) AS revenue,
      COALESCE(monthly_teacher_cost.amount, 0) AS "teacherCost",
      COALESCE(monthly_customer_care_cost.amount, 0) AS "customerCareCost",
      COALESCE(monthly_lesson_cost.amount, 0) AS "lessonCost",
      COALESCE(monthly_bonus_cost.amount, 0) AS "bonusCost",
      COALESCE(monthly_extra_allowance_cost.amount, 0) AS "extraAllowanceCost",
      COALESCE(monthly_assistant_cost.amount, 0) AS "assistantCost",
      COALESCE(monthly_training_manager_cost.amount, 0) AS "trainingManagerCost",
      COALESCE(monthly_operating_cost.amount, 0) AS "operatingCost",
      COALESCE(monthly_topup.amount, 0) AS "totalTopup",
      COALESCE(monthly_unpaid.amount, 0) AS "totalUnpaid"
    FROM month_series
    LEFT JOIN monthly_students ON monthly_students.month_start = month_series.month_start
    LEFT JOIN monthly_activity ON monthly_activity.month_start = month_series.month_start
    LEFT JOIN monthly_revenue ON monthly_revenue.month_start = month_series.month_start
    LEFT JOIN monthly_teacher_cost ON monthly_teacher_cost.month_start = month_series.month_start
    LEFT JOIN monthly_customer_care_cost ON monthly_customer_care_cost.month_start = month_series.month_start
    LEFT JOIN monthly_lesson_cost ON monthly_lesson_cost.month_start = month_series.month_start
    LEFT JOIN monthly_bonus_cost ON monthly_bonus_cost.month_start = month_series.month_start
    LEFT JOIN monthly_extra_allowance_cost ON monthly_extra_allowance_cost.month_start = month_series.month_start
    LEFT JOIN monthly_assistant_cost ON monthly_assistant_cost.month_start = month_series.month_start
    LEFT JOIN monthly_training_manager_cost ON monthly_training_manager_cost.month_start = month_series.month_start
    LEFT JOIN monthly_operating_cost ON monthly_operating_cost.month_start = month_series.month_start
    LEFT JOIN monthly_topup ON monthly_topup.month_start = month_series.month_start
    LEFT JOIN monthly_unpaid ON monthly_unpaid.month_start = month_series.month_start
    ORDER BY month_series.month_start ASC
  `;

  const { rows } = await client.query(sql);
  return rows.map((row) => {
    const monthKey = monthKeyFromValue(row.monthKey ?? row.monthStart);
    const totals = buildExpenseProfit({
      revenue: money(row.revenue),
      teacherCost: money(row.teacherCost),
      customerCareCost: money(row.customerCareCost),
      lessonCost: money(row.lessonCost),
      bonusCost: money(row.bonusCost),
      extraAllowanceCost: money(row.extraAllowanceCost),
      assistantCost: money(row.assistantCost),
      trainingManagerCost: money(row.trainingManagerCost),
      operatingCost: money(row.operatingCost),
    });
    return {
      monthKey,
      month: monthShortFromKey(monthKey),
      students: integer(row.students),
      classes: integer(row.classes),
      teachers: integer(row.teachers),
      ...totals,
      totalTopup: money(row.totalTopup),
      totalUnpaid: money(row.totalUnpaid),
    };
  });
}

async function svgToPng(svg, width, height) {
  return sharp(Buffer.from(svg)).resize(width, height).png().toBuffer();
}

function buildLegend(items, x, y) {
  return items
    .map((item, index) => {
      const lx = x + index * 110;
      return `
        <rect x="${lx}" y="${y}" width="12" height="12" fill="${item.color}" rx="2"/>
        <text x="${lx + 18}" y="${y + 10}" font-size="11" fill="${COLORS.text}" font-family="Arial, sans-serif">${escapeXml(item.label)}</text>
      `;
    })
    .join('');
}

function buildAxes({ width, height, padL, padR, padT, padB, yMax, labels, yFormatter = formatCompact }) {
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = (yMax * i) / ticks;
    const y = padT + plotH - (plotH * i) / ticks;
    return `
      <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="${COLORS.grid}" stroke-dasharray="3 3"/>
      <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="${COLORS.muted}" font-family="Arial, sans-serif">${escapeXml(yFormatter(value))}</text>
    `;
  }).join('');
  const xLabels = labels
    .map((label, i) => {
      const x = padL + (labels.length === 1 ? plotW / 2 : (plotW * i) / (labels.length - 1));
      return `<text x="${x}" y="${height - 18}" text-anchor="middle" font-size="11" fill="${COLORS.text}" font-family="Arial, sans-serif">${escapeXml(label)}</text>`;
    })
    .join('');
  return { plotW, plotH, yTicks, xLabels };
}

function financialChartSvg(months) {
  const width = 920;
  const height = 360;
  const padL = 56;
  const padR = 24;
  const padT = 48;
  const padB = 48;
  const labels = months.map((m) => m.month);
  const yMax = niceMax(Math.max(...months.flatMap((m) => [m.revenue, m.expense, m.profit, m.totalTopup]), 1));
  const { plotW, plotH, yTicks, xLabels } = buildAxes({ width, height, padL, padR, padT, padB, yMax, labels });
  const n = months.length;
  const groupW = plotW / Math.max(n, 1);
  const barW = Math.min(22, groupW * 0.28);
  const bars = months
    .map((m, i) => {
      const cx = padL + groupW * i + groupW / 2;
      const revH = (m.revenue / yMax) * plotH;
      const expH = (m.expense / yMax) * plotH;
      return `
        <rect x="${cx - barW - 2}" y="${padT + plotH - revH}" width="${barW}" height="${revH}" fill="${COLORS.primary}" rx="3"/>
        <rect x="${cx + 2}" y="${padT + plotH - expH}" width="${barW}" height="${expH}" fill="${COLORS.error}" rx="3"/>
      `;
    })
    .join('');
  const linePath = (getter) =>
    months
      .map((m, i) => {
        const x = padL + groupW * i + groupW / 2;
        const y = padT + plotH - (getter(m) / yMax) * plotH;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  const dots = (getter, color) =>
    months
      .map((m, i) => {
        const x = padL + groupW * i + groupW / 2;
        const y = padT + plotH - (getter(m) / yMax) * plotH;
        return `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`;
      })
      .join('');
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${padL}" y="22" font-size="14" font-weight="700" fill="${COLORS.text}" font-family="Arial, sans-serif">Doanh thu · Chi phí · Lợi nhuận · Tổng nạp</text>
  ${buildLegend(
    [
      { label: 'Doanh thu', color: COLORS.primary },
      { label: 'Chi phí', color: COLORS.error },
      { label: 'Lợi nhuận', color: COLORS.success },
      { label: 'Tổng nạp', color: COLORS.topup },
    ],
    padL,
    30,
  )}
  ${yTicks}
  ${bars}
  <path d="${linePath((m) => m.profit)}" fill="none" stroke="${COLORS.success}" stroke-width="2.5"/>
  <path d="${linePath((m) => m.totalTopup)}" fill="none" stroke="${COLORS.topup}" stroke-width="2.5"/>
  ${dots((m) => m.profit, COLORS.success)}
  ${dots((m) => m.totalTopup, COLORS.topup)}
  ${xLabels}
</svg>`;
}

function expenseChartSvg(months) {
  const width = 920;
  const height = 400;
  const padL = 56;
  const padR = 24;
  const padT = 72;
  const padB = 48;
  const labels = months.map((m) => m.month);
  const yMax = niceMax(Math.max(...months.flatMap((m) => EXPENSE_SERIES.map((s) => m[s.key] || 0)), 1));
  const { plotW, plotH, yTicks, xLabels } = buildAxes({ width, height, padL, padR, padT, padB, yMax, labels });
  const n = months.length;
  const groupW = plotW / Math.max(n, 1);
  const lines = EXPENSE_SERIES.map((series) => {
    const path = months
      .map((m, i) => {
        const x = padL + groupW * i + groupW / 2;
        const y = padT + plotH - ((m[series.key] || 0) / yMax) * plotH;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
    const dots = months
      .map((m, i) => {
        const x = padL + groupW * i + groupW / 2;
        const y = padT + plotH - ((m[series.key] || 0) / yMax) * plotH;
        return `<circle cx="${x}" cy="${y}" r="2.8" fill="${series.color}"/>`;
      })
      .join('');
    return `<path d="${path}" fill="none" stroke="${series.color}" stroke-width="2"/>${dots}`;
  }).join('');
  const legendRows = [EXPENSE_SERIES.slice(0, 4), EXPENSE_SERIES.slice(4)]
    .map((row, rowIndex) =>
      buildLegend(
        row.map((s) => ({ label: s.name, color: s.color })),
        padL,
        28 + rowIndex * 18,
      ),
    )
    .join('');
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${padL}" y="20" font-size="14" font-weight="700" fill="${COLORS.text}" font-family="Arial, sans-serif">Chi phí theo từng khoản</text>
  ${legendRows}
  ${yTicks}
  ${lines}
  ${xLabels}
</svg>`;
}

function operationsChartSvg(months) {
  const width = 920;
  const height = 340;
  const padL = 48;
  const padR = 24;
  const padT = 48;
  const padB = 48;
  const labels = months.map((m) => m.month);
  const yMax = niceMax(Math.max(...months.flatMap((m) => [m.students, m.classes, m.teachers]), 1));
  const { plotW, plotH, yTicks, xLabels } = buildAxes({
    width,
    height,
    padL,
    padR,
    padT,
    padB,
    yMax,
    labels,
    yFormatter: (n) => String(Math.round(n)),
  });
  const n = months.length;
  const groupW = plotW / Math.max(n, 1);
  const barW = Math.min(16, groupW * 0.22);
  const bars = months
    .map((m, i) => {
      const cx = padL + groupW * i + groupW / 2;
      const series = [
        { value: m.students, color: COLORS.primary, offset: -barW - 2 },
        { value: m.classes, color: COLORS.info, offset: 0 },
        { value: m.teachers, color: COLORS.warning, offset: barW + 2 },
      ];
      return series
        .map((s) => {
          const h = (s.value / yMax) * plotH;
          return `<rect x="${cx + s.offset - barW / 2}" y="${padT + plotH - h}" width="${barW}" height="${h}" fill="${s.color}" rx="2"/>`;
        })
        .join('');
    })
    .join('');
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${padL}" y="22" font-size="14" font-weight="700" fill="${COLORS.text}" font-family="Arial, sans-serif">Học sinh · Lớp học · Gia sư</text>
  ${buildLegend(
    [
      { label: 'Học sinh', color: COLORS.primary },
      { label: 'Lớp học', color: COLORS.info },
      { label: 'Gia sư', color: COLORS.warning },
    ],
    padL,
    30,
  )}
  ${yTicks}
  ${bars}
  ${xLabels}
</svg>`;
}

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
    },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 18, font: 'Arial' })],
      }),
    ],
  });
}

function bodyCell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
    },
    children: [
      new Paragraph({
        alignment: opts.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.bold, size: 18, font: 'Arial' })],
      }),
    ],
  });
}

function makeTable(headers, rows, colWidths) {
  return new Table({
    width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        children: headers.map((h, i) => headerCell(h, colWidths[i])),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((cell, i) =>
              bodyCell(cell, colWidths[i], {
                bold: i === 0,
                align: i === 0 ? 'left' : 'right',
              }),
            ),
          }),
      ),
    ],
  });
}

function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true, size: 28, font: 'Arial' })],
  });
}

const FINANCE_METRIC_GLOSSARY = [
  {
    term: 'Doanh thu',
    definition:
      'Tổng học phí của các buổi học viên đã học trong tháng (có mặt hoặc được miễn điểm danh). Đây là tiền trung tâm thực sự “kiếm được” theo buổi học.',
  },
  {
    term: 'Chi phí',
    definition:
      'Toàn bộ tiền trung tâm đã chi trong tháng: trả nhân sự (dạy, chăm sóc khách hàng, giáo án, thưởng, trợ cấp…) và các khoản chi vận hành khác.',
  },
  {
    term: 'Lợi nhuận',
    definition: 'Số còn lại sau khi lấy Doanh thu trừ Chi phí trong cùng tháng.',
  },
  {
    term: 'Tổng nạp',
    definition:
      'Tổng tiền phụ huynh/học viên nạp vào ví trong tháng. Đây chưa phải doanh thu — tiền nạp có thể dùng dần cho nhiều buổi học sau.',
  },
];

const EXPENSE_METRIC_GLOSSARY = [
  { term: 'Dạy', definition: 'Tiền trả gia sư cho các buổi dạy trong tháng.' },
  {
    term: 'CSKH',
    definition: 'Hoa hồng trả cho nhân viên chăm sóc khách hàng trong tháng.',
  },
  { term: 'Giáo án', definition: 'Chi phí làm / mua giáo án trong tháng.' },
  { term: 'Thưởng', definition: 'Tiền thưởng trả cho nhân sự trong tháng.' },
  {
    term: 'Trợ cấp khác',
    definition: 'Các khoản trợ cấp ngoài lương dạy và hoa hồng thông thường trong tháng.',
  },
  { term: 'Trợ lí', definition: 'Tiền hỗ trợ trả cho trợ lí lớp trong tháng.' },
  { term: 'QL lớp', definition: 'Tiền hỗ trợ người quản lý lớp trong tháng.' },
  {
    term: 'Vận hành',
    definition:
      'Các khoản chi phí hoạt động khác của trung tâm ghi nhận trong tháng (ngoài trả nhân sự ở trên).',
  },
  {
    term: 'Tổng',
    definition:
      'Cộng tất cả các khoản chi phí ở trên. Trùng với cột Chi phí ở bảng tài chính cùng tháng.',
  },
];

const OPERATIONS_METRIC_GLOSSARY = [
  {
    term: 'Học sinh',
    definition:
      'Số học viên còn đang học tại thời điểm cuối tháng (đã vào học trước đó và chưa nghỉ).',
  },
  {
    term: 'Lớp học',
    definition: 'Số lớp có ít nhất một buổi học diễn ra trong tháng đó.',
  },
  {
    term: 'Gia sư',
    definition: 'Số gia sư có ít nhất một buổi dạy trong tháng đó.',
  },
];
function glossaryBlocks(items) {
  return [
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({
          text: 'Giải thích chỉ số',
          bold: true,
          size: 18,
          color: '6B7280',
          font: 'Arial',
        }),
      ],
    }),
    ...items.map(
      (item, index) =>
        new Paragraph({
          spacing: { after: index === items.length - 1 ? 200 : 60 },
          children: [
            new TextRun({ text: `${item.term}: `, bold: true, size: 17, font: 'Arial' }),
            new TextRun({ text: item.definition, size: 17, color: '4B5563', font: 'Arial' }),
          ],
        }),
    ),
  ];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let months;
  try {
    months = await fetchMonths(client);
  } finally {
    await client.end();
  }

  if (!months.length) {
    throw new Error('Không có dữ liệu thống kê trong khoảng đã chọn.');
  }

  const [financePng, expensePng, opsPng] = await Promise.all([
    svgToPng(financialChartSvg(months), 920, 360),
    svgToPng(expenseChartSvg(months), 920, 400),
    svgToPng(operationsChartSvg(months), 920, 340),
  ]);

  const financeTable = makeTable(
    ['Tháng', 'Doanh thu', 'Chi phí', 'Lợi nhuận', 'Tổng nạp'],
    months.map((m) => [
      m.monthKey,
      formatCurrency(m.revenue),
      formatCurrency(m.expense),
      formatCurrency(m.profit),
      formatCurrency(m.totalTopup),
    ]),
    [1600, 2000, 2000, 2000, 2000],
  );

  const expenseTable = makeTable(
    ['Tháng', ...EXPENSE_SERIES.map((s) => s.name), 'Tổng'],
    months.map((m) => [
      m.monthKey,
      ...EXPENSE_SERIES.map((s) => formatCurrency(m[s.key] || 0)),
      formatCurrency(m.expense),
    ]),
    [1100, 1000, 1000, 1000, 1000, 1200, 1000, 1000, 1100, 1400],
  );

  const opsTable = makeTable(
    ['Tháng', 'Học sinh', 'Lớp học', 'Gia sư'],
    months.map((m) => [m.monthKey, String(m.students), String(m.classes), String(m.teachers)]),
    [2400, 2400, 2400, 2400],
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
        },
        children: [
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Thống kê theo tháng', bold: true, size: 36, font: 'Arial' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `Khoảng thời gian: ${FROM_MONTH_KEY} → ${TO_MONTH_KEY}`,
                size: 22,
                color: '374151',
                font: 'Arial',
              }),
            ],
          }),

          sectionHeading('1. Doanh thu · Chi phí · Lợi nhuận'),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new ImageRun({
                type: 'png',
                data: financePng,
                transformation: { width: 640, height: 250 },
                altText: {
                  title: 'Biểu đồ tài chính',
                  description: 'Doanh thu, chi phí, lợi nhuận, tổng nạp',
                  name: 'finance-chart',
                },
              }),
            ],
          }),
          financeTable,
          ...glossaryBlocks(FINANCE_METRIC_GLOSSARY),

          sectionHeading('2. Chi phí theo từng khoản'),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new ImageRun({
                type: 'png',
                data: expensePng,
                transformation: { width: 640, height: 278 },
                altText: {
                  title: 'Biểu đồ chi phí theo khoản',
                  description: 'Breakdown chi phí 8 khoản',
                  name: 'expense-chart',
                },
              }),
            ],
          }),
          expenseTable,
          ...glossaryBlocks(EXPENSE_METRIC_GLOSSARY),

          sectionHeading('3. Học sinh · Lớp học · Gia sư'),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new ImageRun({
                type: 'png',
                data: opsPng,
                transformation: { width: 640, height: 236 },
                altText: {
                  title: 'Biểu đồ vận hành',
                  description: 'Học sinh, lớp học, gia sư',
                  name: 'ops-chart',
                },
              }),
            ],
          }),
          opsTable,
          ...glossaryBlocks(OPERATIONS_METRIC_GLOSSARY),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const fileName = `Thong-ke-thang_${FROM_MONTH_KEY}_den_${TO_MONTH_KEY}.docx`;
  const outDownloads = path.join(os.homedir(), 'Downloads', fileName);
  const outWorkspace = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    '.scratch',
    fileName,
  );

  fs.mkdirSync(path.dirname(outWorkspace), { recursive: true });
  fs.writeFileSync(outDownloads, buffer);
  fs.writeFileSync(outWorkspace, buffer);

  console.log(JSON.stringify({ outDownloads, outWorkspace, months: months.map((m) => m.monthKey) }, null, 2));
  console.table(
    months.map((m) => ({
      month: m.monthKey,
      students: m.students,
      classes: m.classes,
      teachers: m.teachers,
      revenue: m.revenue,
      expense: m.expense,
      profit: m.profit,
      totalTopup: m.totalTopup,
    })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
