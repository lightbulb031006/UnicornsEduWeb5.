// Spec mặc định chạy với hồ sơ JP (hành vi cũ: 100/N, có tự luận). Spec IT tự override.
process.env.LMS_PROFILE ??= 'jp';
