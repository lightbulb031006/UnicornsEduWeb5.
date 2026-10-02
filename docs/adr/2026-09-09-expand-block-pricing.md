# ADR: Chuyển đơn giá trợ cấp/học phí sang block 30 phút (bước expand)

- **Status:** Accepted
- **Date:** 2026-09-09
- **Ticket:** #134

## Context

Đơn giá trợ cấp và học phí đang lưu **theo buổi**. Các lớp có lịch 60 phút và 90 phút dùng cùng một cột “mỗi buổi”, nên buổi dài hơn bị trả/thu như buổi ngắn nếu không nhân thời lượng. Bước tiếp theo của hệ thống là tính theo **block 30 phút**, nhưng payroll hiện tại (snapshot buổi, SQL aggregate, gói học phí) vẫn đọc cột theo buổi.

Không thể đổi công thức payroll trong cùng một bước với việc đổi đơn vị lưu trữ: `class_teachers.custom_allowance` không có cột song song, và `scale_amount` / gói học phí / `coefficient` phải giữ nguyên.

## Decision

Áp dụng expand-contract:

1. **Thêm cột song song** (nullable `INTEGER` VNĐ): `classes.allowance_per_block_per_student`, `classes.max_allowance_per_block`, `classes.student_tuition_per_block`, `student_classes.custom_tuition_per_block`.
2. **Backfill** `giá_mới = ROUND(giá_cũ / số_block_chuẩn)` khi lớp suy được số block chuẩn; lớp không suy được → để `null`.
3. **`class_teachers.custom_allowance` giữ tên**, backfill cùng công thức (đổi đơn vị lưu thành mỗi block). API/UI vẫn nói **mỗi buổi**: ghi vào thì chia theo số block chuẩn, đọc ra thì nhân lại. Snapshot trợ cấp buổi reconstruct per-session trước khi payroll.
4. **`sessions.snapshot_block_count`**: chốt số block lúc tạo buổi (từ `start`/`end`, fallback lịch lớp). Không suy lại từ giờ buổi khi đọc payroll lịch sử.
5. **Không đổi** `scale_amount`, `tuition_package_*`, `coefficient`. Charge học phí buổi **bán lẻ (không gói)** từ ticket #136 đọc `student_tuition_per_block` / `custom_tuition_per_block` × `sessions.snapshot_block_count`; nhánh gói vẫn theo buổi. Trợ cấp gia sư payroll vẫn đọc cột per-session (reconstruct) trong bước expand.
6. **Dual-write**: mọi đường ghi đơn giá theo buổi ghi thêm cột per-block.
7. Lớp thiếu số block chuẩn: `GET /class/missing-standard-blocks` và script `apps/api/scripts/list-classes-missing-standard-blocks.ts`.

Số block chuẩn = `to − from` của mọi `class_schedule_entries` đang active (`effective_to IS NULL`), mỗi khung giờ phải là một bội số 30 phút dương. **Các khung giờ không cần dài bằng nhau**: số block chuẩn là **GCD** số block của mọi khung giờ active. Lịch đồng nhất vẫn ra đúng số block của chính nó (GCD của các số bằng nhau là chính nó), nên hành vi cũ giữ nguyên. Chỉ khi lớp không có khung giờ active, hoặc có khung giờ không chia hết 30 phút → không suy được (`null`).

Số block chuẩn **chỉ là đơn vị quy đổi hiển thị** giữa giá / buổi và giá / 30 phút. Tiền thực tế không phụ thuộc nó: mỗi buổi chốt `sessions.snapshot_block_count` từ `start_time`/`end_time` của chính buổi đó, nên buổi dài ngắn khác nhau vẫn tính đúng. Vòng ghi FE nhân số block chuẩn rồi BE chia lại cùng số đó là **bất biến** — giá trị của K không ảnh hưởng số tiền per-block lưu xuống.

Làm tròn `ROUND` tới 1đ. Với lớp 1–3 block (30–90 phút), `giá_mới × số_block` lệch tối đa 1đ so với giá cũ.

## Considered options

- Đổi payroll sang `đơn_giá_block × số_block` ngay trong ticket này — phá invariant “không đổi số tiền” nếu sót một SQL aggregate.
- Thêm cột `custom_allowance_per_block` song song — lệch với quyết định giữ tên cột override gia sư.
- Lấy số block từ buổi học động thay vì snapshot — payroll tháng cũ sẽ đổi khi admin sửa giờ buổi.

## Consequences

- Ticket #136 đã chuyển **charge học phí học sinh không gói** sang per-block × `snapshot_block_count` **vô điều kiện** — ticket #139 đảo thành **opt-in theo lớp** (`classes.pricing_mode`, mặc định `per_session`). Lớp theo buổi không đọc cột block khi charge.
- **Contract expand-contract bị huỷ một phần:** ticket #138 (xoá cột `*_per_session`) đã bị huỷ. Cột per-session sống vĩnh viễn; per-block là cột song song cho lớp bật chế độ theo block.
- Ticket sau (#135) đã đổi công thức payroll trợ cấp/SQL sang cột per-block × `snapshot_block_count` **chỉ khi** lớp `pricing_mode = per_block`. Lớp theo buổi giữ nguyên `max_allowance_per_session` và công thức per-session.
- Admin phải nhập tay các lớp trong `GET /class/missing-standard-blocks` trước khi bật chế độ theo block.
