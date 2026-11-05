# ADR: Ảnh trong câu hỏi lưu ở bucket private, URL ký bằng interceptor toàn cục

- **Status:** Accepted
- **Date:** 2026-10-10

## Context

Người soạn chèn ảnh vào nội dung câu hỏi / Bộ câu hỏi bằng cách dán URL https. Ảnh phụ thuộc host ngoài (link chết, lộ đề trước giờ làm). Ảnh là một phần HTML TipTap, xuất hiện ở rất nhiều endpoint: ngân hàng câu hỏi, bộ, tiết thực hành, ôn nhẹ, snapshot bài làm, xem lại, chấm.

## Decision

1. Upload qua `POST /question-images` vào bucket **private** `question-images`, path `{courseId}/{uuid}.{jpg|png|webp}`. Ảnh bất biến; không bảng DB.
2. HTML chỉ lưu `<img data-question-image="{path}">` — **không lưu URL**.
3. `ContentImageInterceptor` đăng ký `APP_INTERCEPTOR`:
   - Request POST/PUT/PATCH: bỏ `src` của mọi `<img>` có path hợp lệ (regex `uuid/uuid.ext`) trong body.
   - Response: gom path trong mọi chuỗi lồng nhau, ký lô (`createSignedUrls`, 6 giờ), chèn vào `src`.
4. Ai nhận được nội dung (đã qua kiểm quyền của endpoint) thì nhận URL ảnh trong nội dung đó.

## Considered options

- **Bucket public:** đơn giản, cache tốt, nhưng ai có link xem được ảnh đề.
- **Ký trong từng service:** chính xác hơn nhưng phải sửa từng đường đọc; sót một đường là ảnh vỡ.
- **Bảng `question_images` + FK:** dọn rác được, nhưng cần migration và đồng bộ HTML ↔ bảng.

## Consequences

- Mọi response JSON bị duyệt một lượt chuỗi (chi phí nhỏ, chỉ ký khi có `data-question-image`).
- Snapshot bài làm giữ path → ảnh vẫn hiện sau khi câu gốc bị sửa (ảnh bất biến).
- Ảnh không còn được tham chiếu vẫn nằm trong bucket (dọn rác là job riêng).
- Signed URL dùng được tới khi hết hạn — không chặn người tự lưu link.
- Editor khác (tiết lý thuyết, nội dung lớp) vẫn chèn ảnh bằng URL.
