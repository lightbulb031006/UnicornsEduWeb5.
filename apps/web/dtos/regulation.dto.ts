export type RegulationAudience =
  | "all"
  | "student"
  | "staff_admin"
  | "staff_teacher"
  | "staff_sale_customer_care_head"
  | "staff_lesson_plan"
  | "staff_lesson_plan_head"
  | "staff_accountant_income"
  | "staff_accountant_expense"
  | "staff_communication"
  | "staff_technical"
  | "staff_customer_care"
  | "staff_training"
  | "staff_training_head"
  | "staff_sale";

export interface RegulationAuthor {
  userId: string | null;
  accountHandle: string | null;
  email: string | null;
  displayName: string | null;
}

export interface RegulationItem {
  id: string;
  title: string;
  description: string | null;
  content: string;
  audiences: RegulationAudience[];
  resourceLink: string | null;
  resourceLinkLabel: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: RegulationAuthor | null;
  updatedBy: RegulationAuthor | null;
}

export interface CreateRegulationPayload {
  title: string;
  description?: string | null;
  content: string;
  audiences: RegulationAudience[];
  resourceLink?: string | null;
  resourceLinkLabel?: string | null;
}

export type UpdateRegulationPayload = CreateRegulationPayload;
