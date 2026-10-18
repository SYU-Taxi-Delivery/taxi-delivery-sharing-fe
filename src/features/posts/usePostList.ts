"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  toPostPage,
  type PostFilter,
  type PostListOperations,
  type PostPage,
} from "./posts";

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
export function usePostList(
  type: PostFilter,
  joinableOnly: boolean,
  page: number,
  operations: PostListOperations,
) {
  const { handleUnauthorized } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${type}:${joinableOnly}:${page}:${attempt}`;

  useEffect(() => {
    let active = true;
    operations
      .list({ type, joinableOnly, page })
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
  }, [key, type, joinableOnly, page, operations, handleUnauthorized]);

  const current = result?.key === key ? result : null;
  return {
    loading: current === null,
    page: current?.page ?? null,
    error: current?.error ?? null,
    retry: () => setAttempt((value) => value + 1),
  };
}
