"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { AppShell } from "../AppShell";
import type { PostType } from "../posts";
import {
  editAccess,
  emptyDraft,
  PostFormError,
  type EditablePost,
  type PostFormOperations,
} from "./postDraft";
import { postFormOperations } from "./postFormApi";
import { PostForm } from "./PostForm";
import styles from "./form.module.css";

export function PostFormScreen({
  mode,
  postId,
  initialType = "TAXI",
  listPath = "/posts",
  operations = postFormOperations,
}: {
  mode: "create" | "edit";
  postId?: string;
  initialType?: PostType;
  listPath?: string;
  operations?: PostFormOperations;
}) {
  return (
    <AppShell current="posts" postsPath={listPath}>
      <RequireAuth>
        {mode === "create" ? (
          <CreateForm
            initialType={initialType}
            listPath={listPath}
            operations={operations}
          />
        ) : (
          <EditForm
            postId={postId ?? ""}
            listPath={listPath}
            operations={operations}
          />
        )}
      </RequireAuth>
    </AppShell>
  );
}

function CreateForm({
  initialType,
  listPath,
  operations,
}: {
  initialType: PostType;
  listPath: string;
  operations: PostFormOperations;
}) {
  const [draft] = useState(() => emptyDraft(Date.now(), initialType));
  return (
    <PostForm
      mode="create"
      initialDraft={draft}
      operations={operations}
      listPath={listPath}
    />
  );
}

type Loaded =
  | { key: number; post: EditablePost; error?: undefined }
  | { key: number; error: string; post?: undefined };

function EditForm({
  postId,
  listPath,
  operations,
}: {
  postId: string;
  listPath: string;
  operations: PostFormOperations;
}) {
  const { handleUnauthorized } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [conflicted, setConflicted] = useState(false);

  useEffect(() => {
    let active = true;
    operations
      .load(postId)
      .then((post) => {
        if (active) setLoaded({ key: attempt, post });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          handleUnauthorized();
          return;
        }
        setLoaded({
          key: attempt,
          error:
            error instanceof PostFormError && error.kind === "notFound"
              ? "모집을 찾을 수 없어요."
              : error instanceof PostFormError && error.kind === "forbidden"
                ? "이 모집을 수정할 권한이 없어요."
                : error instanceof Error &&
                    error.name === "PostFormNotConnectedError"
                  ? "모집글 수정 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요."
                  : "모집 정보를 불러오지 못했어요. 다시 시도해 주세요.",
        });
      });
    return () => {
      active = false;
    };
  }, [attempt, postId, operations, handleUnauthorized]);

  const current = loaded?.key === attempt ? loaded : null;
  if (!current) {
    return (
      <p role="status" className="py-12 text-center">
        모집 정보를 불러오고 있어요.
      </p>
    );
  }
  if (current.error !== undefined) {
    return (
      <div className={`${styles.alert} mt-4`}>
        <p role="alert">{current.error}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setConflicted(false);
              setAttempt((value) => value + 1);
            }}
          >
            다시 불러오기
          </button>
          <Link href={listPath} className={styles.secondary}>
            모집글 목록
          </Link>
        </div>
      </div>
    );
  }

  const access = editAccess(current.post);
  if (!access.editable) {
    return (
      <div className={`${styles.notice} mt-4 grid gap-3`}>
        <p role="status">{access.reason}</p>
        <Link
          href={`/posts/${encodeURIComponent(postId)}`}
          className={styles.secondary}
        >
          모집 상세로 돌아가기
        </Link>
      </div>
    );
  }

  const { draft } = current.post;
  const active = draft.type === "TAXI" ? draft.taxi : draft.delivery;
  return (
    <PostForm
      // A reload after a conflict restarts the form with the latest locks.
      key={attempt}
      mode="edit"
      postId={postId}
      initialDraft={draft}
      operations={operations}
      listPath={listPath}
      coreLocked={access.coreLocked}
      lockReason={access.reason}
      originalReferenceTime={`${active.date}T${active.time}:00+09:00`}
      currentMemberCount={current.post.currentMemberCount}
      initialMessage={
        conflicted
          ? "모집 상태가 바뀌어 저장하지 않았어요. 최신 정보로 다시 불러왔으니 확인한 뒤 다시 저장해 주세요."
          : undefined
      }
      onConflict={() => {
        setConflicted(true);
        setAttempt((value) => value + 1);
      }}
    />
  );
}
