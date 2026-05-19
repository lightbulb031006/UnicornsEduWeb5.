# Domain Docs

This is a single-context monorepo. Before implementing or reviewing domain work, read the source-of-truth docs named in `AGENTS.md`:

- `docs/README.md`
- `docs/Cách làm việc.md`
- `docs/UI-Schema.md`
- `docs/Database Schema.md`
- `docs/pages/`

If `CONTEXT.md`, `CONTEXT-MAP.md`, or `docs/adr/` exists later, read the relevant files before changing the affected area.

## Vocabulary

Use the product terms already present in the docs and UI:

- `lịch học cố định` / fixed class schedule
- `lịch học bù` / makeup schedule event
- `buổi học` / session
- `gia sư chịu trách nhiệm` / responsible tutor
- `Google Calendar sync`

Do not introduce parallel vocabulary for these concepts unless a PRD or ADR explicitly changes the naming.
