import { redirect } from "next/navigation";

export default function AdminDeductionsRedirectPage() {
  redirect("/admin/system-settings?tab=deductions");
}
