import type { QueryClient } from "@tanstack/react-query";
import type { LoginResponseDto, UserInfoDto } from "@/dtos/Auth.dto";
import * as authApi from "@/lib/apis/auth.api";
import { resolvePostLoginRedirect } from "@/lib/auth-redirect";

export function buildLoginFallbackSession(
  loginResponse: LoginResponseDto,
): UserInfoDto {
  return {
    id: loginResponse.id,
    accountHandle: loginResponse.accountHandle,
    roleType: loginResponse.roleType,
    requiresPasswordSetup: false,
    avatarUrl: loginResponse.avatarUrl ?? null,
    staffRoles: [],
    hasStaffProfile: false,
    hasStudentProfile: false,
  };
}

export async function bootstrapPostLoginSession(params: {
  fallbackUser: UserInfoDto;
  queryClient: QueryClient;
  setUser: (user: UserInfoDto) => void;
  requestedNextPath?: string | null;
}): Promise<{ session: UserInfoDto; redirectHref: string }> {
  let session = params.fallbackUser;

  try {
    session = await authApi.getSession();
    params.queryClient.setQueryData(["auth", "session"], session);
    params.setUser(session);
  } catch {
    // Keep fallback payload when session bootstrap fails.
  }

  return {
    session,
    redirectHref: resolvePostLoginRedirect(
      session,
      params.requestedNextPath ?? null,
    ),
  };
}
