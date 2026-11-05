import { redirect } from "next/navigation";
import { practiceResultsHref } from "@/lib/practice-results-routes";

/** Hàng đợi chấm theo câu đã bỏ: chấm trọn bài trên trang Kết quả, lọc «Chờ chấm». */
export default async function StaffEssayGradingRedirectPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>;
}) {
  const { id, assignmentId } = await params;
  redirect(practiceResultsHref(`/staff/classes/${id}`, assignmentId, "cho-cham"));
}
