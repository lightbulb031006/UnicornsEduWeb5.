import { Suspense } from "react";
import StudentAttemptView from "@/components/staff/practice-results/StudentAttemptView";

/** Cùng màn Bài làm phía staff, nhưng ở trong admin shell. */
export default async function AdminStudentAttemptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <StudentAttemptView routeBase={`/admin/classes/${id}`} />
    </Suspense>
  );
}
