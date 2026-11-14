"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
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

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
});
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; item: CommentItem; follow: boolean };

/*
 * Chat rows in server order: a small date divider wherever the (KST) day
 * changes, then each message. `follow` marks a message right after one from
 * the same side (mine after mine, or the same author name) so the gap can be
 * tighter. Other people's name and avatar are still shown on every message:
 * the list only has display names, and two students can share one.
 */
function toRows(items: CommentItem[]): Row[] {
  const rows: Row[] = [];
  let lastDay = "";
  let previous: CommentItem | null = null;
  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = dayKey.format(date);
    if (key !== lastDay) {
      rows.push({ kind: "day", key, label: dayFormat.format(date) });
      lastDay = key;
      previous = null;
    }
    const follow =
      previous !== null &&
      previous.isMine === item.isMine &&
      (item.isMine || previous.authorName === item.authorName);
    rows.push({ kind: "message", item, follow });
    previous = item;
  }
  return rows;
}

const initials = (name: string) => Array.from(name).slice(-2).join("");

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
  // ids that appeared after the first load: only these play the entry motion
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const known = useRef<Set<string> | null>(null);
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
        const before = known.current;
        known.current = new Set(next.map((item) => item.id));
        setFresh(
          new Set(
            before
              ? next
                  .filter((item) => !before.has(item.id))
                  .map((item) => item.id)
              : [],
          ),
        );
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

  // The composer grows with its text; CSS caps the height and then scrolls.
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [draft, items]);

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
      <div className={styles.titleRow}>
        <h2
          id={`${id}-title`}
          ref={heading}
          tabIndex={-1}
          className={common.sectionTitle}
        >
          모집 문의
        </h2>
        <span className={styles.publicTag}>공개</span>
      </div>
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
          {!forbidden && items && (
            <div className={styles.thread}>
              {items.length === 0 ? (
                <p className={styles.empty}>
                  아직 댓글이 없어요. 첫 댓글을 남겨 보세요.
                </p>
              ) : (
                <ul className={styles.list}>
                  {toRows(items).map((row) =>
                    row.kind === "day" ? (
                      <li key={`day-${row.key}`} className={styles.day}>
                        <span>{row.label}</span>
                      </li>
                    ) : (
                      <Message
                        key={row.item.id}
                        item={row.item}
                        follow={row.follow}
                        fresh={fresh.has(row.item.id)}
                        deleteDisabled={pending || needsReview}
                        onDelete={(trigger) => {
                          opener.current = trigger;
                          setTarget(row.item);
                        }}
                      />
                    ),
                  )}
                </ul>
              )}
              {writable || draft !== "" ? (
                <form
                  className={styles.composer}
                  noValidate
                  aria-busy={busy === "create"}
                  onSubmit={submit}
                >
                  <label htmlFor={`${id}-content`} className={styles.srOnly}>
                    댓글 내용
                  </label>
                  <div
                    className={styles.inputRow}
                    data-invalid={fieldError ? true : undefined}
                  >
                    <textarea
                      ref={input}
                      id={`${id}-content`}
                      name="comment"
                      data-comment-input="true"
                      rows={1}
                      className={styles.input}
                      placeholder="댓글을 입력해 주세요"
                      value={draft}
                      readOnly={pending || needsReview || !writable}
                      aria-invalid={fieldError ? true : undefined}
                      aria-describedby={`${id}-help ${id}-count${fieldError ? ` ${id}-error` : ""}`}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        setFieldError(null);
                      }}
                      onFocus={(event) =>
                        keepComposerInView(event.currentTarget)
                      }
                    />
                    <button
                      type="submit"
                      className={styles.send}
                      aria-label={
                        busy === "create" ? "댓글 등록 중" : "댓글 등록"
                      }
                      disabled={pending || needsReview || !writable}
                    >
                      {busy === "create" ? "등록 중…" : "등록"}
                    </button>
                  </div>
                  <div className={styles.composerMeta}>
                    <p id={`${id}-help`} className={styles.hint}>
                      {writable
                        ? "참여하지 않아도 댓글을 남길 수 있어요. 개인정보는 적지 말아 주세요."
                        : "끝난 모집에는 새 댓글을 등록할 수 없어요. 작성 중이던 내용은 복사할 수 있어요."}
                    </p>
                    <span
                      id={`${id}-count`}
                      className={styles.count}
                      data-over={count > COMMENT_MAX}
                      aria-live="polite"
                    >
                      {count} / {COMMENT_MAX}자
                    </span>
                  </div>
                  {fieldError && (
                    <p id={`${id}-error`} className={common.error}>
                      {fieldError}
                    </p>
                  )}
                </form>
              ) : (
                <p className={styles.closedNote}>
                  끝난 모집에는 새 댓글을 등록할 수 없어요. 기존 댓글 조회와
                  본인 댓글 삭제는 가능해요.
                </p>
              )}
            </div>
          )}
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

/*
 * One chat row. Others: avatar + name above a white outlined bubble, time
 * to the right. Mine: right side, light green bubble, time and a small "more"
 * button to its left. The author name stays in the row for screen readers.
 */
function Message({
  item,
  follow,
  fresh,
  deleteDisabled,
  onDelete,
}: {
  item: CommentItem;
  follow: boolean;
  fresh: boolean;
  deleteDisabled: boolean;
  onDelete: (trigger: HTMLButtonElement) => void;
}) {
  const bubbleId = useId();
  return (
    <li
      className={styles.row}
      data-mine={item.isMine || undefined}
      data-follow={follow || undefined}
      data-new={fresh || undefined}
    >
      {item.isMine ? (
        <span className={styles.srOnly}>{item.authorName} · 나</span>
      ) : (
        <div className={styles.author}>
          <span className={styles.avatar} aria-hidden="true">
            {initials(item.authorName)}
          </span>
          <strong className={styles.name}>{item.authorName}</strong>
        </div>
      )}
      <div className={styles.line}>
        <p id={bubbleId} className={styles.bubble}>
          {item.content}
        </p>
        <div className={styles.side}>
          {item.isMine && (
            <MineMenu
              describedBy={bubbleId}
              disabled={deleteDisabled}
              onDelete={onDelete}
            />
          )}
          <time dateTime={item.createdAt} className={styles.time}>
            {timeFormat.format(new Date(item.createdAt))}
          </time>
        </div>
      </div>
    </li>
  );
}

/*
 * Small always-visible "more" button next to my message with one action,
 * "댓글 삭제". Works by touch, mouse and keyboard: Enter/Space opens it and
 * focuses the item, Escape or leaving closes it and returns focus. The item
 * opens the existing delete confirmation; nothing is deleted here.
 */
function MineMenu({
  describedBy,
  disabled,
  onDelete,
}: {
  describedBy: string;
  disabled: boolean;
  onDelete: (trigger: HTMLButtonElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const shown = open && !disabled;

  useEffect(() => {
    if (!shown) return;
    item.current?.focus();
    const away = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [shown]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && shown) {
      event.stopPropagation();
      close(true);
    }
  }

  return (
    <div
      ref={wrap}
      className={styles.more}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!wrap.current?.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={styles.moreButton}
        aria-label="내 댓글 더보기"
        aria-describedby={describedBy}
        aria-haspopup="menu"
        aria-expanded={shown}
        aria-controls={shown ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="6" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18" cy="12" r="1.7" />
        </svg>
      </button>
      {shown && (
        <div id={menuId} role="menu" className={styles.menu}>
          <button
            ref={item}
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              setOpen(false);
              if (trigger.current) onDelete(trigger.current);
            }}
          >
            댓글 삭제
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Phones: once the soft keyboard has opened (it resizes the visual viewport
 * a moment after focus), bring the whole composer — input and 등록 — above
 * it. CSS keeps it pinned to the bottom while focused.
 */
function keepComposerInView(field: HTMLElement) {
  const composer = field.closest("form") ?? field;
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    if (document.activeElement !== field) return;
    composer.scrollIntoView?.({
      block: "end",
      behavior: still ? "auto" : "smooth",
    });
  }, 300);
}
