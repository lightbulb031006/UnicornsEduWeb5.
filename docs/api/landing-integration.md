# Landing integration API

Server-to-server endpoints that expose **public-safe identity fields** from UnicornsEduWeb5 for the `unicorns-edu-landing` site.

**Architecture (live-read):** EduWeb5 is source of truth for people identity, achievements, gallery, and instructor highlights. The landing CMS stores only **publish gates** (`sourceId` + `PublishStatus` + sort/focal). The public landing site reads published `sourceId`s from CMS, then fetches live people data from these endpoints (short cache ~5–10s). Courses/posts stay CMS-only and do not depend on EduWeb5 availability.

## Purpose

| Endpoint | Used for |
|----------|----------|
| `GET /staff/landing-profiles` | CMS browse + public instructor cards. Supports `page`, `limit`, `search`, `ids`. |
| `GET /student/landing-profiles` | CMS browse + public showcase/gallery/featured identity. Supports `page`, `limit`, `search`, `ids`. |
| `GET /student/landing-achievements` | Public `/thanh-tich` + homepage marquee. Flat achievements filtered by CMS published `sourceIds`. |

Operational staff/student APIs under `/staff` and `/student` require cookie auth and RBAC. These landing endpoints are separate: they skip JWT, use a shared API key, and return only fields safe for marketing use.

## Authentication

All landing endpoints require a static API key in the request header:

| Header | Value |
|--------|-------|
| `X-API-Key` | Same secret as `LANDING_API_KEY` on the UnicornsEduWeb5 API server |

### Server configuration

Set in `apps/api/.env` (see `apps/api/.env.example`):

```bash
# Shared secret with unicorns-edu-landing admin (EDUWEB5_API_KEY must match)
LANDING_API_KEY="generate-a-long-random-string"
```

Generate a strong key, for example:

```bash
openssl rand -hex 32
```

The landing CMS stores the same value as `EDUWEB5_API_KEY` and sends it on every server-side request. **Never** expose this key in browser code, public env vars, or the landing frontend bundle.

### Validation behaviour

- Missing `X-API-Key` header → `401 Unauthorized`
- Missing or empty `LANDING_API_KEY` env on the server → `401 Unauthorized`
- Wrong key → `401 Unauthorized` (compared with `crypto.timingSafeEqual`)

JWT cookies are **not** required. Endpoints are marked `@Public()` and protected only by `ApiKeyGuard`.

---

## `GET /staff/landing-profiles`

Returns staff identity data suitable for landing instructor sections.
Includes ordered **achievements** (titles + optional proof images). `specialization` remains for backward compatibility but is deprecated.

**No `status` or `role` filter** — returns all `staff_info` rows (active + inactive, every role). CMS publish gates select which appear publicly.

### Request

```http
GET /staff/landing-profiles?limit=50 HTTP/1.1
Host: api.example.com
X-API-Key: your-landing-api-key
Accept: application/json
```

#### Query parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `search` | string | — | — | Case-insensitive name search (tokenized first/last name) |
| `ids` | string | — | — | Comma-separated staff ids (`UNISTAFF-…`). When set, only those profiles are returned. Still paginated by `page`/`limit` — loop pages if more than `limit` ids are passed |
| `page` | integer | `1` | — | 1-based page index |
| `limit` | integer | `50` | `100` | Page size |

### Response `200 OK`

```json
{
  "data": [
    {
      "id": "UNISTAFF-a1b2c3d4e5",
      "name": "Nguyễn Văn A",
      "status": "active",
      "avatarUrl": "https://your-project.supabase.co/storage/v1/object/public/avatars-public/users/user-1/avatar.jpg",
      "avatarPath": "users/user-1/avatar.jpg",
      "university": "Đại học Bách Khoa TP.HCM",
      "specialization": "Toán THPT",
      "achievements": [
        {
          "id": "ach-uuid-1",
          "title": "HCV Olympic Tin học 2024",
          "imageUrl": "https://your-project.supabase.co/storage/v1/object/public/achievements-public/staff/UNISTAFF-a1b2c3d4e5/ach-uuid-1.jpg",
          "imagePath": "staff/UNISTAFF-a1b2c3d4e5/ach-uuid-1.jpg",
          "sortOrder": 0
        },
        {
          "id": "ach-uuid-2",
          "title": "Giải Nhì HSG tỉnh",
          "imageUrl": null,
          "imagePath": null,
          "sortOrder": 1
        }
      ]
    },
    {
      "id": "UNISTAFF-f6e5d4c3b2",
      "name": "Trần Thị B",
      "avatarUrl": null,
      "avatarPath": null,
      "university": null,
      "specialization": "Vật lý",
      "achievements": []
    }
  ],
  "total": 2
}
```

#### Response fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | string | `staff_info.id` | Stable id (`UNISTAFF-…`); stored as CMS `sourceId` |
| `name` | string | Linked `users` name | Resolved via `getPreferredUserFullName` |
| `status` | `active` \| `inactive` | `staff_info.status` | Included for CMS labels; endpoint does **not** filter by status |
| `avatarUrl` | string \| null | public twin | Public URL from bucket `avatars-public` (watermarked). `null` if no twin. |
| `avatarPath` | string \| null | `users.avatar_watermarked_path` | Stable path; CMS may store as `eduweb5://avatars-public/{path}` |
| `university` | string \| null | `staff_info.university` | |
| `specialization` | string \| null | `staff_info.specialization` | **Deprecated** legacy blob. Prefer `achievements`. Kept temporarily for CMS backward compatibility. |
| `achievements` | array | `staff_achievements` | Ordered by `sortOrder` asc (then `createdAt`). Public-safe titles + optional watermarked proof images. |
| `achievements[].id` | string | `staff_achievements.id` | Stable achievement id |
| `achievements[].title` | string | `staff_achievements.title` | Display title |
| `achievements[].imageUrl` | string \| null | public twin | Public URL from `achievements-public`; `null` if no twin |
| `achievements[].imagePath` | string \| null | `image_watermarked_path` | Stable path in `achievements-public` |
| `achievements[].sortOrder` | number | `staff_achievements.sort_order` | Display order (0 first) |

`total` is the **full filtered count** (before pagination). Prefer `ids=` for public hydrate of published instructors; use search/paging for CMS browse. **`ids=` is capped by `limit` like every other mode (max 100 rows per call)** — if the published roster exceeds `limit`, loop `page` until `data.length * page >= total`, same as the default browse mode.

### Example: all staff (default)

```bash
curl -sS \
  -H "X-API-Key: $LANDING_API_KEY" \
  "https://api.example.com/staff/landing-profiles"
```

### Example: name search

```bash
curl -sS \
  -H "X-API-Key: $LANDING_API_KEY" \
  "https://api.example.com/staff/landing-profiles?search=Nguyen&limit=10"
```

### Example: hydrate by ids

```bash
curl -sS \
  -H "X-API-Key: $LANDING_API_KEY" \
  "https://api.example.com/staff/landing-profiles?ids=UNISTAFF-a1b2c3d4e5,UNISTAFF-f6e5d4c3b2"
```

---

## `GET /student/landing-profiles`

Returns student identity fields for showcase / gallery / featured cards.

**No `status` filter** — returns all `student_info` rows (active + inactive). CMS publish gates select which appear publicly.

### Request

```http
GET /student/landing-profiles?limit=100 HTTP/1.1
Host: api.example.com
X-API-Key: your-landing-api-key
Accept: application/json
```

#### Query parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `search` | string | — | — | Case-insensitive tokenized `fullName` search (whitespace tokens AND, max 5) |
| `ids` | string | — | — | Comma-separated student ids (`UNIST-…`). When set, only those profiles are returned. Still paginated by `page`/`limit` — loop pages if more than `limit` ids are passed |
| `page` | integer | `1` | — | 1-based page index |
| `limit` | integer | `50` | `100` | Page size |

### Response `200 OK`

```json
{
  "data": [
    {
      "id": "UNIST-a1b2c3d4e5",
      "name": "Lê Văn C",
      "status": "inactive",
      "avatarUrl": "https://your-project.supabase.co/storage/v1/object/public/avatars-public/users/user-s/avatar.jpg",
      "avatarPath": "users/user-s/avatar.jpg",
      "school": "THPT Chuyên Lê Hồng Phong",
      "province": "TP. Hồ Chí Minh",
      "achievements": [
        {
          "id": "sach-uuid-1",
          "award": "HCV",
          "exam": "Tin học trẻ",
          "year": 2024,
          "level": "NATIONAL",
          "courseLabel": "KHỐI THPT",
          "title": "HCV · Tin học trẻ",
          "imageUrl": "https://your-project.supabase.co/storage/v1/object/public/achievements-public/student/UNIST-a1b2c3d4e5/sach-uuid-1.jpg",
          "imagePath": "student/UNIST-a1b2c3d4e5/sach-uuid-1.jpg",
          "sortOrder": 0
        }
      ],
      "gallery": [
        {
          "id": "gal-uuid-1",
          "caption": null,
          "imageUrl": "https://your-project.supabase.co/storage/v1/object/public/student-gallery-public/student/UNIST-a1b2c3d4e5/gal-uuid-1.jpg",
          "imagePath": "student/UNIST-a1b2c3d4e5/gal-uuid-1.jpg",
          "sortOrder": 0
        }
      ]
    },
    {
      "id": "UNIST-f6e5d4c3b2",
      "name": "Phạm Thị D",
      "avatarUrl": null,
      "avatarPath": null,
      "school": null,
      "province": "Hà Nội",
      "achievements": [],
      "gallery": []
    }
  ],
  "total": 2
}
```

#### Response fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | string | `student_info.id` | Stable id (`UNIST-…`); stored as CMS `sourceId` |
| `name` | string | `student_info.full_name` | Display name |
| `status` | `active` \| `inactive` | `student_info.status` | `inactive` = đã nghỉ học; endpoint does **not** filter by status |
| `avatarUrl` | string \| null | public twin | Same semantics as staff (bucket `avatars-public`) |
| `avatarPath` | string \| null | `users.avatar_watermarked_path` | Via linked user; `null` if no linked user / no twin |
| `school` | string \| null | `student_info.school` | |
| `province` | string \| null | `student_info.province` | |
| `achievements` | array | `student_achievements` | Ordered by `sortOrder` asc. Admin-managed in EduWeb5; no student self-service. Structured fields for `/thanh-tich`. |
| `achievements[].id` | string | `student_achievements.id` | |
| `achievements[].award` | string | `student_achievements.award` | Prize label (e.g. Giải Khuyến khích) |
| `achievements[].exam` | string | `student_achievements.exam` | Competition name |
| `achievements[].year` | number | `student_achievements.year` | |
| `achievements[].level` | enum | `student_achievements.level` | `COMMUNE` \| `PROVINCE` \| `REGIONAL` \| `NATIONAL` \| `INTERNATIONAL` \| `ADMISSION` |
| `achievements[].courseLabel` | string \| null | `course_label` | Optional landing course band label |
| `achievements[].title` | string | derived | `${award} · ${exam}` for short-term CMS title consumers |
| `achievements[].imageUrl` | string \| null | public twin | From `achievements-public`; `null` if no twin |
| `achievements[].imagePath` | string \| null | `image_watermarked_path` | |
| `achievements[].sortOrder` | number | `student_achievements.sort_order` | |
| `gallery` | array | `student_gallery_items` | Ordered by `sortOrder` asc. Admin-managed; **images only** (no caption UI). |
| `gallery[].id` | string | `student_gallery_items.id` | |
| `gallery[].caption` | string \| null | `student_gallery_items.caption` | Unused in product UI; typically `null`. Kept for schema compatibility. |
| `gallery[].imageUrl` | string \| null | public twin | From `student-gallery-public`; `null` if no twin |
| `gallery[].imagePath` | string \| null | `image_watermarked_path` | |
| `gallery[].sortOrder` | number | `student_gallery_items.sort_order` | |

`total` is the **full filtered count** (before pagination), same semantics as staff landing-profiles. **`ids=` is capped by `limit` (max 100 rows per call)** — if the published roster exceeds `limit`, loop `page` to fetch the rest; `ids=` no longer silently truncates to the first 100 matches regardless of `page`.

### Live-read notes (achievements + gallery)

- Public landing hydrates people via `ids=` / `landing-achievements` + CMS published gates — **not** a CMS copy of achievement rows.
- Prefer watermarked public image URLs/paths (ADR `docs/adr/2026-08-11-landing-watermarked-public-images.md`, gallery ADR `docs/adr/2026-08-11-student-gallery-watermarked.md`). Do **not** embed EduWeb5 signed URLs of clean originals on the public site.
- Empty `achievements: []` / `gallery: []` is valid.
- Clean originals stay private in `achievements` / `avatars` / `student-gallery`. Landing consumes twins from public buckets **`achievements-public`** / **`avatars-public`** / **`student-gallery-public`**.
- **Contract (implemented):** landing `avatarUrl`/`avatarPath`, `achievements[].imageUrl`/`imagePath`, and `gallery[].imageUrl`/`imagePath` are watermarked **public** assets. Missing twin → `null` (never fall back to clean).
- Ops: create public buckets (`avatars-public`, `achievements-public`, `student-gallery-public`) + private `student-gallery`; run avatar/achievement backfill after migrate when needed (`cd apps/api && pnpm dlx tsx scripts/backfill-watermarked-images.ts`).

### Example

```bash
curl -sS \
  -H "X-API-Key: $LANDING_API_KEY" \
  "https://api.example.com/student/landing-profiles?page=1&limit=50"
```

### Example: hydrate published students

```bash
curl -sS \
  -H "X-API-Key: $LANDING_API_KEY" \
  "https://api.example.com/student/landing-profiles?ids=UNIST-a1b2c3d4e5,UNIST-f6e5d4c3b2"
```

---

## `GET /student/landing-achievements`

Flat achievement list for public `/thanh-tich` and homepage marquee.

- **Default (gated):** pass CMS published student `sourceIds`; empty/missing `sourceIds` returns `{ data: [], total: 0 }` (no roster leak). Use for publish-gated surfaces, e.g. **"Tự Hào Unicorns"** homepage showcase.
- **`includeUnpublished=true` (ungated):** ignores `sourceIds`/publish gate entirely, returns achievements for **all** students. Use for the `/thanh-tich` by-level browse list, which is meant to show every achievement regardless of CMS publish status. `sourceIds` is ignored when this flag is set.

### Request

```http
GET /student/landing-achievements?sourceIds=UNIST-a,UNIST-b&level=NATIONAL&page=1&limit=9 HTTP/1.1
Host: api.example.com
X-API-Key: your-landing-api-key
Accept: application/json
```

#### Query parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `sourceIds` | string | — | — | Comma-separated published student ids (`UNIST-…`). Required unless `includeUnpublished=true`; empty/missing → empty page |
| `includeUnpublished` | boolean | `false` | — | `true` → ignore `sourceIds`/publish gate, return achievements for all students (level-list surface) |
| `level` | enum | — | — | Optional filter: `COMMUNE` \| `PROVINCE` \| `REGIONAL` \| `NATIONAL` \| `INTERNATIONAL` \| `ADMISSION` |
| `page` | integer | `1` | — | 1-based page index |
| `limit` | integer | `9` | `100` | Page size (`/thanh-tich` uses 9) |

### Response `200 OK`

```json
{
  "data": [
    {
      "id": "sach-uuid-1",
      "award": "Giải Khuyến khích",
      "exam": "HSG Quốc gia",
      "year": 2025,
      "level": "NATIONAL",
      "courseLabel": "KHỐI THPT",
      "title": "Giải Khuyến khích · HSG Quốc gia",
      "imageUrl": null,
      "imagePath": null,
      "sortOrder": 0,
      "student": {
        "id": "UNIST-a1b2c3d4e5",
        "name": "Nguyễn Văn A",
        "school": "THPT Chuyên Vĩnh Phúc",
        "province": "Vĩnh Phúc",
        "avatarUrl": "https://…/avatars-public/users/…/avatar.jpg",
        "avatarPath": "users/…/avatar.jpg"
      }
    }
  ],
  "total": 42
}
```

Order: `year` desc, then `sortOrder` asc, then `id` asc. `total` is the count after `sourceIds` + optional `level` filter.

### Example

```bash
curl -sS \
  -H "X-API-Key: $LANDING_API_KEY" \
  "https://api.example.com/student/landing-achievements?sourceIds=UNIST-a1b2c3d4e5&limit=9"
```

### Example: full by-level list (ungated, /thanh-tich browse)

```bash
curl -sS \
  -H "X-API-Key: $LANDING_API_KEY" \
  "https://api.example.com/student/landing-achievements?includeUnpublished=true&level=NATIONAL&page=1&limit=9"
```

---

## Error responses

| Status | When |
|--------|------|
| `401 Unauthorized` | Missing, invalid, or mismatched `X-API-Key` |
| `429 Too Many Requests` | Per-endpoint throttle exceeded (see below) |
| `400 Bad Request` | Invalid query parameter (e.g. `limit` out of range) |

Error body follows the standard NestJS validation/error format used elsewhere in the API.

---

## Security notes

### Server-to-server only

- Call these endpoints from the **landing CMS / public landing server** (Next.js server actions / route handlers), not from the browser.
- Do not add `X-API-Key` to client-side fetch, Vite public env, or `NEXT_PUBLIC_*` variables.
- CORS is not required for this integration pattern because the browser never calls EduWeb5 directly.

### Fields intentionally excluded

These endpoints must **never** return sensitive operational data, including but not limited to:

- Email, phone, parent contact (`parent_name`, `parent_phone`, `parent_email`)
- CCCD / identity documents, address, gender, birth date
- Bank account, QR payment links, wallet balance, income, bonuses
- Google Meet links, internal notes, attendance, session history
- Passwords, JWT tokens, or internal user ids beyond the public entity id

If a new field is needed for marketing, add it explicitly to the landing DTO and review it for PII before exposing.

### Key rotation

1. Generate a new key and set `LANDING_API_KEY` on UnicornsEduWeb5.
2. Update `EDUWEB5_API_KEY` on the landing admin deployment to the same value.
3. Redeploy both services. Old key stops working immediately after EduWeb5 restarts with the new value.

---

## Rate limiting

Landing profile endpoints use `@nestjs/throttler` with a **stricter limit than the global default**:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `landing-profiles` | **30** requests per client IP | 60 seconds |
| `landing-achievements` | **60** requests per client IP | 60 seconds |

The global API throttle (`THROTTLE_DEFAULT_LIMIT`, default 300/min) still applies at the app level; landing routes add this tighter per-route cap to reduce scraping risk if the API key leaks.

When `TRUST_PROXY=1` (or an appropriate hop count) is set behind Nginx/Render/Fly, throttling uses the real client IP from `X-Forwarded-For`.

---

## Related documentation

- Landing live-read / publish gates: `unicorns-edu-landing/docs/eduweb5-sync.md`
- Class data public API (separate contract): `unicorns-edu-landing/docs/adr/0001-class-data-via-public-api.md`
