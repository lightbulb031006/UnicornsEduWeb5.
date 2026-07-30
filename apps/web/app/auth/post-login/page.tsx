"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { AuthCardSkeleton } from "@/components/auth/AuthCardSkeleton";
import { readSafeNextPath } from "@/lib/auth-redirect";
import { bootstrapPostLoginSession } from "@/lib/post-login-session";

function hasAuthenticatedSession(user: { id: string; accountHandle: string }) {
  return Boolean(user.id && user.accountHandle);
}

function PostLoginRedirectContent() {
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const queryClient = useQueryClient();
  const { user, setUser, isAuthReady } = useAuth();
  const nextPath = readSafeNextPath(getSearchParam("next"));

  const redirectQuery = useQuery({
    queryKey: ["auth", "post-login-redirect", user.id, nextPath],
    enabled: isAuthReady && hasAuthenticatedSession(user),
    staleTime: Infinity,
    retry: false,
    queryFn: () =>
      bootstrapPostLoginSession({
        fallbackUser: user,
        queryClient,
        setUser,
        requestedNextPath: nextPath,
      }).then((result) => result.redirectHref),
  });

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!hasAuthenticatedSession(user)) {
      replace("/auth/login");
      return;
    }

    if (user.requiresPasswordSetup) {
      replace("/auth/setup-password");
    }
  }, [isAuthReady, replace, user]);

  useEffect(() => {
    if (redirectQuery.data) {
      replace(redirectQuery.data);
    }
  }, [redirectQuery.data, replace]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-primary px-4">
      <p className="text-sm text-text-secondary">Đang chuyển tới workspace…</p>
    </div>
  );
}

export default function PostLoginRedirectPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton showInlineActions={false} footerRows={0} />}>
      <PostLoginRedirectContent />
    </Suspense>
  );
}
