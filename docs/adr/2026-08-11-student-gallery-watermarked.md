---
status: accepted
date: 2026-08-11
---

# Student landing gallery (watermarked photos)

## Context

Landing/CMS needs a multi-image student gallery (images only — no captions in product UI), separate from achievements. Images must follow the same anti-theft bake pattern as avatars and achievement proofs (`docs/adr/2026-08-11-landing-watermarked-public-images.md`).

Student avatar for landing remains on the linked `users` row (`avatar_watermarked_path`); admin can upload via `POST /student/:id/avatar`.

## Decision

1. New table `student_gallery_items`: nullable unused `caption` (kept for compatibility; product UI does not edit it), private `image_path`, public twin `image_watermarked_path`, `sort_order`.
2. Dedicated buckets `student-gallery` (private) + `student-gallery-public` (public watermarked twins).
3. Admin-only CRUD under `/student/:studentId/gallery` (same staff role allowances as student achievements). FE: upload/display/reorder/delete images only.
4. `GET /student/landing-profiles` returns `gallery[]` with watermarked public URLs only.
5. No student self-service gallery in this scope.

## Consequences

- Ops must create the two Supabase buckets before upload works in each environment.
- CMS must store public gallery URLs (not clean signed URLs).
- Empty gallery at launch; no backfill required.
