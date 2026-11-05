import { Suspense } from "react";
import PracticeResultsView from "@/components/staff/practice-results/PracticeResultsView";

/** Cùng trang Kết quả phía staff, nhưng ở trong admin shell. */
export default async function AdminPracticeResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <PracticeResultsView
        routeBase={`/admin/classes/${id}`}
        backHref={`/admin/classes/${id}?tab=chuyen-de`}
      />
    </Suspense>
  );
}
