import type {
  CloseFixedSalaryMonthResponse,
  RoleFixedSalaryDefaultsResponse,
  RoleFixedSalaryOperatingRatesResponse,
  StaffFixedSalaryOverridesQuery,
  StaffFixedSalaryOverridesResponse,
  StaffFixedSalaryPayablesResponse,
  UpsertRoleFixedSalaryDefaultsPayload,
  UpsertRoleFixedSalaryOperatingRatesPayload,
  UpsertStaffFixedSalaryAmountPayload,
  UpsertStaffFixedSalaryOperatingRatePayload,
} from "@/dtos/fixed-salary-settings.dto";
import { api } from "../client";

export async function getRoleFixedSalaryDefaults(): Promise<RoleFixedSalaryDefaultsResponse> {
  const response = await api.get<RoleFixedSalaryDefaultsResponse>(
    "/fixed-salary-settings/role-defaults",
  );
  return response.data;
}

export async function upsertRoleFixedSalaryDefaults(
  payload: UpsertRoleFixedSalaryDefaultsPayload,
): Promise<RoleFixedSalaryDefaultsResponse> {
  const response = await api.put<RoleFixedSalaryDefaultsResponse>(
    "/fixed-salary-settings/role-defaults",
    payload,
  );
  return response.data;
}

export async function getRoleFixedSalaryOperatingRates(): Promise<RoleFixedSalaryOperatingRatesResponse> {
  const response = await api.get<RoleFixedSalaryOperatingRatesResponse>(
    "/fixed-salary-settings/role-operating-rates",
  );
  return response.data;
}

export async function upsertRoleFixedSalaryOperatingRates(
  payload: UpsertRoleFixedSalaryOperatingRatesPayload,
): Promise<RoleFixedSalaryOperatingRatesResponse> {
  const response = await api.put<RoleFixedSalaryOperatingRatesResponse>(
    "/fixed-salary-settings/role-operating-rates",
    payload,
  );
  return response.data;
}

export async function getStaffFixedSalaryOverrides(
  query: StaffFixedSalaryOverridesQuery = {},
): Promise<StaffFixedSalaryOverridesResponse> {
  const response = await api.get<StaffFixedSalaryOverridesResponse>(
    "/fixed-salary-settings/staff-overrides",
    { params: query },
  );
  return response.data;
}

export async function upsertStaffFixedSalaryAmount(
  payload: UpsertStaffFixedSalaryAmountPayload,
): Promise<StaffFixedSalaryOverridesResponse> {
  const response = await api.put<StaffFixedSalaryOverridesResponse>(
    "/fixed-salary-settings/staff-overrides/amount",
    payload,
  );
  return response.data;
}

export async function upsertStaffFixedSalaryOperatingRate(
  payload: UpsertStaffFixedSalaryOperatingRatePayload,
): Promise<StaffFixedSalaryOverridesResponse> {
  const response = await api.put<StaffFixedSalaryOverridesResponse>(
    "/fixed-salary-settings/staff-overrides/operating-rate",
    payload,
  );
  return response.data;
}

export async function getStaffFixedSalaryPayables(
  month?: string,
): Promise<StaffFixedSalaryPayablesResponse> {
  const response = await api.get<StaffFixedSalaryPayablesResponse>(
    "/fixed-salary-settings/payables",
    { params: month ? { month } : undefined },
  );
  return response.data;
}

export async function closeFixedSalaryMonth(): Promise<CloseFixedSalaryMonthResponse> {
  const response = await api.post<CloseFixedSalaryMonthResponse>(
    "/fixed-salary-settings/close-month",
  );
  return response.data;
}
