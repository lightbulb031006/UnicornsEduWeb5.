import { hasSaleCsHeadAccess } from "@/lib/sale-cs-head-access";
export function AssistantDualRoleIncomeHelper({
  visible,
}: {
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <p className="text-xs leading-relaxed text-text-muted">
      Trợ cấp 3% chỉ tính từ CSKH khác do bạn quản lí, không tính trên học
      sinh thuộc portfolio CSKH của chính bạn.
    </p>
  );
}

export function hasAssistantAndCustomerCareRoles(roles?: string[] | null) {
  if (!Array.isArray(roles)) return false;
  return hasSaleCsHeadAccess(roles) && roles.includes("customer_care");
}
