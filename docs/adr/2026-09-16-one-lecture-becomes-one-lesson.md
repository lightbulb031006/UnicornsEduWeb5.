# ADR: Mỗi Bài học cũ thành một Tiết học — chấp nhận số mục nội dung lớp nhân lên

- **Status:** Accepted
- **Date:** 2026-09-16
- **Related:** `docs/adr/2026-09-15-three-level-content-model.md`

## Context

Trên `dev` trước đợt đổi tên, lớp gắn `ClassContentItem` vào **topic** (chuyên đề cũ). Một chuyên đề lý thuyết ba bài học (`lectures`) hiện **một** mục trên danh sách nội dung lớp và timeline. Biên bản 13/09/2026 chốt: mỗi Bài học cũ thành **một** Tiết lý thuyết riêng, không gộp.

Hệ quả không hiển nhiên: lớp đã giao một chuyên đề N bài sẽ có N mục nội dung + N mục timeline sau migrate. Người đọc tương lai sẽ hỏi vì sao một chuyên đề ba bài lại thành ba dòng trên timeline lớp thay vì một.

## Decision

Mỗi row `lectures` backfill thành **một** `lessons` (`kind = theory`), giữ id. Lớp đã giao topic lý thuyết N bài → N `class_content_items` + N `class_timeline_items`. Item gốc (seq = 1) giữ attempts và lượt xem; cờ ẩn copy sang item mới. Lượt xem chuyên đề lý thuyết cũ gắn **tiết đầu tiên**; các tiết sau bắt đầu chưa xem.

## Considered options

- **Gộp nhiều lecture vào một tiết:** lớp sẽ vẫn một mục nội dung/timeline — ít bất ngờ hơn. Loại vì trái quyết định đã chốt "không gộp": mỗi bài có video/nội dung/tiến độ riêng; gộp sẽ mất ranh giới bài và buộc UI tiết phải chứa danh sách bài lồng nhau (mô hình bốn cấp đội lốt ba cấp).
- **Giữ bảng `lectures` và chỉ đổi nhãn UI:** số mục lớp không nhân. Loại vì tên cũ tái dùng, lệch glossary, HTTP/Prisma vẫn nói `lecture`.

## Consequences

- Timeline/danh sách nội dung lớp dài hơn theo đúng số tiết. Ẩn một tiết không ẩn các tiết còn lại của cùng chuyên đề cũ.
- Gia sư giao chuyên đề N tiết thì học sinh thấy N dòng, không một dòng "chuyên đề".
