import { useCallback, useMemo, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { TRPCClientError } from "@trpc/client";

const LOGIN_URL = "/login";

function getLoginUrl() {
  return LOGIN_URL;
}

/**
 * 認証状態を管理するカスタムフック
 * - user: ログイン中のユーザー情報（未ログイン時は null）
 * - loading: 認証状態の確認中フラグ
 * - isAuthenticated: ログイン済みかどうか
 * - logout: ログアウト関数
 * - refresh: ユーザー情報を再取得する関数
 */
export function useAuth({ redirectOnUnauthenticated = false } = {}) {
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (e) {
      if (e instanceof TRPCClientError && e.data?.code === "UNAUTHORIZED") return;
      throw e;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    // ユーザー情報をlocalStorageにもキャッシュ（オフライン表示用）
    localStorage.setItem("manus-runtime-user-info", JSON.stringify(meQuery.data));
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: !!meQuery.data,
    };
  }, [meQuery.data, meQuery.error, meQuery.isLoading, logoutMutation.error, logoutMutation.isPending]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (state.loading || state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname !== getLoginUrl()) {
      window.location.href = getLoginUrl();
    }
  }, [redirectOnUnauthenticated, state.loading, state.user]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
