# ADR: Bộ câu hỏi thay Tư liệu dùng chung; tiết lấy nguyên bộ, không tái sử dụng tư liệu

- **Status:** Accepted
- **Date:** 2026-10-09
- **Thay quyết định:** ADR `2026-10-09-shared-material.md` (mục 1, 2, 5, 6) và một phần ADR `2026-10-09-audio-asset.md` (audio riêng từng câu, tham chiếu asset từ nhiều nơi).

## Context

Đề JP thật đi theo **phần**: một bài nghe là một file audio liền cùng các câu của nó; một bài đọc là một đoạn văn cùng các câu của nó. Mô hình Tư liệu dùng chung bắt người soạn làm hai nơi (tạo tư liệu riêng, rồi mở từng câu ra gắn), cho câu có audio riêng, và cho tiết lấy lẻ vài câu của một tư liệu — học sinh vẫn phải nghe cả audio dù đề chỉ có một phần câu. Tư liệu chọn lại được từ danh sách nên một đoạn văn / audio có thể dính vào nhiều nhóm câu khác nhau, sửa một chỗ đổi nhiều đề.

## Decision

1. **Bộ câu hỏi** là đơn vị trong ngân hàng: phần tư liệu đầu bộ (văn bản / ảnh / audio — bắt buộc có ít nhất một) + danh sách câu theo **thứ tự của bộ**. Áp cho mọi bộ (nghe, đọc hiểu, từ cho sẵn). Dữ liệu vẫn là `shared_materials` (phần đầu bộ) + `questions.shared_material_id`; thêm thứ tự câu trong bộ và chuyên đề của bộ.
2. **Không tái sử dụng:** phần tư liệu thuộc đúng một bộ, tạo cùng bộ; không có danh sách / ô chọn tư liệu có sẵn. Mỗi audio asset thuộc đúng một chỗ — API từ chối `audioId` đã được tham chiếu nơi khác. Muốn dùng lại nội dung thì upload lại.
3. **Bỏ audio riêng từng câu.** Audio chỉ ở đầu bộ; câu nghe đứng một mình = bộ một câu. Câu cũ đã có audio vẫn phát, form không cho thêm / thay.
4. Bộ thuộc **đúng một chuyên đề**; mọi câu trong bộ cùng chuyên đề đó, chuyển bộ thì cả bộ đi theo.
5. **Tiết thực hành và ôn nhẹ lấy nguyên bộ**, không lấy lẻ câu của bộ. Tiết đi theo bộ: thêm / xoá câu trong bộ thì mọi tiết đang dùng bộ đổi theo cho lượt bắt đầu sau đó (lượt đã bắt đầu giữ snapshot); có cảnh báo khi bộ đang ở tiết đã giao. Trong tiết, bộ là một mục liền (sắp lên xuống giữa câu lẻ, không chen câu vào giữa bộ). Trọng số vẫn đặt trên từng câu-trong-tiết; câu mới vào bộ nhận trọng số 1.
6. Câu chuyển **vào** bộ: gỡ mọi link lẻ của câu đó trong tiết / ôn nhẹ. Câu chuyển **ra** khỏi bộ: biến mất khỏi các tiết dùng bộ, thành câu lẻ chưa vào tiết nào. Cả hai có cảnh báo số tiết bị ảnh hưởng.
7. Xoá bộ = xoá mềm phần đầu bộ cùng mọi câu, gỡ khỏi các tiết (xác nhận số tiết đang dùng); lượt đã bắt đầu giữ snapshot.
8. Làm bài: trình phát audio của bộ dính mép trên khi cuộn trong khối câu của bộ. Đảo câu vẫn xáo bộ như một khối, trong bộ giữ thứ tự bộ.
9. Dữ liệu cũ: migration bổ sung câu còn thiếu cho tiết đang lấy lẻ một phần tư liệu; thứ tự trong bộ khởi tạo theo thời gian tạo câu; tư liệu đang dùng chung giữa nhiều chuyên đề / audio đang tham chiếu từ nhiều nơi được tách thành bản riêng.

## Considered options

- **Giữ Tư liệu dùng chung, chỉ sửa UI ngân hàng:** ít việc nhất nhưng vẫn cho lấy lẻ câu và chọn lại tư liệu — chính hai chỗ gây lệch đề.
- **Câu cha / câu con:** đổi cấu trúc chấm, snapshot, chấm lại; quá lớn khi khối câu theo tư liệu đã có sẵn.
- **Tiết chép danh sách câu lúc thêm bộ:** đề ổn định hơn nhưng tiết lệch khỏi bộ khi bộ đổi — quay lại "lấy một phần bộ".
- **Ôn nhẹ được lấy lẻ câu của bộ:** linh hoạt cho bài luyện ngắn, nhưng một bộ theo hai luật.

## Consequences

- Vị trí trống không số (câu không có trong tiết) không còn xảy ra trong tiết mới, vì tiết luôn có đủ câu của bộ.
- Thêm câu vào bộ đang giao làm đổi phân bổ điểm 100 cho lượt sau.
- File audio trùng phải upload lại → bucket có thể chứa bản trùng (chấp nhận).
