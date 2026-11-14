"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  parsePostQuery,
  postQueryHref,
  toPostPage,
  type PostListOperations,
  type PostPage,
  type PostQuery,
} from "./posts";

/** The URL form is a stable identity for every condition, and reads back. */
const toKey = (query: PostQuery) => postQueryHref("", query);
const fromKey = (key: string) =>
  parsePostQuery(Object.fromEntries(new URLSearchParams(key.slice(1))));

type Result =
  | { key: string; page: PostPage; error?: undefined }
  | { key: string; error: string; page?: undefined };

function errorMessage(error: unknown) {
  if (error instanceof Error && error.name === "PostsNotConnectedError") {
    return "모집 목록 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요.";
  }
  if (error instanceof Error && error.name === "InvalidPostData") {
    return "모집글 정보를 확인할 수 없어요. 다시 불러와 주세요.";
  }
  return "모집글을 불러오지 못했어요. 네트워크를 확인한 후 다시 시도해 주세요.";
}

/** Loads one page; a newer query or retry always wins over an older response. */
export function usePostList(query: PostQuery, operations: PostListOperations) {
  const { handleUnauthorized } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const queryKey = toKey(query);
  const key = `${queryKey}:${attempt}`;

  useEffect(() => {
    let active = true;
    operations
      .list(fromKey(queryKey))
      .then((raw) => {
        if (active) setResult({ key, page: toPostPage(raw) });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          handleUnauthorized();
          return;
        }
        setResult({ key, error: errorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [key, queryKey, operations, handleUnauthorized]);

  const current = result?.key === key ? result : null;
  return {
    loading: current === null,
    page: current?.page ?? null,
    error: current?.error ?? null,
    retry: () => setAttempt((value) => value + 1),
  };
}

/**
 * Result count for conditions not applied yet (the panel's apply button).
 * Waits briefly while typing; null while loading or when the count failed.
 */
export function usePostCount(
  query: PostQuery,
  operations: PostListOperations,
  enabled: boolean,
) {
  const queryKey = toKey({ ...query, page: 0 });
  const [result, setResult] = useState<{ key: string; count: number } | null>(
    null,
  );

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = window.setTimeout(() => {
      operations
        .list(fromKey(queryKey))
        .then((raw) => {
          if (active)
            setResult({ key: queryKey, count: toPostPage(raw).totalElements });
        })
        .catch(() => {
          // The button still works without a number.
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [queryKey, operations, enabled]);

  return result?.key === queryKey ? result.count : null;
}
