import type { AdminShellAccess } from "@/lib/admin-shell-access";
import {
  buildStaffRoleDetailHref,
  type AdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import type { ClassStudentCaretaker } from "@/dtos/class.dto";

export function resolveClassStudentCaretakerHref(options: {
  routeBase: AdminLikeRouteBase;
  caretaker: ClassStudentCaretaker | null | undefined;
  access: Pick<
    AdminShellAccess,
    "isAdmin" | "isAssistant" | "isAccountantExpense" | "isCustomerCare"
  >;
  viewerStaffId?: string | null;
}): string | null {
  const caretakerId = options.caretaker?.id?.trim();
  if (!caretakerId) {
    return null;
  }

  if (
    options.access.isAdmin ||
    options.access.isAssistant ||
    options.access.isAccountantExpense
  ) {
    return buildStaffRoleDetailHref(
      options.routeBase,
      "customer_care",
      caretakerId,
    );
  }

  const viewerStaffId = options.viewerStaffId?.trim();
  if (
    options.access.isCustomerCare &&
    viewerStaffId &&
    viewerStaffId === caretakerId
  ) {
    return options.routeBase === "/staff"
      ? "/staff/customer-care-detail"
      : buildStaffRoleDetailHref(options.routeBase, "customer_care", caretakerId);
  }

  return null;
}
