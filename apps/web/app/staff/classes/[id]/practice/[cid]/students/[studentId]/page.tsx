import { Suspense } from "react";
import StudentAttemptView from "@/components/staff/practice-results/StudentAttemptView";

export default async function StaffStudentAttemptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <StudentAttemptView routeBase={`/staff/classes/${id}`} />
    </Suspense>
  );
}
