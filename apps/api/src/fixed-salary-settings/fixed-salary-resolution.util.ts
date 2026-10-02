export type FixedSalaryAxisSource =
  | 'override'
  | 'role_default'
  | 'unconfigured';

export type ResolvedFixedSalaryAxis = {
  applied: number | null;
  source: FixedSalaryAxisSource;
  hasOverride: boolean;
  overrideValue: number | null;
  roleDefaultValue: number | null;
};

export function resolveFixedSalaryAxis(params: {
  hasOverride: boolean;
  overrideValue?: number | null;
  roleDefaultValue?: number | null;
}): ResolvedFixedSalaryAxis {
  const roleDefaultValue =
    params.roleDefaultValue === undefined ? null : params.roleDefaultValue;

  if (params.hasOverride) {
    const overrideValue = params.overrideValue ?? 0;
    return {
      applied: overrideValue,
      source: 'override',
      hasOverride: true,
      overrideValue,
      roleDefaultValue,
    };
  }

  if (roleDefaultValue === null) {
    return {
      applied: null,
      source: 'unconfigured',
      hasOverride: false,
      overrideValue: null,
      roleDefaultValue: null,
    };
  }

  return {
    applied: roleDefaultValue,
    source: 'role_default',
    hasOverride: false,
    overrideValue: null,
    roleDefaultValue,
  };
}
