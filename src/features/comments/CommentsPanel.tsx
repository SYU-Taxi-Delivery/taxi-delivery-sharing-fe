"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { RequireAuth } from "@/features/auth/RequireAuth";
import type { PostStatus } from "@/features/posts/posts";
import { ConfirmDialog } from "@/features/posts/detail/ConfirmDialog";
import common from "@/features/posts/detail/detail.module.css";
import {
  COMMENT_MAX,
  CommentsError,
  canWriteComment,
  commentContentError,
  commentsErrorMessage,
  commentsOperations,
  normalizeComment,
  toComments,
  type CommentItem,
  type CommentsOperations,
} from "./comments";
import styles from "./comments.module.css";

export type CommentsPanelProps = {
  postId: string;
  status: PostStatus;
  referenceTime: string;
  serverNow: () => number;
  operations?: CommentsOperations;
  onUnavailable: () => void;
};

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function CommentsPanel(props: CommentsPanelProps) {
  const { user } = useAuth();
  const operations = props.operations ?? commentsOperations;
  const [source, setSource] = useState({ operations, revision: 0 });
  if (source.operations !== operations) {
    setSource({ operations, revision: source.revision + 1 });
  }
  if (props.status === "REMOVED") return null;
  return (
    <RequireAuth>
      {user && (
        <Comments
          key={JSON.stringify([props.postId, user.id, source.revision])}
          {...props}
        />
      )}
    </RequireAuth>
  );
}

function Comments({
  postId,
  status,
  referenceTime,
  serverNow,
  operations = commentsOperations,
  onUnavailable,
}: CommentsPanelProps) {
  const { handleUnauthorized } = useAuth();
  const [items, setItems] = useState<CommentItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"create" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [writeBlocked, setWriteBlocked] = useState(false);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [target, setTarget] = useState<CommentItem | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const unavailable = useRef(onUnavailable);
  const input = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const result = useRef<HTMLParagraphElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  useEffect(() => {
    unavailable.current = onUnavailable;
  }, [onUnavailable]);

  const read = useCallback(
    async (version: number) => {
      try {
        const next = toComments(await operations.list(postId));
        if (generation.current !== version) return false;
        setItems(next);
        setForbidden(false);
        setNotConnected(false);
        setNeedsReview(false);
        return true;
      } catch (failure) {
        if (generation.current !== version) return false;
        if (failure instanceof ApiError && failure.status === 401) {
          setItems(null);
          handleUnauthorized();
        } else if (
          failure instanceof CommentsError &&
          failure.kind === "notConnected"
        ) {
          setItems(null);
          setNotConnected(true);
        } else if (
          (failure instanceof ApiError && failure.status === 403) ||
          (failure instanceof CommentsError && failure.kind === "forbidden")
        ) {
          setItems(null);
          setForbidden(true);
          setError(commentsErrorMessage(new CommentsError("forbidden")));
        } else if (
          (failure instanceof ApiError && failure.status === 404) ||
          (failure instanceof CommentsError && failure.kind === "notFound")
        ) {
          setItems(null);
          setForbidden(true);
          setError(commentsErrorMessage(new CommentsError("notFound")));
          unavailable.current();
        } else {
          setError("댓글을 불러오지 못했어요. 다시 불러오기를 눌러 주세요.");
        }
        return false;
      } finally {
        if (generation.current === version) setLoading(false);
      }
    },
    [operations, postId, handleUnauthorized],
  );

  useEffect(() => {
    const version = ++generation.current;
    locked.current = false;
    void read(version);
    return () => {
      generation.current += 1;
    };
  }, [read]);

  useEffect(() => {
    if (notice) result.current?.focus();
  }, [notice]);

  const writable =
    !writeBlocked && canWriteComment(status, referenceTime, serverNow());
  const pending = loading || busy !== null;
  const count = Array.from(normalizeComment(draft)).length;

  async function reload() {
    if (pending || locked.current) return;
    setLoading(true);
    setError(null);
    const review = needsReview;
    if ((await read(generation.current)) && review) {
      setNotice(
        "최신 댓글을 확인했어요. 이미 등록된 댓글이 있는지 확인한 뒤 다시 시도해 주세요.",
      );
    }
  }

  async function mutate(action: "create" | "remove") {
    if (locked.current || pending || needsReview || !items || forbidden) return;
    if (action === "create") {
      if (
        writeBlocked ||
        !canWriteComment(status, referenceTime, serverNow())
      ) {
        setWriteBlocked(true);
        setError(
          "끝난 모집에는 새 댓글을 등록할 수 없어요. 작성한 내용은 유지돼요.",
        );
        return;
      }
      const validation = commentContentError(draft);
      setFieldError(validation);
      if (validation) return input.current?.focus();
    } else if (
      !target ||
      !items.some((item) => item.id === target.id && item.isMine)
    ) {
      return;
    }
    const version = generation.current;
    locked.current = true;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      if (action === "create")
        await operations.create(postId, normalizeComment(draft));
      else await operations.remove(postId, target!.id);
      if (generation.current !== version) return;
      if (action === "create") {
        setDraft("");
        setNotice("댓글이 등록됐어요.");
        setLoading(true);
        const refreshed = await read(version);
        if (generation.current === version && !refreshed) {
          setNotice(
            "댓글은 등록됐지만 목록을 확인하지 못했어요. 다시 불러오기를 눌러 주세요.",
          );
        }
      } else {
        setItems(
          (current) =>
            current?.filter((item) => item.id !== target!.id) ?? null,
        );
        setNotice("댓글이 삭제됐어요.");
      }
    } catch (failure) {
      if (generation.current !== version) return;
      if (failure instanceof ApiError && failure.status === 401) {
        setItems(null);
        handleUnauthorized();
      } else if (
        (failure instanceof CommentsError && failure.kind === "notFound") ||
        (failure instanceof ApiError && failure.status === 404)
      ) {
        setItems(null);
        setForbidden(true);
        unavailable.current();
      } else {
        const known =
          failure instanceof CommentsError && failure.kind !== "unknownOutcome";
        const denied = failure instanceof ApiError && failure.status === 403;
        if (failure instanceof CommentsError && failure.kind === "closed")
          setWriteBlocked(true);
        setNeedsReview(!known && !denied);
        setError(
          commentsErrorMessage(
            denied ? new CommentsError("forbidden") : failure,
          ),
        );
        if (action === "create") input.current?.focus();
      }
    } finally {
      if (generation.current === version) {
        setTarget(null);
        setBusy(null);
        locked.current = false;
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate("create");
  }

  return (
    <section
      className={common.section}
      aria-labelledby={`${id}-title`}
      aria-busy={pending}
    >
      <h2
        id={`${id}-title`}
        ref={heading}
        tabIndex={-1}
        className={common.sectionTitle}
      >
        댓글
      </h2>
      {notConnected ? (
        <p className={common.help}>
          댓글 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요.
        </p>
      ) : (
        <>
          {notice && (
            <p
              ref={result}
              tabIndex={-1}
              role="status"
              className={common.notice}
            >
              {notice}
            </p>
          )}
          {loading && (
            <p role="status" className={common.help}>
              댓글을 불러오고 있어요.
            </p>
          )}
          {error && (
            <p role="alert" className={common.alert}>
              {error}
            </p>
          )}
          {!loading && (error || needsReview) && (
            <button
              type="button"
              className={common.secondary}
              disabled={busy !== null}
              onClick={() => void reload()}
            >
              {needsReview ? "최신 댓글 확인" : "다시 불러오기"}
            </button>
          )}
          {!forbidden &&
            items &&
            (items.length === 0 ? (
              <p className={common.help}>
                아직 댓글이 없어요. 첫 댓글을 남겨 보세요.
              </p>
            ) : (
              <ul className={styles.list}>
                {items.map((item) => (
                  <li key={item.id} className={styles.comment}>
                    <div className={styles.header}>
                      <strong>
                        {item.authorName}
                        {item.isMine ? " · 나" : ""}
                      </strong>
                      <time dateTime={item.createdAt} className={common.help}>
                        {dateTime.format(new Date(item.createdAt))}
                      </time>
                    </div>
                    <p className={styles.content}>{item.content}</p>
                    {item.isMine && (
                      <button
                        type="button"
                        className={common.textButton}
                        disabled={pending || needsReview}
                        onClick={(event) => {
                          opener.current = event.currentTarget;
                          setTarget(item);
                        }}
                      >
                        내 댓글 삭제
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ))}
          {!forbidden &&
            items &&
            (writable || draft !== "" ? (
              <form
                className={styles.form}
                noValidate
                aria-busy={busy === "create"}
                onSubmit={submit}
              >
                <div className={common.field}>
                  <div className={common.labelRow}>
                    <label htmlFor={`${id}-content`} className={common.label}>
                      댓글 내용
                    </label>
                    <span
                      id={`${id}-count`}
                      className={common.counter}
                      data-over={count > COMMENT_MAX}
                      aria-live="polite"
                    >
                      {count} / {COMMENT_MAX}자
                    </span>
                  </div>
                  <textarea
                    ref={input}
                    id={`${id}-content`}
                    name="comment"
                    className={common.textarea}
                    value={draft}
                    readOnly={pending || needsReview || !writable}
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={`${id}-help ${id}-count${fieldError ? ` ${id}-error` : ""}`}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setFieldError(null);
                    }}
                  />
                  <p id={`${id}-help`} className={common.help}>
                    {writable
                      ? "참여하지 않아도 댓글을 남길 수 있어요. 개인정보는 적지 말아 주세요."
                      : "끝난 모집에는 새 댓글을 등록할 수 없어요. 작성 중이던 내용은 복사할 수 있어요."}
                  </p>
                  {fieldError && (
                    <p id={`${id}-error`} className={common.error}>
                      {fieldError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className={common.primary}
                  disabled={pending || needsReview || !writable}
                >
                  {busy === "create" ? "등록 중…" : "댓글 등록"}
                </button>
              </form>
            ) : (
              <p className={common.help}>
                끝난 모집에는 새 댓글을 등록할 수 없어요. 기존 댓글 조회와 본인
                댓글 삭제는 가능해요.
              </p>
            ))}
          {busy === "remove" && (
            <p role="status" className={common.help}>
              댓글을 삭제하고 있어요.
            </p>
          )}
          <ConfirmDialog
            open={target !== null}
            title="댓글을 삭제할까요?"
            confirmLabel="댓글 삭제"
            confirmDisabled={pending || needsReview}
            danger
            onClose={() => setTarget(null)}
            onConfirm={() => void mutate("remove")}
            restoreFocus={() => {
              if (opener.current?.isConnected && !opener.current.disabled)
                opener.current.focus();
              else heading.current?.focus();
            }}
          >
            <p>삭제한 댓글은 되돌릴 수 없어요.</p>
          </ConfirmDialog>
        </>
      )}
    </section>
  );
}
