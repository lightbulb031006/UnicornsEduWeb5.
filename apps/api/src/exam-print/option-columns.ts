export type OptionColumns = 1 | 2 | 4;

/**
 * Số cột xếp các phương án A–D của một câu Phần I, như đề in của Bộ: phương án
 * ngắn nằm cùng một dòng, vừa thì hai cột, dài thì mỗi phương án một dòng.
 *
 * @param optionWidths bề rộng tự nhiên (px, đã gồm nhãn "A.") của từng phương án,
 *   đo trong Chromium khi chưa xuống dòng.
 * @param rowWidth bề rộng khối phương án (px).
 * @param columnGap khoảng cách giữa hai cột (px).
 */
export function chooseOptionColumns(
  optionWidths: number[],
  rowWidth: number,
  columnGap: number,
): OptionColumns {
  // TODO(learning): chọn 4 / 2 / 1 cột từ bề rộng các phương án.
  void optionWidths;
  void rowWidth;
  void columnGap;
  return 1;
}
