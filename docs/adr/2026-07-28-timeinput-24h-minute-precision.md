# ADR: TimeInput 24h, minute precision

- **Status:** Accepted
- **Date:** 2026-07-28
- **Updated:** 2026-07-30 (optimistic UI + current-time start prefill)

## Context

Shared `TimeInput` used native `<input type="time">` with `step=1`. On machines with a 12-hour locale the OS picker shows AM/PM and a seconds column. Schedule/session flows only need wall-clock hour and minute, and operators expect 24h (`HH:mm`) without locale-dependent chrome.

Native time inputs cannot reliably force a 24h UI across browsers/OS locales. A hand-rolled dual scroll-column panel was rejected as low-quality UI.

## Decision

Replace the native time picker inside shared `apps/web/components/ui/TimeInput.tsx` with a custom 24h control used everywhere that component is used (not `DateInput` / `MonthInput`).

Picker UI is composed from the shared `UpgradedSelect` (project simple-select primitive): a text field shows `HH:mm`; clicking the whole field or the clock button opens a compact menu with **Giờ** (`00–23`) and **Phút** (`00 / 15 / 30 / 45`) selects.

- Display closed field as `HH:mm`; controlled `value` / `onChange` stay `HH:mm:ss` with seconds always `00`.
- No seconds, no AM/PM.
- Typing and picker both allowed; typed/blurred values normalize to `HH:mm:ss`.
- Off-grid legacy minutes (e.g. `18:10`) are kept as-is and shown as a temporary minute option until the user picks a grid value.
- **Immediate draft commit:** picker commits set local `draft` to the new `HH:mm` and call parent `onChange` synchronously so the text field updates in the same turn (avoid clearing draft then sync-`focus()`, which previously restored a stale display until the next click). Typing keystrokes stay local (`draft`) until blur/normalize.
- **Start-time prefill:** empty fields on focus/click, and create-form start defaults, use `currentTimePrefillValue()` — current local hour, minutes snapped to the nearest `00 / 15 / 30 / 45` (roll to next hour when rounding to `:60`), seconds `00`. Do not overwrite existing values. Opening the picker shows the value currently on the field.
- Empty end-time fields are not prefilled on form mount and are not auto-derived from start (+2h, etc.).
- `TimeInput` is wrapped in `memo` to skip re-renders when props are unchanged.

## Considered options

- Keep native `<input type="time">` with `step={60}` — removes seconds but cannot force 24h UI on 12h locales.
- Custom dual scroll-column portal — forced 24h but looked generic/low-quality.
- Custom picker that always snaps to 15 minutes on open — would silently rewrite historical schedule/session times.
- Change API/DB to drop seconds — unnecessary; `@db.Time` with `:00` is fine.
## Consequences

- All schedule/session/makeup call sites keep the same `value`/`onChange` contract (`HH:mm:ss`).
- UI docs (`docs/UI-Schema.md`) describe the shared TimeInput behavior; BE schema unchanged.
