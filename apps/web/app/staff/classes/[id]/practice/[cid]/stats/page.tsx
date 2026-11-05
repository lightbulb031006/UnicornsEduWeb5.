import { redirect } from "next/navigation";
import { practiceResultsHref } from "@/lib/practice-results-routes";

/** Route cũ «Thống kê» → trang Kết quả. */
export default async function StaffPracticeStatsRedirectPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id, cid } = await params;
  redirect(practiceResultsHref(`/staff/classes/${id}`, cid));
}
