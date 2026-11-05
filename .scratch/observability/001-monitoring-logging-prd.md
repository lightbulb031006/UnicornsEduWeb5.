# PRD: Monitoring & Logging cho Backend NestJS

Labels: needs-triage

## Problem Statement

Backend NestJS hiện chưa có observability tập trung đủ để vận hành production chủ động. Log runtime chủ yếu là text/unstructured, khó lọc theo request khi điều tra lỗi. Đội vận hành cũng thiếu metrics về sức khỏe API, latency, error rate, CPU/RAM container và không có cảnh báo tự động khi lỗi 5xx hoặc tài nguyên tăng bất thường.

Điều này làm việc xử lý sự cố phụ thuộc vào kiểm tra thủ công trên VPS, chậm khi cần truy vết một request cụ thể hoặc xác định route nào đang chậm.

## Solution

Triển khai một observability stack self-host theo kiến trúc Docker Compose hiện tại của repo:

- Backend NestJS xuất structured JSON logs bằng Pino ra Docker stdout.
- Backend expose `/metrics` nội bộ cho Prometheus, gồm Node.js metrics và HTTP RED metrics.
- Alloy thu log container từ Docker stdout và gửi vào Loki.
- Prometheus scrape backend metrics và cAdvisor container metrics.
- Grafana hiển thị dashboard, log explorer và alert rules; Grafana chỉ truy cập qua local/VPN.
- Alert mặc định gửi Telegram khi 5xx ratio hoặc CPU/RAM container vượt ngưỡng.

Người vận hành có thể tra cứu log theo request correlation id, xem latency/error trend, và nhận cảnh báo trước khi sự cố kéo dài.

## User Stories

1. As a backend operator, I want API logs to be structured JSON, so that I can search and filter production incidents quickly.
2. As a backend operator, I want every HTTP request log to include a request correlation id, so that I can follow the lifecycle of one request.
3. As a backend operator, I want the API to preserve an incoming `x-request-id` when valid, so that logs can be correlated across proxy/client boundaries.
4. As a backend operator, I want the API to generate a request id when the caller does not provide one, so that every request remains traceable.
5. As a backend operator, I want the response to include `x-request-id`, so that users and support can report a traceable id.
6. As a developer, I want readable logs in local development, so that debugging remains comfortable without compromising production log format.
7. As a security-conscious maintainer, I want sensitive fields redacted from logs, so that passwords, tokens, cookies, OTPs, and card-like data do not leak into Loki.
8. As a security-conscious maintainer, I do not want user identity in request logs by default, so that log search does not create unnecessary PII exposure.
9. As a backend operator, I want `/metrics` to expose Node.js process metrics, so that I can see heap, event loop, CPU, and active handle signals.
10. As a backend operator, I want HTTP rate metrics by method, route, and status, so that I can detect traffic spikes and error patterns.
11. As a backend operator, I want HTTP latency histograms, so that Grafana can show p50, p95, and p99 response time.
12. As a backend operator, I want route labels to be normalized, so that metrics do not explode in cardinality from raw ids or query strings.
13. As a DevOps maintainer, I want Prometheus to scrape `/metrics` over the internal Docker network, so that metrics are available without exposing them publicly.
14. As a DevOps maintainer, I want public Nginx access to `/api/metrics` blocked, so that the internal metrics endpoint cannot be scraped by internet users.
15. As a DevOps maintainer, I want logs collected from Docker stdout, so that the app does not need file logging, file rotation, or writable log volumes.
16. As a DevOps maintainer, I want Alloy instead of Promtail, so that the stack uses Grafana's supported log collector after Promtail EOL.
17. As a DevOps maintainer, I want cAdvisor metrics, so that CPU and RAM alerts reflect container resource usage rather than only Node.js process stats.
18. As a DevOps maintainer, I want Prometheus retention set to 15 days, so that metric storage remains bounded on the VPS.
19. As a DevOps maintainer, I want Loki retention set to 7 days, so that log storage remains bounded on the VPS.
20. As a backend operator, I want a System Health dashboard, so that I can see API traffic, error rate, latency, CPU, and RAM in one place.
21. As a backend operator, I want a Log Explorer dashboard, so that I can filter by level, context, and request id.
22. As a backend operator, I want an alert when 5xx ratio exceeds 5% for 2 minutes, so that I know when users are likely seeing failures.
23. As a backend operator, I want alerts when API container CPU or RAM exceeds 85% for 5 minutes, so that I can react before the service degrades further.
24. As a tech team member, I want alerts delivered to Telegram, so that incident signals land in the shared operations channel.
25. As a maintainer, I want Grafana datasources, dashboards, and alerts provisioned as code, so that observability config survives redeploys and is reviewable.
26. As a maintainer, I want Grafana reachable only through local/VPN access, so that internal logs and metrics are not exposed publicly.
27. As a maintainer, I want documentation and an ADR for this observability stack, so that future agents understand why this design was chosen.

## Implementation Decisions

- Build the full v1 stack in one implementation: backend logging, backend metrics, Docker Compose observability services, Grafana provisioning, alerting, docs, and ADR.
- Use self-hosted Docker Compose on the existing VPS instead of Grafana Cloud or Kubernetes.
- Use Grafana Alloy for log collection because Promtail is end-of-life.
- Collect logs from Docker stdout, not app log files.
- Keep Grafana private: bind to local/private access and do not publish it through public Nginx.
- Provision Grafana datasources, dashboards, and alert rules as code.
- Use Telegram as the default alert channel.
- Add cAdvisor for container CPU/RAM metrics.
- Treat `req.id` as a request correlation id, not an OpenTelemetry trace id.
- Preserve valid incoming `x-request-id`; otherwise generate a UUID and return it in the response header.
- Only HTTP/request-scoped logs need `req.id`; startup and background logs may omit `req`.
- Do not include user identity in request logs for v1.
- Add a backend logging module/config that centralizes Pino options: environment-based pretty printing, production JSON format, string log levels, request id generation, and redaction.
- Add a backend metrics module that owns the Prometheus registry, default metrics collection, HTTP counters/histograms, and `/metrics` response behavior.
- Add HTTP instrumentation at the framework boundary so business modules do not manually record common request metrics.
- Use normalized route labels for metrics to avoid high-cardinality labels from raw ids, query strings, or arbitrary URLs.
- Keep `/metrics` public to Nest guards only for Prometheus scraping, but block public `/api/metrics` at Nginx because Nginx currently strips `/api/*` before proxying to the API root.
- Add or update deployment docs so operators know how to configure Telegram secrets, run the stack, access Grafana, and validate retention.
- Create an ADR because the stack choice is hard enough to reverse, surprising without context, and involves real trade-offs between self-hosting, Grafana Cloud, Promtail, and Alloy.

## Testing Decisions

- Tests should verify external behavior and contracts rather than internal logger implementation details.
- Backend tests should cover request id behavior: preserve valid incoming `x-request-id`, generate one when absent, and return the response header.
- Backend tests should cover metrics behavior: `/metrics` returns Prometheus text format and includes expected Node.js and HTTP metric families.
- Backend tests should cover redaction by logging representative sensitive fields and asserting sensitive values do not appear in emitted output.
- Backend tests should cover route normalization indirectly by exercising parameterized routes and confirming metrics do not use raw ids.
- Infra validation should include Docker Compose config validation and a stack smoke test on a test VPS/local Docker environment.
- Nginx validation should confirm public `/api/metrics` is blocked while Prometheus can scrape `api:4000/metrics` internally.
- Grafana validation should confirm datasource provisioning, dashboard provisioning, and alert rule provisioning after container recreation.
- Alert testing should simulate repeated HTTP 500 responses for more than 2 minutes and confirm a Telegram notification is delivered.
- Prior art: use existing Jest/Nest testing patterns in the backend test suite and existing deploy smoke-test style from the Docker Compose deployment workflow.

## Out of Scope

- OpenTelemetry distributed tracing.
- Span/exporter setup for traces.
- Grafana Cloud or any managed observability provider.
- Kubernetes manifests.
- Public Grafana access through Nginx.
- File-based application logs and log rotation.
- User identity enrichment in logs.
- S3/archive storage for old Loki logs.
- Frontend/browser monitoring.
- Database query performance tracing beyond what is visible through API latency and logs.

## Further Notes

- The original PRD wording called `req.id` a Trace ID. For v1, the precise term is request correlation id.
- The original PRD mentioned Promtail as an option. The chosen implementation should use Alloy because Promtail has reached EOL.
- Because Nginx strips `/api/*` before proxying to the API, adding `/metrics` to the API would otherwise make it reachable at public `/api/metrics`; this must be explicitly denied.
- `CONTEXT.md` does not need an observability glossary entry because these are technical operations terms, not domain language used by UniEdu staff.
