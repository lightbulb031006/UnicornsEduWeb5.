# ADR: TimeInput 24h, minute precision

- **Status:** Accepted
- **Date:** 2026-07-28
- **Updated:** 2026-09-07 (`prefillEmpty={false}` for optional times that must stay blank)
- **Updated:** 2026-08-02 (portal menu `z-[120]` to sit above modal dialogs like makeup editor `z-[110]`, matching `UpgradedSelect`)

## Context

Shared `TimeInput` used native `<input type="time">` with `step=1`. On machines with a 12-hour locale the OS picker shows AM/PM and a seconds column. Schedule/session flows only need wall-clock hour and minute, and operators expect 24h (`HH:mm`) without locale-dependent chrome.

Native time inputs cannot reliably force a 24h UI across browsers/OS locales.

An earlier revision opened a compact panel with two nested `UpgradedSelect` triggers (hour + minute). That required a second click to open each dropdown, which felt like an extra step for a frequent schedule/session action.

## Decision

Replace the native time picker inside shared `apps/web/components/ui/TimeInput.tsx` with a custom 24h control used everywhere that component is used (not `DateInput` / `MonthInput`).

Picker UI is a `document.body` portal panel (`fixed z-[120]`, same stacking as `UpgradedSelect` menus) with **two inline scroll columns** shown immediately on open (no nested select triggers):

- **Giờ** — scrollable list `00–23`
- **Phút** — scrollable list `00 / 15 / 30 / 45` (plus a temporary off-grid option when the current value is not on the grid)

- Display closed field as `HH:mm`; controlled `value` / `onChange` stay `HH:mm:ss` with seconds always `00`.
- No seconds, no AM/PM.
- Typing and picker both allowed; typed/blurred values normalize to `HH:mm:ss`.
- Off-grid legacy minutes (e.g. `18:10`) are kept as-is and shown as a temporary minute option until the user picks a grid value.
- **Immediate draft commit:** picker commits set local `draft` to the new `HH:mm` and call parent `onChange` synchronously so the text field updates in the same turn. Hour selection keeps the panel open; minute selection closes it and refocuses the field. Typing keystrokes stay local (`draft`) until blur/normalize.
- **Start-time prefill:** empty fields on focus/click, and create-form start defaults, use `currentTimePrefillValue()` — current local hour, minutes snapped to the nearest `00 / 15 / 30 / 45` (roll to next hour when rounding to `:60`), seconds `00`. Do not overwrite existing values. Opening the picker scrolls the current hour/minute into view. Call sites that must allow a blank time (practice lần giao `openAt` optional) pass `prefillEmpty={false}` so focus/open does not fill “now”.
- Empty end-time fields are not prefilled on form mount and are not auto-derived from start (+2h, etc.).
- Typed or stored off-grid minutes (e.g. `10:07`) stay as-is; callers must not floor to the 15′ grid when loading a value.
- `TimeInput` is wrapped in `memo` to skip re-renders when props are unchanged.

## Considered options

- Keep native `<input type="time">` with `step={60}` — removes seconds but cannot force 24h UI on 12h locales.
- Nested `UpgradedSelect` hour/minute triggers inside the panel — consistent with other dropdowns, but requires a second click after opening the clock panel.
- Custom picker that always snaps to 15 minutes on open — would silently rewrite historical schedule/session times.
- Change API/DB to drop seconds — unnecessary; `@db.Time` with `:00` is fine.

## Consequences

- All schedule/session/makeup call sites keep the same `value`/`onChange` contract (`HH:mm:ss`).
- UI docs (`docs/UI-Schema.md`) and `AGENTS.md` describe the inline dual scroll-column picker; BE schema unchanged.
