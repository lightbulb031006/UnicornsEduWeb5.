#!/usr/bin/env bash
# Dispatch một ticket sang một worktree Orca riêng, chạy Cursor Agent CLI.
#
#   ./scripts/orca-dispatch.sh <issue-number> <slug>
#
# Ví dụ:
#   ./scripts/orca-dispatch.sh 99 01-soft-delete-noi-dung-lop
#
# <slug> nên là <NN>-<mô-tả-ngắn> khớp số ticket trong bản chia slice, vì nhánh
# sẽ được đặt tên feat/<slug> theo quy ước trong AGENTS.md.
#
# Model Cursor: đặt qua env CURSOR_MODEL (vd: CURSOR_MODEL=sonnet-4.5 ./scripts/orca-dispatch.sh ...).

set -euo pipefail

ISSUE="${1:?cần số issue GitHub}"
SLUG="${2:?cần slug dạng NN-mo-ta}"

REPO_ID="180a6e30-b4e0-46d3-aa70-a92b6cfd9d36"
NAME="t${SLUG}"
BRANCH="feat/${SLUG}"

# Effort mặc định: high. Đổi qua env, vd CURSOR_MODEL=cursor-grok-4.6-xhigh hoặc claude-sonnet-5-thinking-high.
CURSOR_MODEL="${CURSOR_MODEL:-cursor-grok-4.6-high}"
MODEL_FLAG="--model ${CURSOR_MODEL}"

# 1. Worktree mới cắt từ dev — một bản checkout độc lập, không đụng cây làm việc chính.
WT_PATH=$(orca worktree create \
  --repo "id:${REPO_ID}" \
  --name "$NAME" \
  --base-branch dev \
  --issue "$ISSUE" \
  --no-parent \
  --setup skip \
  --json | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['worktree']['path'])")

# Orca đặt tên nhánh theo user; đổi về quy ước feat/<NN>-<slug> của repo.
git -C "$WT_PATH" branch -m "$BRANCH"

# Orca có thể cắt worktree từ dev local đã cũ — ép về đúng dev remote mới nhất.
git -C "$WT_PATH" fetch origin dev --quiet || true
git -C "$WT_PATH" reset --hard origin/dev --quiet

# Brief giao cho agent (không dùng dấu nháy đơn / backtick để nhét gọn vào --command).
BRIEF="Ban nhan ticket GitHub so ${ISSUE} cua repo Unicorns-Prj-DEV/UnicornsEduWeb5. Chay: gh issue view ${ISSUE} de doc toan bo What to build, Acceptance criteria va muc Context cho agent, roi lam dung theo do. Nhanh ${BRANCH} da cat san tu dev va ban dang dung dung cho. Viec dau tien: chay pnpm install vi worktree nay chua co node_modules. Doc CONTEXT.md, AGENTS.md va cac ADR lien quan trong docs/adr/ truoc khi sua schema hay code. Khi xong, cap nhat docs theo quy tac Documentation sync, commit, roi mo PR voi base la dev, TUYET DOI khong phai main."

# 2. Terminal chạy Cursor Agent CLI, nhét luôn brief làm prompt khởi tạo.
HANDLE=$(orca terminal create \
  --worktree "id:${REPO_ID}::${WT_PATH}" \
  --title "$NAME" \
  --command "cursor-agent --force ${MODEL_FLAG} '${BRIEF}'" \
  --json | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['terminal']['handle'])")

# 3. Chờ TUI sẵn sàng; nếu prompt khởi tạo không tự chạy thì gửi lại thủ công.
orca terminal wait --terminal "$HANDLE" --for tui-idle --timeout-ms 60000 --json >/dev/null 2>&1 || true

echo "issue   #${ISSUE}"
echo "branch  ${BRANCH}"
echo "path    ${WT_PATH}"
echo "handle  ${HANDLE}"
echo
echo "Theo dõi:  orca terminal read --terminal ${HANDLE}"
echo "Gửi thêm: orca terminal send --terminal ${HANDLE} --text \"...\" --enter"
echo "Tổng quan: orca worktree ps"
