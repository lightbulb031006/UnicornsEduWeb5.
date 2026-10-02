-- Backfill: các học sinh được tạo kèm theo khi import thành tích (ngày 11-13/8/2026)
-- không phải học sinh mới thật sự tham gia trong tháng đó. Đẩy created_at + drop_out_date
-- về 1/1/2025 để không làm sai lệch số liệu học sinh mới/active của tháng 8/2026.
UPDATE student_info
SET created_at = '2025-01-01 00:00:00+00',
    drop_out_date = '2025-01-01',
    status = 'inactive'
WHERE id IN (
  'UNIST-60fbe18cea', 'UNIST-0ac50f2b04', 'UNIST-0553e17d61', 'UNIST-9782514ce3',
  'UNIST-39902165a2', 'UNIST-bb399e13b9', 'UNIST-985d61015a', 'UNIST-81f0307f04',
  'UNIST-617ee33ef3', 'UNIST-becd16ff75', 'UNIST-5bf9f1fd48', 'UNIST-fe6978f152',
  'UNIST-30235fd312', 'UNIST-afdb13605a', 'UNIST-7beb90d7b0', 'UNIST-10f304d727',
  'UNIST-2d20013950', 'UNIST-0032b42039', 'UNIST-fbab67f1a5', 'UNIST-37a8678ed1',
  'UNIST-7272303082', 'UNIST-bac6991528', 'UNIST-2a4b05c5fc', 'UNIST-12f50efadb',
  'UNIST-ab49c5b2a0', 'UNIST-fd914a68a7', 'UNIST-7c52a8dcd1', 'UNIST-ffdb45ef65',
  'UNIST-767b0e2ffc', 'UNIST-8bd21dd295', 'UNIST-55ff7a06b1', 'UNIST-ee6e4899a4',
  'UNIST-f0ba37745f', 'UNIST-b05b9bf518', 'UNIST-f1c2b6d5b5', 'UNIST-7bb56702ae',
  'UNIST-58a3098545', 'UNIST-e97d16640e', 'UNIST-f93dbdfbbc', 'UNIST-501b4e5dd1',
  'UNIST-49f447c3b5', 'UNIST-e57da2cc77', 'UNIST-560e1f7935', 'UNIST-1814fa68ab',
  'UNIST-b4add1c42c', 'UNIST-53c42e4754', 'UNIST-444a9bc227', 'UNIST-70fd9f5802',
  'UNIST-0d82be3067', 'UNIST-f6b12718f4', 'UNIST-5cd8569e74', 'UNIST-5b60a252de',
  'UNIST-5eeac4177c', 'UNIST-fb3bb375db', 'UNIST-0308b9a6f3', 'UNIST-e94985bafe',
  'UNIST-8f347bde5d', 'UNIST-7663e0fb0d', 'UNIST-d19bc68dc5', 'UNIST-80e2fca00d',
  'UNIST-f945e1c745', 'UNIST-827c1b0ac4', 'UNIST-9f8be1ac69', 'UNIST-a4b53c37f4',
  'UNIST-fc6dc76328', 'UNIST-ec63df1ec8', 'UNIST-03d1e95b6f', 'UNIST-b8a5d3a1af',
  'UNIST-d8c7876226', 'UNIST-e1a43af304', 'UNIST-b0c7e8e0f9', 'UNIST-e6e7db1fa1',
  'UNIST-f9b836e2a4', 'UNIST-272032def3', 'UNIST-77834e5bc3', 'UNIST-a99152bbec',
  'UNIST-98bd55e732'
);
