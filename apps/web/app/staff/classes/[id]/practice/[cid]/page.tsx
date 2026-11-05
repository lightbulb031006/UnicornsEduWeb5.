import { Suspense } from "react";
import PracticeResultsView from "@/components/staff/practice-results/PracticeResultsView";
import { staffClassDetailHref } from "@/lib/class-detail-tabs";

export default async function StaffPracticeResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <PracticeResultsView
        routeBase={`/staff/classes/${id}`}
        backHref={staffClassDetailHref(id, "chuyen-de")}
      />
    </Suspense>
  );
}
