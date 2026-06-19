# Landing integration API

Server-to-server endpoints that expose **public-safe identity fields** from UnicornsEduWeb5 for the `unicorns-edu-landing` CMS. The landing admin calls these endpoints on demand (populate/sync pattern); the public landing site reads from its own CMS database, not from EduWeb5 at render time.

## Purpose

| Endpoint | Used for |
|----------|----------|
| `GET /staff/landing-profiles` | Populate CMS **Instructor** records (name, avatar, academic background) |
| `GET /student/landing-profiles` | Populate CMS **StudentShowcase** records (name, school, province) |

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

Returns staff identity data suitable for the landing CMS instructor section.

### Request

```http
GET /staff/landing-profiles?role=teacher&status=active&limit=50 HTTP/1.1
Host: api.example.com
X-API-Key: your-landing-api-key
Accept: application/json
```

#### Query parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `role` | `StaffRole` | `teacher` | — | Filter staff whose `staff_info.roles` includes this role |
| `status` | `active` \| `inactive` | `active` | — | Filter by `staff_info.status` |
| `limit` | integer | `50` | `100` | Maximum number of records returned |

Allowed `role` values: `admin`, `teacher`, `lesson_plan`, `lesson_plan_head`, `accountant`, `accountant_income`, `accountant_expense`, `communication`, `technical`, `customer_care`, `training`, `assistant`.

### Response `200 OK`

```json
{
  "data": [
    {
      "id": "UNISTAFF-a1b2c3d4e5",
      "name": "Nguyễn Văn A",
      "avatarUrl": "https://your-project.supabase.co/storage/v1/object/sign/users/...",
      "avatarPath": "users/user-1/avatar",
      "university": "Đại học Bách Khoa TP.HCM",
      "specialization": "Toán THPT"
    },
    {
      "id": "UNISTAFF-f6e5d4c3b2",
      "name": "Trần Thị B",
      "avatarUrl": null,
      "avatarPath": null,
      "university": null,
      "specialization": "Vật lý"
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
| `avatarUrl` | string \| null | `users.avatar_path` | Time-limited signed URL, or `null` if no avatar |
| `avatarPath` | string \| null | `users.avatar_path` | Stable storage path in bucket `avatars`; CMS stores as `eduweb5://avatars/{path}` |
| `university` | string \| null | `staff_info.university` | |
| `specialization` | string \| null | `staff_info.specialization` | |

`total` is the count of items in `data` after filters and `limit` are applied.

### Example: all active teachers (default)

```bash
curl -sS \
  -H "X-API-Key: $LANDING_API_KEY" \
  "https://api.example.com/staff/landing-profiles"
```

### Example: inactive staff for audit

```bash
curl -sS \
  -H "X-API-Key: $LANDING_API_KEY" \
  "https://api.example.com/staff/landing-profiles?status=inactive&limit=10"
```

---

## `GET /student/landing-profiles`

Returns student identity fields for the landing CMS student showcase section.

### Request

```http
GET /student/landing-profiles?status=active&limit=100 HTTP/1.1
Host: api.example.com
X-API-Key: your-landing-api-key
Accept: application/json
```

#### Query parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `status` | `active` \| `inactive` | `active` | — | Filter by `student_info.status` |
| `limit` | integer | `100` | `500` | Maximum number of records returned |

### Response `200 OK`

```json
{
  "data": [
    {
      "id": "UNIST-a1b2c3d4e5",
      "name": "Lê Văn C",
      "school": "THPT Chuyên Lê Hồng Phong",
      "province": "TP. Hồ Chí Minh"
    },
    {
      "id": "UNIST-f6e5d4c3b2",
      "name": "Phạm Thị D",
      "school": null,
      "province": "Hà Nội"
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
| `school` | string \| null | `student_info.school` | |
| `province` | string \| null | `student_info.province` | |

### Example

```bash
curl -sS \
  -H "X-API-Key: $LANDING_API_KEY" \
  "https://api.example.com/student/landing-profiles?limit=200"
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

- Call these endpoints from the **landing CMS server** (Next.js server actions / route handlers), not from the browser.
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

| Setting | Value |
|---------|-------|
| Limit | **30 requests** per client IP |
| Window | **60 seconds** |

The global API throttle (`THROTTLE_DEFAULT_LIMIT`, default 300/min) still applies at the app level; landing routes add this tighter per-route cap to reduce scraping risk if the API key leaks.

When `TRUST_PROXY=1` (or an appropriate hop count) is set behind Nginx/Render/Fly, throttling uses the real client IP from `X-Forwarded-For`.

---

## Related documentation

- Landing CMS sync workflow: `unicorns-edu-landing/docs/eduweb5-sync.md`
- Class data public API (separate contract): `unicorns-edu-landing/docs/adr/0001-class-data-via-public-api.md`
