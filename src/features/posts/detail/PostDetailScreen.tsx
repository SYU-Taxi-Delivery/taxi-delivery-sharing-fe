"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { AccessDenied, RequireAuth } from "@/features/auth/RequireAuth";
import { CommentsPanel } from "@/features/comments/CommentsPanel";
import {
  commentsOperations,
  type CommentsOperations,
} from "@/features/comments/comments";
import {
  cutoffMinutes,
  participationDeadlineMs,
} from "@/features/participation/participation";
import { ParticipationPanel } from "@/features/participation/ParticipationPanel";
import { useParticipation } from "@/features/participation/useParticipation";
import { AppShell } from "../AppShell";
import { postStatusLabel } from "../posts";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  authorActions,
  canReport,
  effectiveStatus,
  PostDetailError,
  toPostDetail,
  toSnapshot,
  visibleDetails,
  type PostDetail,
  type PostDetailOperations,
} from "./postDetail";
import { postDetailOperations } from "./postDetailApi";
import { ReportDialog } from "./ReportDialog";
import styles from "./detail.module.css";

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const shortDateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function PostDetailScreen({
  postId,
  listPath = "/posts",
  operations = postDetailOperations,
  commentOperations = commentsOperations,
}: {
  postId: string;
  listPath?: string;
  operations?: PostDetailOperations;
  commentOperations?: CommentsOperations;
}) {
  return (
    <AppShell current="posts" postsPath={listPath}>
      <Link href={listPath} className={styles.back}>
        <span aria-hidden="true">‹</span> 모집글 목록
      </Link>
      <RequireAuth>
        <DetailLoader
          postId={postId}
          listPath={listPath}
          operations={operations}
          commentOperations={commentOperations}
        />
      </RequireAuth>
    </AppShell>
  );
}

type Loaded =
  | { key: number; detail: PostDetail; error?: undefined }
  | {
      key: number;
      error: "notFound" | "forbidden" | "failed";
      detail?: undefined;
    };

function DetailLoader({
  postId,
  listPath,
  operations,
  commentOperations,
}: {
  postId: string;
  listPath: string;
  operations: PostDetailOperations;
  commentOperations: CommentsOperations;
}) {
  const { handleUnauthorized } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Message shown after a reload, e.g. the result of closing the post.
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    operations
      .load(postId)
      .then((raw) => {
        if (active) setLoaded({ key: attempt, detail: toPostDetail(raw) });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          handleUnauthorized();
          return;
        }
        const status = error instanceof ApiError ? error.status : undefined;
        setLoaded({
          key: attempt,
          error:
            status === 404 ||
            (error instanceof PostDetailError && error.kind === "notFound")
              ? "notFound"
              : status === 403 ||
                  (error instanceof PostDetailError &&
                    error.kind === "forbidden")
                ? "forbidden"
                : "failed",
        });
      });
    return () => {
      active = false;
    };
  }, [attempt, postId, operations, handleUnauthorized]);

  const reload = (next: typeof notice = null) => {
    setNotice(next);
    setAttempt((value) => value + 1);
  };

  const current = loaded?.key === attempt ? loaded : null;
  if (!current) {
    return (
      <p role="status" className={styles.state}>
        모집 정보를 불러오고 있어요.
      </p>
    );
  }
  if (current.error === "forbidden") return <AccessDenied />;
  if (current.error === "notFound") {
    return (
      <div className={styles.state}>
        <h1 className={styles.stateTitle}>모집을 찾을 수 없어요</h1>
        <p>삭제되었거나 주소가 잘못된 모집이에요.</p>
        <Link href={listPath} className={styles.secondary}>
          모집글 목록으로
        </Link>
      </div>
    );
  }
  if (current.error === "failed") {
    return (
      <div className={styles.state}>
        <p role="alert">
          모집 정보를 불러오지 못했어요. 네트워크를 확인한 후 다시 시도해
          주세요.
        </p>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => reload()}
        >
          다시 불러오기
        </button>
      </div>
    );
  }
  const { detail } = current;
  if (!detail) return null;
  // REMOVED content is never shown on the general detail (AC-DISC-004-05).
  if (detail.status === "REMOVED") {
    return (
      <div className={styles.state}>
        <h1 className={styles.stateTitle}>삭제된 모집이에요</h1>
        <p>운영 정책에 따라 삭제되어 내용을 볼 수 없어요.</p>
        <Link href={listPath} className={styles.secondary}>
          모집글 목록으로
        </Link>
      </div>
    );
  }
  return (
    <DetailView
      key={attempt}
      initial={detail}
      operations={operations}
      commentOperations={commentOperations}
      notice={notice}
      onReload={reload}
    />
  );
}

function DetailView({
  initial,
  operations,
  commentOperations,
  notice,
  onReload,
}: {
  initial: PostDetail;
  operations: PostDetailOperations;
  commentOperations: CommentsOperations;
  notice: { tone: "success" | "error"; text: string } | null;
  onReload: (
    notice?: { tone: "success" | "error"; text: string } | null,
  ) => void;
}) {
  const { handleUnauthorized } = useAuth();
  const [latest, setLatest] = useState(initial);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const reportNoticeRef = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const id = initial.id;

  // The report button disappears after reporting, so focus moves to the result.
  useEffect(() => {
    if (reportNotice) reportNoticeRef.current?.focus();
  }, [reportNotice]);

  const participationOps = useMemo(
    () => ({
      join: () => operations.join(id),
      cancel: () => operations.leave(id),
      refresh: async () => {
        try {
          const next = toPostDetail(await operations.load(id));
          setLatest(next);
          return toSnapshot(next);
        } catch (error) {
          if (mounted.current) {
            if (error instanceof ApiError && error.status === 401) {
              handleUnauthorized();
            } else if (
              (error instanceof ApiError &&
                (error.status === 403 || error.status === 404)) ||
              (error instanceof PostDetailError &&
                (error.kind === "forbidden" || error.kind === "notFound"))
            ) {
              onReload();
            }
          }
          throw error;
        }
      },
    }),
    [operations, id, handleUnauthorized, onReload],
  );
  const participation = useParticipation(toSnapshot(initial), participationOps);
  const nowMs = participation.nowMs;

  // Counts, status and names follow the latest participation result.
  const detail: PostDetail = {
    ...latest,
    status: participation.snapshot.status,
    currentMemberCount: participation.snapshot.currentMemberCount,
    capacity: participation.snapshot.capacity,
    joinable: participation.snapshot.joinable,
    relation: participation.snapshot.viewerRelation as PostDetail["relation"],
  };
  const status = effectiveStatus(detail, nowMs);
  const shown = { ...detail, status };
  const label = postStatusLabel(shown).label;
  const visible = visibleDetails(detail, nowMs);
  const author = detail.relation === "AUTHOR";
  const taxi = detail.type === "TAXI";
  const reference = Date.parse(detail.referenceTime);
  const history = status === "FINISHED" || status === "CANCELLED";
  const remaining = detail.capacity - detail.currentMemberCount;

  return (
    <article className={styles.detail} aria-labelledby="post-title">
      <header className={styles.top}>
        <h1 id="post-title" className={styles.title}>
          {taxi ? (
            <>
              <span className="block">{detail.departure}</span>
              <span className={styles.titleRow}>
                <Image
                  src="/posts/arrow.svg"
                  width={20}
                  height={20}
                  alt="에서"
                />
                {detail.destination}
              </span>
            </>
          ) : (
            detail.restaurantName
          )}
        </h1>
        <p className={styles.chips}>
          <span className={styles.status} data-history={history}>
            {status === "FINISHED" ? "모집 완료" : label}
          </span>
          {author && <span className={styles.chip}>내 모집글</span>}
          <span className={styles.meta}>
            {taxi ? "택시" : "배달"} ·{" "}
            {taxi
              ? `${detail.departure} 출발`
              : `${detail.pickupLocation} 수령`}
          </span>
        </p>
        <p className={styles.meta}>
          {detail.authorName}
          {detail.createdAt &&
            ` · ${shortDateTime.format(Date.parse(detail.createdAt))} 작성`}
        </p>
        <p className={styles.postTitle}>{detail.title}</p>
      </header>

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={notice.tone === "error" ? styles.alert : styles.success}
        >
          {notice.text}
        </p>
      )}
      {history && (
        <p className={styles.notice}>
          {status === "CANCELLED"
            ? "작성자가 취소한 모집이에요. 기록으로만 볼 수 있어요."
            : "완료된 모집이에요. 기록으로만 볼 수 있어요."}
        </p>
      )}

      <dl className={styles.info}>
        {taxi ? (
          <>
            <Row term="출발지" value={detail.departure} />
            <Row term="도착지" value={detail.destination} />
            <Row term="출발 시간" value={dateTime.format(reference)} strong />
          </>
        ) : (
          <>
            <Row term="음식점" value={detail.restaurantName} />
            <Row term="수령 장소" value={detail.pickupLocation} />
            <Row term="주문 마감" value={dateTime.format(reference)} strong />
          </>
        )}
        <Row
          term="정원"
          value={`${detail.currentMemberCount} / ${detail.capacity}명 · 작성자 포함`}
        />
        <Row
          term="참여 취소 기한"
          value={`${shortDateTime.format(participationDeadlineMs(detail))}까지`}
        />
        {!taxi && detail.orderGuide && (
          <Row term="주문 안내" value={detail.orderGuide} multiline />
        )}
      </dl>

      <section className={styles.section} aria-labelledby="post-description">
        <h2 id="post-description" className={styles.sectionTitle}>
          모임 안내
        </h2>
        <p className={styles.description}>{detail.description}</p>
      </section>

      <section className={styles.section} aria-labelledby="post-members">
        <h2 id="post-members" className={styles.sectionTitle}>
          함께하는 학생 {detail.currentMemberCount} / {detail.capacity}명
        </h2>
        {visible.participantNames ? (
          <ul className={styles.members}>
            {visible.participantNames.map((name, index) => (
              <li key={`${name}-${index}`} className={styles.member}>
                <span className={styles.avatar} aria-hidden="true">
                  {Array.from(name).slice(-2).join("")}
                </span>
                <span className="font-bold">{name}</span>
                <span className={styles.meta}>
                  {index === 0 ? "작성자" : "참여자"}
                </span>
              </li>
            ))}
            {!history &&
              Array.from({ length: Math.max(0, remaining) }, (_, index) => (
                <li key={`seat-${index}`} className={styles.seat}>
                  <span>빈자리</span>
                  <span className={styles.meta}>
                    {status === "OPEN" ? "참여 가능" : "참여 마감"}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className={styles.help}>
            {remaining > 0 && !history ? `${remaining}자리 남았어요. ` : ""}
            참가자 이름은 작성자와 참여한 학생에게만 보여요.
          </p>
        )}
      </section>

      {visible.communicationUrl && (
        <section className={styles.section} aria-labelledby="post-link">
          <h2 id="post-link" className={styles.sectionTitle}>
            소통 링크
          </h2>
          <a
            href={visible.communicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
          >
            소통 링크 열기 <span className={styles.srOnly}>(새 창)</span>
          </a>
          <p className={styles.help}>
            작성자와 참여한 학생에게만 보여요. 출발 시간이 지나면 사라져요.
          </p>
        </section>
      )}

      {author ? (
        <AuthorPanel
          detail={detail}
          nowMs={nowMs}
          operations={operations}
          onReload={onReload}
          onUnauthorized={handleUnauthorized}
        />
      ) : (
        <ParticipationPanel participation={participation} />
      )}

      {author && (
        <p className={styles.notice}>
          본인이 작성한 글이에요. 작성자도 정원에 포함돼요.
        </p>
      )}

      <aside className={styles.guide} aria-labelledby="post-guide">
        <h2 id="post-guide" className={styles.label}>
          참여 안내
        </h2>
        <ul>
          <li>정원이 차면 자동으로 모집이 마감돼요.</li>
          <li>
            작성자가 마감하거나 {taxi ? "출발" : "주문 마감"} 시간이 지나면
            참여할 수 없어요.
          </li>
          <li>
            참여 취소는 {taxi ? "출발" : "주문 마감"} {cutoffMinutes(detail)}분
            전까지 할 수 있어요.
          </li>
          <li>본인이 작성한 글에는 참여할 수 없어요.</li>
        </ul>
      </aside>

      <CommentsPanel
        postId={id}
        status={status}
        referenceTime={detail.referenceTime}
        serverNow={participation.serverNow}
        operations={commentOperations}
        onUnavailable={() => onReload()}
      />

      {!author && (
        <div className={styles.report}>
          {reportNotice && (
            <p
              ref={reportNoticeRef}
              tabIndex={-1}
              role="status"
              className={styles.success}
            >
              {reportNotice}
            </p>
          )}
          {canReport(latest) ? (
            <button
              type="button"
              className={styles.reportButton}
              onClick={() => setReportOpen(true)}
            >
              이 모집글 신고하기
            </button>
          ) : (
            latest.reported && (
              <p className={styles.meta}>이미 신고한 모집이에요.</p>
            )
          )}
        </div>
      )}

      <ReportDialog
        open={reportOpen}
        onSubmit={(request) => operations.report(id, request)}
        onClose={() => setReportOpen(false)}
        onUnauthorized={handleUnauthorized}
        onDone={(outcome) => {
          setReportOpen(false);
          setLatest((value) => ({ ...value, reported: true }));
          setReportNotice(
            outcome === "submitted"
              ? "신고가 접수됐어요. 운영자가 확인할 예정이에요."
              : "이미 신고한 모집이에요. 같은 모집은 한 번만 신고할 수 있어요.",
          );
        }}
      />
    </article>
  );
}

function Row({
  term,
  value,
  strong = false,
  multiline = false,
}: {
  term: string;
  value: string;
  strong?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className={styles.infoRow}>
      <dt className={styles.meta}>{term}</dt>
      <dd
        className={strong ? "font-bold" : undefined}
        style={multiline ? { whiteSpace: "pre-wrap" } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

type Action = "close" | "cancel";

function AuthorPanel({
  detail,
  nowMs,
  operations,
  onReload,
  onUnauthorized,
}: {
  detail: PostDetail;
  nowMs: number;
  operations: PostDetailOperations;
  onReload: (
    notice?: { tone: "success" | "error"; text: string } | null,
  ) => void;
  onUnauthorized: () => void;
}) {
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const actions = authorActions(detail, nowMs);
  const status = effectiveStatus(detail, nowMs);
  const remaining = detail.capacity - detail.currentMemberCount;
  const taxi = detail.type === "TAXI";

  async function run(action: Action) {
    if (locked.current) return;
    setConfirm(null);
    locked.current = true;
    setBusy(action);
    setError(null);
    try {
      await operations[action](detail.id);
      onReload({
        tone: "success",
        text:
          action === "close"
            ? "모집을 마감했어요. 이제 새로 참여할 수 없어요."
            : "모집을 취소했어요. 참여한 학생의 참여도 함께 취소됐어요.",
      });
    } catch (failure) {
      locked.current = false;
      setBusy(null);
      if (failure instanceof ApiError && failure.status === 401) {
        onUnauthorized();
        return;
      }
      if (failure instanceof PostDetailError) {
        if (failure.kind === "conflict" || failure.kind === "notFound") {
          onReload({
            tone: "error",
            text: "모집 상태가 바뀌어 처리하지 못했어요. 최신 정보로 다시 불러왔어요.",
          });
          return;
        }
        if (failure.kind === "forbidden") {
          setError("이 모집을 관리할 권한이 없어요.");
          return;
        }
      }
      if (
        failure instanceof Error &&
        failure.name === "PostDetailNotConnectedError"
      ) {
        setError(
          "모집 관리 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요.",
        );
        return;
      }
      // A lost response does not prove failure; reload instead of resending.
      setError(
        `${action === "close" ? "마감" : "취소"} 결과를 확인하지 못했어요. 최신 정보를 다시 불러와 확인해 주세요.`,
      );
    }
  }

  return (
    <section
      className={styles.card}
      aria-labelledby="author-panel"
      aria-busy={!!busy}
    >
      <h2 id="author-panel" className={styles.sectionTitle}>
        내 모집글 관리
      </h2>
      <p className={styles.cardCount}>
        현재 {detail.currentMemberCount} / {detail.capacity}명
        {status === "OPEN" && remaining > 0 && (
          <span className={styles.remaining} data-last={remaining === 1}>
            {" "}
            · {remaining}자리 남음
          </span>
        )}
      </p>
      <p className={styles.help}>
        {status === "OPEN"
          ? `${remaining}명이 더 참여하면 정원 마감으로 자동 변경돼요.`
          : status === "FULL"
            ? "정원이 모두 찼어요."
            : status === "CLOSED"
              ? "직접 마감한 모집이에요. 참여자가 줄어도 다시 열리지 않아요."
              : status === "CANCELLED"
                ? "취소한 모집이에요."
                : "모집이 끝났어요."}
      </p>

      {actions.edit && (
        <Link
          href={`/posts/${encodeURIComponent(detail.id)}/edit`}
          className={styles.secondary}
        >
          모집글 수정
        </Link>
      )}
      {actions.close && (
        <div className={styles.action}>
          <button
            type="button"
            className={styles.primary}
            disabled={!!busy}
            onClick={() => setConfirm("close")}
          >
            {busy === "close" ? "마감하는 중…" : "모집 마감하기"}
          </button>
          <p className={styles.help}>
            현재 인원으로 {taxi ? "출발" : "주문"}해요. 마감하면 새로 참여할 수
            없어요.
          </p>
        </div>
      )}
      {actions.cancel && (
        <div className={styles.action}>
          <button
            type="button"
            className={styles.dangerOutline}
            disabled={!!busy}
            onClick={() => setConfirm("cancel")}
          >
            {busy === "cancel" ? "취소하는 중…" : "모집 취소하기"}
          </button>
          <p className={styles.help}>
            일정이 취소되면 모집을 취소해요. 취소한 글에는 참여할 수 없어요.
          </p>
        </div>
      )}
      {!actions.close && !actions.cancel && !actions.edit && (
        <p className={styles.help}>
          {taxi ? "출발" : "주문 마감"} 시간이 지났거나 끝난 모집이라 관리할 수
          있는 항목이 없어요.
        </p>
      )}
      {busy && (
        <p role="status" className={styles.help}>
          {busy === "close"
            ? "모집을 마감하고 있어요."
            : "모집을 취소하고 있어요."}
        </p>
      )}
      {error && (
        <div className={styles.alert} role="alert">
          <p>{error}</p>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => onReload()}
          >
            최신 정보 다시 불러오기
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirm === "close"}
        title="모집을 마감할까요?"
        confirmLabel="모집 마감"
        onClose={() => setConfirm(null)}
        onConfirm={() => void run("close")}
      >
        <p>
          현재 {detail.currentMemberCount}명으로 마감해요. 마감한 뒤에는 새로
          참여할 수 없고, 참여자가 줄어도 다시 열리지 않아요.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "cancel"}
        title="모집을 취소할까요?"
        confirmLabel="모집 취소"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => void run("cancel")}
      >
        <p>
          참여한 학생의 참여도 함께 취소되고, 되돌릴 수 없어요.
          {taxi ? " 출발" : " 주문 마감"} 시간 전까지만 취소할 수 있어요.
        </p>
      </ConfirmDialog>
    </section>
  );
}
