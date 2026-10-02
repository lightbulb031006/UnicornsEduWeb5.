---
status: accepted
date: 2026-08-11
---

# Landing public images: watermarked twins only (bake on EduWeb5 upload)

Landing (`laptrinh.uniedu.vn` / `unicorns-edu-landing`) must show staff/student avatars and achievement proof images **without exposing clean originals**. We bake a **diagonal-tile watermark** into a twin at EduWeb5 upload time, store a dedicated watermarked path, publish that twin via **stable public URL**, and make landing/CMS consume **only** those public URLs. Clean originals stay private for operational EduWeb5 UI.

## Context

- Landing sync today: `GET /staff/landing-profiles`, `GET /student/landing-profiles` (`docs/api/landing-integration.md`), API-key server-to-server populate into CMS.
- Achievements already expose `imagePath` / signed `imageUrl` from private bucket `achievements`; staff avatars use private `avatars` + signed URLs. Student landing profiles currently omit avatar (avatar lives on linked `users.avatar_path`).
- CSS overlay on the landing site is insufficient for anti-theft: anyone with the signed/public clean URL downloads an unmarked file.
- Requirement: when a user updates avatar or proof image on EduWeb5, the landing display updates without a separate CMS media re-copy workflow.

## Decision

1. **Goal = anti-theft (bake into pixels)** — not display-only overlay.
2. **Bake on EduWeb5 upload** (sync, mandatory): upload succeeds only if both clean original and watermarked twin are persisted. Use existing `sharp` on the API.
3. **Scope**: staff avatar, **student avatar** (landing parity with staff), and achievement **ảnh minh chứng** (staff + student).
4. **Landing contract**: landing endpoints return **only** watermarked public fields for images. Never return clean paths/URLs on landing profiles. Internal EduWeb5 APIs continue to serve clean signed URLs for admin/staff UI.
5. **Storage/DB**: dedicated columns for watermarked paths (e.g. `users.avatar_watermarked_path`, `staff_achievements.image_watermarked_path`, `student_achievements.image_watermarked_path`) — no path-convention guessing.
6. **Public vs private**: clean objects remain private; watermarked twins are stored so they have a **stable public URL** (public-read object or public bucket/prefix). Re-upload **overwrites** the same public path → CMS-stored URL stays valid and updates immediately.
7. **CMS stores stable public URL/path** (not a binary copy of the image). No webhook required for image bytes freshness; optional profile-field sync remains for name/school/etc.
8. **Watermark style**: diagonal tiled brand logo from `apps/api/src/storage/assets/watermark-logo.webp` (transparent WebP; bake preserves asset alpha — no luma keying that would erase black letter outlines). **No** mass regenerate when brand asset changes (twins keep old mark until the user re-uploads; run `scripts/backfill-watermarked-images.ts` or re-upload to refresh).
9. **Backfill**: one-shot job over existing avatars + proof images before (or as) landing switches to watermarked-only fields; missing twin → omit image (`null`), never fall back to clean.
10. **Student landing avatar**: add `avatarUrl` / `avatarPath` (watermarked public) mirroring staff shape, sourced from linked `users` watermarked path.

## Considered options (rejected)

| Topic | Rejected | Why |
|-------|----------|-----|
| Watermark at CMS sync only | Bake/copy on landing populate | Still needs clean fetch; easy to accidentally publish clean; weaker ownership of public asset |
| On-the-fly proxy stamp | Stamp per request | Latency/CPU; harder cache; originals still reachable if misconfigured |
| CSS/HTML overlay only | Client watermark | Trivial to bypass; fails anti-theft goal |
| Landing returns both clean + watermarked fields | Dual fields | CMS can pick the wrong field and leak clean URLs |
| Path convention without DB columns (`*.wm.jpg`) | No watermarked path column | Silent drift if twin missing; unsafe fallbacks |
| Best-effort stamp (upload OK without twin) | Soft fail | Breaks anti-theft invariant |
| Async queue for twin | Upload returns before twin ready | Allowed only if landing never sees clean; chosen sync mandatory for simpler invariant |
| CMS copies binary media | Duplicate storage | Requires push/poll to stay fresh; user wanted overwrite-stable public URL instead |
| Browser calls EduWeb5 with API key | Client integration | Forbidden; key must never ship in landing bundle |
| Regenerate all twins on brand change | Batch rewrite | Explicitly deferred; re-upload only |

## Consequences

- **Schema/migration**: add watermarked path columns; backfill job + storage public policy for twin objects only.
- **Upload pipelines**: avatar upload and achievement image upload must run stamp+upload twin in the same success path; delete/replace must overwrite or remove both objects.
- **Landing API breaking change** for image fields: `avatarUrl`/`avatarPath` and `achievements[].imageUrl`/`imagePath` on landing profiles mean **watermarked public** assets. Document clearly in `docs/api/landing-integration.md`. Prefer keeping field names and changing semantics + docs over dual fields.
- **CMS (`unicorns-edu-landing`)**: store stable public URLs; stop embedding EduWeb5 signed clean URLs; add student avatar fields; re-populate once after backfill.
- **Security**: public twins are intentionally downloadable (with watermark). Clean buckets/policies must deny public read. Landing must not log or proxy clean signed URLs to the browser.
- **Ops**: create/configure public access only for watermarked objects; ensure production bucket `achievements` (and avatars) policies match; run backfill before flipping CMS.
- **Non-goals**: mutating clean originals; watermarking non-landing assets; automatic brand-wide twin regenerate.

## Implementation sketch (non-normative)

1. Migration: watermarked path columns (nullable until backfill).
2. Shared stamp helper (`sharp` + logo asset under API-accessible path).
3. Hook avatar + achievement upload/replace/delete.
4. Public URL builder for watermarked paths; landing `getLandingProfiles` maps only those.
5. Student landing select `user.avatar*` watermarked fields.
6. Backfill script; then CMS sync + docs.

## References

- Contract today: `docs/api/landing-integration.md`
- Achievements model: `docs/adr/2026-08-11-achievement-*.md`, `CONTEXT.md` (Thành tích / Ảnh minh chứng)
- Prior session handoff (achievements + landing achievements array): `thoughts/shared/handoffs/general/2026-08-11_04-54-00_achievements-landing-integration.md`
