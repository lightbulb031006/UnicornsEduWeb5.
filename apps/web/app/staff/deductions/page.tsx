import { redirect } from "next/navigation";

export default function StaffDeductionsRedirectPage() {
  redirect("/staff/system-settings?tab=deductions");
}
