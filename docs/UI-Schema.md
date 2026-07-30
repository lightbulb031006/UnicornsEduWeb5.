# Unicorns Edu 5.0 – UI Schema

## 1. Design Philosophy

Unicorns Edu 5.0 uses a tokenized color system built for product clarity, operational trust, and long-term maintainability.

- Modern and clean through neutral-first surfaces and restrained accent usage.
- Trustworthy through stable blue brand anchors across all themes.
- Friendly through softened edges and balanced saturation, without playful/childlike color behavior.
- Tech-focused through clear hierarchy, high-legibility contrast, and consistent interaction states.

## 2. Theme Architecture Overview

### Token model: Primitive vs Semantic

- **Primitive tokens** are raw color scales (`blue-500`, `neutral-700`, `pink-200`).
- **Semantic tokens** map intent to UI meaning (`bg-surface`, `text-secondary`, `border-focus`, `primary-hover`).

### Runtime theme (`data-theme`)

- Người dùng chọn **Sáng** (`light`), **Tối** (`dark`), **Hoa anh đào** (`pink`) qua popup icon palette. Protected shell dùng picker trong sidebar; public/home navbar và các trang auth/verify/wallet approval dùng compact picker để mọi entry point đều đổi theme được. Popup được **portal** ra `document.body` để không bị cắt bởi `overflow` / `transform` của sidebar. Giá trị lưu `localStorage` key `ue-app-theme` (đồng bộ với `apps/web/dtos/theme.dto.ts` → `THEME_STORAGE_KEY`).
- `ThemeProvider` (`apps/web/context/ThemeContext.tsx`) dùng `useSyncExternalStore`, áp `data-theme` trong `useLayoutEffect`, và đồng bộ giữa tab qua `storage` event. Khi storage bị clear hoặc chứa giá trị không hợp lệ, theme fallback về `light`.
- `[data-theme]` cũng đặt `color-scheme` (`light`/`dark`) trong `apps/web/app/globals.css` để scrollbar, form controls, và native UI theo đúng theme.
- `BrandLogo` / `BrandLogoLockup` dùng lần lượt `logo_light.png`, `logo_dark.png`, `logo_hana.png` theo theme.
- Token CSS cho `[data-theme="pink"]` trong `apps/web/app/globals.css` dùng tông **hoa anh đào / rose** (primary rose ~`#DB2777`), khác bảng primitive “Pink-Purple” bên dưới (tài liệu tham chiếu scale); khi đổi scale primitive cần rà lại semantic pink trong `globals.css`.

### Why semantic naming

- Components consume semantic tokens, not raw hex, so themes can switch without component rewrites.
- Product decisions remain language-based (`error`, `muted`, `elevated`) instead of color-based (`red-600`).
- Reduces regression during rebrand, dark-mode tuning, and accessibility adjustments.

### Scalability considerations

- All new components must use semantic tokens only; avoid raw Tailwind palette classes (`bg-black/*`, `text-white`, `blue-*`, etc.) except brand-owned assets.
- Primitive scales remain central source of truth.
- Themes are runtime-switchable via `[data-theme]`.
- Status colors are kept behaviorally consistent across themes to avoid cognitive drift.

## 3. Color System

### 3.1 Primitive Palette

#### A) Light Mode (White-Blue)

**Primary (Blue)**

| Token | HEX |
| --- | --- |
| `blue-50` | `#EFF6FF` |
| `blue-100` | `#DBEAFE` |
| `blue-200` | `#BFDBFE` |
| `blue-300` | `#93C5FD` |
| `blue-400` | `#60A5FA` |
| `blue-500` | `#3B82F6` |
| `blue-600` | `#2563EB` |
| `blue-700` | `#1D4ED8` |
| `blue-800` | `#1E40AF` |
| `blue-900` | `#1E3A8A` |

**Neutral (Cool Gray)**

| Token | HEX |
| --- | --- |
| `neutral-50` | `#F8FAFC` |
| `neutral-100` | `#F1F5F9` |
| `neutral-200` | `#E2E8F0` |
| `neutral-300` | `#CBD5E1` |
| `neutral-400` | `#94A3B8` |
| `neutral-500` | `#64748B` |
| `neutral-600` | `#475569` |
| `neutral-700` | `#334155` |
| `neutral-800` | `#1E293B` |
| `neutral-900` | `#0F172A` |

**Status**

| Group | HEX |
| --- | --- |
| `success-500` | `#10B981` |
| `warning-500` | `#F59E0B` |
| `error-500` | `#EF4444` |
| `info-500` | `#0EA5E9` |

#### B) Dark Mode (Black-Blue)

**Primary (Blue, lifted for dark backgrounds)**

| Token | HEX |
| --- | --- |
| `blue-50` | `#0B1220` |
| `blue-100` | `#0F1C36` |
| `blue-200` | `#14264B` |
| `blue-300` | `#1B3A6B` |
| `blue-400` | `#24579A` |
| `blue-500` | `#3B82F6` |
| `blue-600` | `#60A5FA` |
| `blue-700` | `#93C5FD` |
| `blue-800` | `#BFDBFE` |
| `blue-900` | `#DBEAFE` |

**Neutral (Charcoal)**

| Token | HEX |
| --- | --- |
| `neutral-50` | `#111827` |
| `neutral-100` | `#1F2937` |
| `neutral-200` | `#273449` |
| `neutral-300` | `#334155` |
| `neutral-400` | `#475569` |
| `neutral-500` | `#64748B` |
| `neutral-600` | `#94A3B8` |
| `neutral-700` | `#CBD5E1` |
| `neutral-800` | `#E2E8F0` |
| `neutral-900` | `#F1F5F9` |

**Status (dark-tuned)**

| Group | HEX |
| --- | --- |
| `success-500` | `#34D399` |
| `warning-500` | `#FBBF24` |
| `error-500` | `#F87171` |
| `info-500` | `#38BDF8` |

#### C) Pink Mode (Pink-Purple)

**Primary (Elegant Purple)**

| Token | HEX |
| --- | --- |
| `purple-50` | `#FAF5FF` |
| `purple-100` | `#F3E8FF` |
| `purple-200` | `#E9D5FF` |
| `purple-300` | `#D8B4FE` |
| `purple-400` | `#C084FC` |
| `purple-500` | `#A855F7` |
| `purple-600` | `#9333EA` |
| `purple-700` | `#7E22CE` |
| `purple-800` | `#6B21A8` |
| `purple-900` | `#581C87` |

**Neutral (Rose-tinted neutral)**

| Token | HEX |
| --- | --- |
| `neutral-50` | `#FFF7FB` |
| `neutral-100` | `#FDEFF8` |
| `neutral-200` | `#FADCEB` |
| `neutral-300` | `#F4C1DA` |
| `neutral-400` | `#E8A0C5` |
| `neutral-500` | `#C97AA4` |
| `neutral-600` | `#A15E84` |
| `neutral-700` | `#7C4866` |
| `neutral-800` | `#5A354A` |
| `neutral-900` | `#3F2334` |

**Status (kept consistent, slightly softened)**

| Group | HEX |
| --- | --- |
| `success-500` | `#22C55E` |
| `warning-500` | `#F59E0B` |
| `error-500` | `#F43F5E` |
| `info-500` | `#3B82F6` |

### 3.2 Semantic Tokens

#### Light Theme

| Semantic token | HEX |
| --- | --- |
| `bg-primary` | `#FFFFFF` |
| `bg-secondary` | `#F8FAFC` |
| `bg-tertiary` | `#F1F5F9` |
| `bg-surface` | `#FFFFFF` |
| `bg-elevated` | `#FFFFFF` |
| `text-primary` | `#0F172A` |
| `text-secondary` | `#334155` |
| `text-muted` | `#64748B` |
| `text-inverse` | `#FFFFFF` |
| `border-default` | `#E2E8F0` |
| `border-subtle` | `#F1F5F9` |
| `border-focus` | `#2563EB` |
| `primary` | `#2563EB` |
| `primary-hover` | `#1D4ED8` |
| `primary-active` | `#1E40AF` |
| `secondary` | `#EFF6FF` |
| `danger` | `#EF4444` |
| `success` | `#10B981` |
| `warning` | `#F59E0B` |
| `error` | `#EF4444` |
| `info` | `#0EA5E9` |

#### Dark Theme

| Semantic token | HEX |
| --- | --- |
| `bg-primary` | `#111827` |
| `bg-secondary` | `#1F2937` |
| `bg-tertiary` | `#273449` |
| `bg-surface` | `#1F2937` |
| `bg-elevated` | `#273449` |
| `text-primary` | `#F1F5F9` |
| `text-secondary` | `#CBD5E1` |
| `text-muted` | `#94A3B8` |
| `text-inverse` | `#0F172A` |
| `border-default` | `#334155` |
| `border-subtle` | `#273449` |
| `border-focus` | `#60A5FA` |
| `primary` | `#60A5FA` |
| `primary-hover` | `#93C5FD` |
| `primary-active` | `#BFDBFE` |
| `secondary` | `#1B3A6B` |
| `danger` | `#F87171` |
| `success` | `#34D399` |
| `warning` | `#FBBF24` |
| `error` | `#F87171` |
| `info` | `#38BDF8` |

#### Pink Theme

| Semantic token | HEX |
| --- | --- |
| `bg-primary` | `#FFF7FB` |
| `bg-secondary` | `#FDEFF8` |
| `bg-tertiary` | `#FADCEB` |
| `bg-surface` | `#FFFFFF` |
| `bg-elevated` | `#FFF7FB` |
| `text-primary` | `#3F2334` |
| `text-secondary` | `#5A354A` |
| `text-muted` | `#7C4866` |
| `text-inverse` | `#FFFFFF` |
| `border-default` | `#F4C1DA` |
| `border-subtle` | `#FADCEB` |
| `border-focus` | `#9333EA` |
| `primary` | `#9333EA` |
| `primary-hover` | `#7E22CE` |
| `primary-active` | `#6B21A8` |
| `secondary` | `#F3E8FF` |
| `danger` | `#F43F5E` |
| `success` | `#22C55E` |
| `warning` | `#F59E0B` |
| `error` | `#F43F5E` |
| `info` | `#3B82F6` |

### 3.3 Component Mapping

| Component | Background | Text | Border | Hover/Active |
| --- | --- | --- | --- | --- |
| Navbar | `bg-surface` | `text-primary` | `border-default` (bottom) | Item hover: `bg-secondary`, active item: `primary` + `text-inverse` |
| Brand | — | — | — | `BrandLogoLockup`: trang home và **sidebar mở rộng** dùng cùng variant `navbar` (flex, gap, cỡ mark, typography). Sidebar thu gọn: `dense` (chỉ mark nhỏ hơn). Đăng nhập: `auth`. Hover mark: opacity + contrast. |
| Sidebar | `bg-secondary` | `text-secondary` | `border-default` (right) | Item hover: `bg-tertiary`; active: `primary` + `text-inverse` |
| Cards | `bg-surface` | `text-primary` | `border-default` | Hover: elevate to `bg-elevated`, border to `border-focus` (subtle) |
| Buttons (Primary) | `primary` | `text-inverse` | `primary` | Hover: `primary-hover`; active: `primary-active` |
| Buttons (Secondary) | `secondary` | `text-primary` | `border-default` | Hover: `bg-tertiary`; active: `bg-secondary` |
| Inputs | `bg-surface` | `text-primary` | `border-default` | Hover border: `text-muted`; focus ring/border: `border-focus`; native date/month fields use shared `DateInput` / `MonthInput` so the whole input opens the picker; **time fields** use shared `TimeInput` — **24h** (no AM/PM, no seconds), display `HH:mm`, controlled value `HH:mm:ss` with seconds `00`, clock menu with `UpgradedSelect` for hour (`00–23`) + minute grid `00/15/30/45`, empty focus/create-start prefills current local time with minutes snapped to nearest `00/15/30/45`, typing stays local until blur, picker commits update the field draft immediately; clicking the whole field or the clock button opens the picker (see `docs/adr/2026-07-28-timeinput-24h-minute-precision.md`); **VND integer money fields** use shared `MoneyInput` (`apps/web/components/ui/MoneyInput.tsx`) with live `vi-VN` thousand grouping (e.g. `14.000`) — parse via `parseMoneyInput` in `apps/web/lib/money-input.helpers.ts` before submit |
| Badges | Status tint (`success/warning/error/info` with 12-16% alpha) | Matching status 700 equivalent | Status 300 equivalent | Hover: +6% tint opacity |
| Alerts | Status tint background | Status 800 equivalent | Status 300 equivalent | No color animation; keep stable for readability |
| Tags | `bg-secondary` | `text-secondary` | `border-subtle` | Hover: `bg-tertiary`, selected: `primary` + `text-inverse` |
| Tables | Header `bg-secondary`; row `bg-surface` | `text-primary` | `border-default` row separators | Row hover: `bg-secondary`; selected row: `secondary` |
| Modals | Surface `bg-elevated`; overlay uses semantic theme utility (`bg-bg-primary/75` + blur where needed) | `text-primary` | `border-default` | Primary action follows primary button tokens |

### 3.4 CSS Variables Version

```css
:root {
  --color-bg-primary: #FFFFFF;
  --color-bg-secondary: #F8FAFC;
  --color-bg-tertiary: #F1F5F9;
  --color-bg-surface: #FFFFFF;
  --color-bg-elevated: #FFFFFF;

  --color-text-primary: #0F172A;
  --color-text-secondary: #334155;
  --color-text-muted: #64748B;
  --color-text-inverse: #FFFFFF;

  --color-border-default: #E2E8F0;
  --color-border-subtle: #F1F5F9;
  --color-border-focus: #2563EB;

  --color-primary: #2563EB;
  --color-primary-hover: #1D4ED8;
  --color-primary-active: #1E40AF;
  --color-secondary: #EFF6FF;
  --color-danger: #EF4444;

  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-info: #0EA5E9;
}

[data-theme="dark"] {
  --color-bg-primary: #111827;
  --color-bg-secondary: #1F2937;
  --color-bg-tertiary: #273449;
  --color-bg-surface: #1F2937;
  --color-bg-elevated: #273449;

  --color-text-primary: #F1F5F9;
  --color-text-secondary: #CBD5E1;
  --color-text-muted: #94A3B8;
  --color-text-inverse: #0F172A;

  --color-border-default: #334155;
  --color-border-subtle: #273449;
  --color-border-focus: #60A5FA;

  --color-primary: #60A5FA;
  --color-primary-hover: #93C5FD;
  --color-primary-active: #BFDBFE;
  --color-secondary: #1B3A6B;
  --color-danger: #F87171;

  --color-success: #34D399;
  --color-warning: #FBBF24;
  --color-error: #F87171;
  --color-info: #38BDF8;
}

[data-theme="pink"] {
  --color-bg-primary: #FFF7FB;
  --color-bg-secondary: #FDEFF8;
  --color-bg-tertiary: #FADCEB;
  --color-bg-surface: #FFFFFF;
  --color-bg-elevated: #FFF7FB;

  --color-text-primary: #3F2334;
  --color-text-secondary: #5A354A;
  --color-text-muted: #7C4866;
  --color-text-inverse: #FFFFFF;

  --color-border-default: #F4C1DA;
  --color-border-subtle: #FADCEB;
  --color-border-focus: #9333EA;

  --color-primary: #9333EA;
  --color-primary-hover: #7E22CE;
  --color-primary-active: #6B21A8;
  --color-secondary: #F3E8FF;
  --color-danger: #F43F5E;

  --color-success: #22C55E;
  --color-warning: #F59E0B;
  --color-error: #F43F5E;
  --color-info: #3B82F6;
}
```

### 3.5 Tailwind Token Mapping

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
          surface: 'var(--color-bg-surface)',
          elevated: 'var(--color-bg-elevated)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          inverse: 'var(--color-text-inverse)',
        },
        border: {
          DEFAULT: 'var(--color-border-default)',
          subtle: 'var(--color-border-subtle)',
          focus: 'var(--color-border-focus)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          active: 'var(--color-primary-active)',
        },
        secondary: 'var(--color-secondary)',
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',
      },
    },
  },
};
```

### 3.6 Accessibility

- Minimum compliance target: **WCAG AA**.
- Body text contrast: at least **4.5:1** against background.
- Large text (>= 18px regular or >= 14px bold): at least **3:1**.
- Primary button text uses `text-inverse` with contrast >= **4.5:1** on `primary`.
- Muted text is only for supporting content, never for critical labels or error messages.
- Focus state must be visible in all themes with `border-focus` and a 2px ring.
- Dark mode avoids pure black (`#000000`) and pure white (`#FFFFFF`) on large surfaces to reduce eye strain.
- Status communication must not rely on color only; always pair with icon/label.

### 3.7 Motion and Reduced-Motion Guidelines

- Motion should be **subtle and functional** (feedback + hierarchy), not decorative overload.
- Prefer lightweight CSS utilities for landing/public pages:
  - `motion-fade-up`: soft reveal on first paint/section content.
  - `motion-hover-lift`: tiny hover elevation for cards/interactive surfaces.
- Recommended duration range: **180ms–520ms** with ease/ease-out curves.
- Motion must not shift layout significantly; avoid large translate distances.
- Always implement `@media (prefers-reduced-motion: reduce)`:
  - Disable non-essential animation.
  - Reduce transition/animation duration to near-zero.
  - Keep interaction usable without motion cues.

### 3.8 Migration Guide from Archived Version

#### What changes

- Deprecated flat variables (`--bg`, `--surface`, `--text`, `--primary`) are replaced by semantic token families (`--color-bg-*`, `--color-text-*`, `--color-border-*`).
- Archived `sakura` theme is replaced with production `pink` theme using lower saturation and stronger contrast.
- Inline page-level HEX usage in archived UI is removed; components must consume semantic tokens only.
- Primary scale is normalized across themes for predictable hover/active behavior.

#### What remains stable

- Brand blue remains the core trust signal and default action color.
- Status semantics remain unchanged (`success`, `warning`, `error`, `info`).
- Theme switching still uses `[data-theme]` runtime attribute model.

#### Color evolution reasoning

- Archived palette was functional but mixed tokenized colors with inline values, causing inconsistency and maintenance risk.
- New system introduces strict primitive-to-semantic mapping for predictable theming and lower regression risk.
- Pink mode evolves from playful sakura to elegant product tone suitable for long-session educational workflows.
