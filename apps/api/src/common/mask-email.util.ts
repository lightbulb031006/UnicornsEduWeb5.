/**
 * Che email để hiển thị cho người chưa đăng nhập: chỉ giữ 4 ký tự cuối của
 * phần trước `@` và tên miền (`...abcd@gmail.com`). Khớp `maskEmailAddress`
 * phía web.
 */
export function maskEmailAddress(email: string): string {
  const normalizedEmail = email.trim();
  const atIndex = normalizedEmail.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) {
    return '';
  }

  const localPart = normalizedEmail.slice(0, atIndex);
  const domainPart = normalizedEmail.slice(atIndex + 1);
  return `...${localPart.slice(-4)}@${domainPart}`;
}
