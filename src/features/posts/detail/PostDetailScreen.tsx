"use client";

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
  ParticipationCancel,
  ParticipationPanel,
} from "@/features/participation/ParticipationPanel";
import { useParticipation } from "@/features/participation/useParticipation";
import { AppShell } from "../AppShell";
import { postQueryHref } from "../posts";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  authorActions,
  canReport,
  detailStatus,
  effectiveStatus,
  PostDetailError,
  remainingLabel,
  toPostDetail,
  toSnapshot,
  visibleDetails,
  type PostDetail,
  type PostDetailOperations,
} from "./postDetail";
import { postDetailOperations } from "./postDetailApi";
import { MoreMenu } from "./MoreMenu";
import { ReportDialog } from "./ReportDialog";
import styles from "./detail.module.css";
import { useAppPath } from "@/features/demo/AppProviders";
import { BagArt, SeatSlots, TaxiArt } from "@/features/ui/art";
import { dayLabel, dayTime, formatDate } from "@/lib/dateFormat";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The 참여자 안내 section; 내 활동 links here for 모임 장소 보기. */
export const GUIDE_ID = "participant-guide";

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
  const path = useAppPath();
  return (
    <AppShell current="posts" postsPath={listPath} wide>
      <Link href={path(listPath)} className={styles.back}>
        <span aria-hidden="true">‹</span> 모집글 목록
      </Link>
      <RequireAuth>
        <DetailLoader
          key={postId}
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
  const path = useAppPath();
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
        <Link href={path(listPath)} className={styles.secondary}>
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
        <Link
          href={path(
            postQueryHref(listPath, {
              type: detail.type,
              joinableOnly: true,
              page: 0,
            }),
          )}
          className={styles.secondary}
        >
          다른 모집 보기
        </Link>
      </div>
    );
  }
  return (
    <DetailView
      key={attempt}
      initial={detail}
      listPath={listPath}
      operations={operations}
      commentOperations={commentOperations}
      notice={notice}
      onReload={reload}
    />
  );
}

function DetailView({
  initial,
  listPath,
  operations,
  commentOperations,
  notice,
  onReload,
}: {
  initial: PostDetail;
  listPath: string;
  operations: PostDetailOperations;
  commentOperations: CommentsOperations;
  notice: { tone: "success" | "error"; text: string } | null;
  onReload: (
    notice?: { tone: "success" | "error"; text: string } | null,
  ) => void;
}) {
  const { handleUnauthorized } = useAuth();
  const path = useAppPath();
  const [latest, setLatest] = useState(initial);
  const [menuNotice, setMenuNotice] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const report = operations.report;
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const reportNoticeRef = useRef<HTMLParagraphElement>(null);
  const guideRef = useRef<HTMLElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const id = initial.id;

  // 내 활동's 모임 장소 보기 links here with #participant-guide.
  useEffect(() => {
    // Only on arrival.
    if (window.location.hash === `#${GUIDE_ID}`) showGuide();
  }, []);

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
  const serverNow = participation.serverNow;
  // participation.nowMs only moves at the cutoff and T; the summary's
  // "n분 남음" needs a slower, steady tick of its own.
  const [tick, setTick] = useState(nowMs);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(serverNow()), 30_000);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  const clockMs = Math.max(nowMs, tick);

  // Counts, status and names follow the latest participation result.
  const detail: PostDetail = {
    ...latest,
    status: participation.snapshot.status,
    currentMemberCount: participation.snapshot.currentMemberCount,
    capacity: participation.snapshot.capacity,
    joinable: participation.snapshot.joinable,
    participationDeadline: participation.snapshot.participationDeadline,
    recruitmentStatus: participation.snapshot.recruitmentStatus,
    relation: participation.snapshot.viewerRelation as PostDetail["relation"],
  };
  const status = effectiveStatus(detail, nowMs);
  const chip = detailStatus(detail, nowMs);
  const visible = visibleDetails(detail, nowMs);
  const author = detail.relation === "AUTHOR";
  const joined = detail.relation === "JOINED";
  const taxi = detail.type === "TAXI";
  const reference = Date.parse(detail.referenceTime);
  const deadline = participation.availability.deadline;
  const history = chip.history;
  const closed = chip.label !== "모집 중";
  const scheduleTerm = taxi ? "출발" : "주문 마감";
  const day = dayLabel(reference, clockMs);
  const deadlineDay = dayLabel(deadline, clockMs);
  const left = remainingLabel(deadline, clockMs);
  const similar = !author && !joined && chip.label === "정원 마감";
  // Closed by the author or cancelled: nothing to join here, so point to
  // other pods of the same type right under the explanation.
  const others =
    !author &&
    (status === "CANCELLED" || (!joined && chip.label === "작성자 마감"));
  const guideShown = (joined && !history) || !!visible.communicationUrl;

  function showGuide() {
    const section = guideRef.current;
    if (!section) return;
    const still = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    section.scrollIntoView?.({
      block: "start",
      behavior: still ? "auto" : "smooth",
    });
    section.focus({ preventScroll: true });
  }
  const remaining = detail.capacity - detail.currentMemberCount;
  const reportable = !author && canReport(latest) && !!report;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMenuNotice("링크를 복사했어요.");
    } catch {
      setMenuNotice("링크를 복사하지 못했어요. 주소창의 링크를 복사해 주세요.");
    }
  }

  return (
    <article
      className={styles.detail}
      aria-labelledby="post-title"
      data-closed={closed}
    >
      <header className={styles.top}>
        <div className={styles.topRow}>
          <span
            className={styles.sticker}
            data-type={taxi ? "taxi" : "delivery"}
            data-muted={closed}
          >
            {taxi ? <TaxiArt size="lg" /> : <BagArt size="lg" />}
          </span>
          <p className={styles.chips}>
            <span className={styles.chip}>{taxi ? "택시" : "배달"}</span>
            <span className={styles.status} data-history={closed}>
              {chip.label}
            </span>
            {chip.joined && (
              <span className={styles.chip} data-joined="true">
                참여 중
              </span>
            )}
            {author && (
              <span className={styles.chip} data-mine="true">
                내 모집글
              </span>
            )}
          </p>
          <MoreMenu
            items={[
              { label: "링크 복사", onSelect: () => void copyLink() },
              ...(author
                ? []
                : [
                    {
                      label: latest.reported ? "신고 완료" : "신고하기",
                      tone: "danger" as const,
                      disabled: !reportable,
                      onSelect: () => setReportOpen(true),
                    },
                  ]),
            ]}
          />
        </div>
        <div className={styles.route}>
          <h1 id="post-title" className={styles.title}>
            {taxi ? (
              <>
                <span className={styles.stop}>
                  {detail.departure}
                  <span className={styles.srOnly}>에서</span>
                </span>
                <span className={styles.stop} data-end="true">
                  {detail.destination}
                </span>
              </>
            ) : (
              <span className={styles.stop}>{detail.restaurantName}</span>
            )}
          </h1>
          {!taxi && (
            <p className={styles.stop} data-end="true">
              <span className={styles.stopMeta}>
                수령 장소 · {detail.pickupLocation}
              </span>
            </p>
          )}
        </div>
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>{scheduleTerm}</dt>
            <dd>
              <strong>
                {day} {timeFormat.format(reference)}
              </strong>
              {day !== formatDate(reference) && (
                <span>{formatDate(reference)}</span>
              )}
            </dd>
          </div>
          {status !== "CANCELLED" && Number.isFinite(deadline) && (
            <div className={styles.fact}>
              <dt>{taxi ? "신청·취소 마감" : "참여·취소 마감"}</dt>
              <dd>
                <strong>
                  {deadlineDay} {timeFormat.format(deadline)}
                </strong>
                <span
                  data-urgent={left !== null && deadline - clockMs < 3_600_000}
                >
                  {left ?? "마감됐어요"}
                </span>
              </dd>
            </div>
          )}
        </dl>
        {menuNotice && (
          <p role="status" className={styles.success}>
            {menuNotice}
          </p>
        )}
        <p className={styles.postTitle}>{detail.title}</p>
        <p className={styles.byline}>
          <span className={styles.avatar} aria-hidden="true">
            {Array.from(detail.authorName ?? "")
              .slice(-2)
              .join("")}
          </span>
          <span>
            <span className={styles.bylineName}>{detail.authorName}</span>
            {detail.createdAt &&
              ` · ${formatDate(Date.parse(detail.createdAt), { time: true })} 작성`}
          </span>
        </p>
      </header>

      {guideShown && (
        <section
          ref={guideRef}
          id={GUIDE_ID}
          tabIndex={-1}
          className={styles.joinedInfo}
          aria-labelledby="post-link"
        >
          <h2 id="post-link" className={styles.sectionTitle}>
            참여자 안내
          </h2>
          <p className={styles.place}>
            <span className={styles.meta}>
              {taxi ? "만나는 곳" : "수령 장소"}
            </span>
            <strong>{taxi ? detail.departure : detail.pickupLocation}</strong>
          </p>
          <p className={styles.place}>
            <span className={styles.meta}>{scheduleTerm}</span>
            <strong>{dayTime(reference, clockMs)}</strong>
          </p>
          {author && visible.communicationUrl && (
            <a
              href={visible.communicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.primary}
            >
              오픈채팅 열기 <span className={styles.srOnly}>(새 창)</span>
            </a>
          )}
          <p className={styles.help}>
            {visible.communicationUrl
              ? `오픈채팅 링크는 작성자와 참여한 학생에게만 보여요. ${scheduleTerm} 시간이 지나면 사라져요.`
              : "작성자가 등록한 소통 링크가 없어요. 아래 모집 문의로 이야기해요."}
          </p>
          {joined && !history && (
            <ParticipationCancel
              participation={participation}
              onFocusFallback={() => guideRef.current?.focus()}
            />
          )}
        </section>
      )}

      <div className={styles.decision}>
        {author ? (
          <AuthorPanel
            detail={detail}
            nowMs={nowMs}
            serverNow={participation.serverNow}
            operations={operations}
            onReload={onReload}
            onUnauthorized={handleUnauthorized}
          />
        ) : (
          <ParticipationPanel
            participation={participation}
            schedule={false}
            joinedAction={
              visible.communicationUrl ? (
                <a
                  href={visible.communicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.barPrimary}
                >
                  오픈채팅 열기 <span className={styles.srOnly}>(새 창)</span>
                </a>
              ) : guideShown ? (
                <button
                  type="button"
                  className={styles.barPrimary}
                  onClick={showGuide}
                >
                  모임 장소 보기
                </button>
              ) : undefined
            }
          />
        )}
        {history && (
          <p className={styles.notice}>
            {status === "CANCELLED"
              ? "작성자가 취소한 모집이에요. 기록으로만 볼 수 있어요."
              : "일정이 끝난 모집이에요. 기록으로만 볼 수 있어요."}
          </p>
        )}
        {others && (
          <Link
            href={path(
              postQueryHref(listPath, {
                type: detail.type,
                joinableOnly: true,
                page: 0,
              }),
            )}
            className={styles.secondary}
          >
            다른 모집 보기
          </Link>
        )}
        {similar && (
          <Link
            href={path(
              postQueryHref(listPath, {
                type: detail.type,
                joinableOnly: true,
                page: 0,
              }),
            )}
            className={styles.secondary}
          >
            비슷한 {taxi ? "택시" : "배달"} 모집 보기
          </Link>
        )}
      </div>

      <div className={styles.body}>
        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={notice.tone === "error" ? styles.alert : styles.success}
          >
            {notice.text}
          </p>
        )}
        {!taxi && detail.orderGuide && (
          <dl className={styles.info}>
            <div className={styles.infoRow}>
              <dt className={styles.meta}>주문 안내</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>{detail.orderGuide}</dd>
            </div>
          </dl>
        )}

        <section className={styles.section} aria-labelledby="post-description">
          <h2 id="post-description" className={styles.sectionTitle}>
            모임 안내
          </h2>
          <p className={styles.description}>{detail.description}</p>
        </section>

        <section className={styles.section} aria-labelledby="post-members">
          <h2 id="post-members" className={styles.sectionTitle}>
            함께하는 학생
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
                      {chip.label === "모집 중" ? "참여 가능" : "참여 마감"}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className={styles.help}>
              참가자 이름은 작성자와 참여한 학생에게만 보여요.
            </p>
          )}
        </section>

        <aside className={styles.guide} aria-labelledby="post-guide">
          <h2 id="post-guide" className={styles.label}>
            참여 안내
          </h2>
          <ul>
            <li>
              작성자가 마감하거나 {taxi ? "신청·취소" : "참여·취소"} 마감 시간이
              지나면 새로 참여할 수 없어요.
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
              report ? (
                <button
                  type="button"
                  className={styles.reportButton}
                  onClick={() => setReportOpen(true)}
                >
                  이 모집글 신고하기
                </button>
              ) : (
                <p className={styles.meta}>신고 기능은 준비 중이에요.</p>
              )
            ) : (
              latest.reported && (
                <p className={styles.meta}>이미 신고한 모집이에요.</p>
              )
            )}
          </div>
        )}

        <ReportDialog
          open={reportOpen && !!report}
          onSubmit={(request) =>
            report ? report(id, request) : Promise.resolve()
          }
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
      </div>
    </article>
  );
}

type Action = "close" | "cancel";

function AuthorPanel({
  detail,
  nowMs,
  serverNow,
  operations,
  onReload,
  onUnauthorized,
}: {
  detail: PostDetail;
  nowMs: number;
  serverNow: () => number;
  operations: PostDetailOperations;
  onReload: (
    notice?: { tone: "success" | "error"; text: string } | null,
  ) => void;
  onUnauthorized: () => void;
}) {
  const [confirm, setConfirm] = useState<Action | null>(null);
  const path = useAppPath();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const actions = authorActions(detail, nowMs);
  const status = effectiveStatus(detail, nowMs);
  const remaining = detail.capacity - detail.currentMemberCount;
  const taxi = detail.type === "TAXI";

  async function run(action: Action) {
    const operation = operations[action];
    if (
      !operation ||
      locked.current ||
      !authorActions(detail, serverNow())[action]
    )
      return;
    setConfirm(null);
    locked.current = true;
    setBusy(action);
    setError(null);
    try {
      await operation(detail.id);
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
      ref={panel}
      tabIndex={-1}
      className={styles.card}
      aria-labelledby="author-panel"
      aria-busy={!!busy}
    >
      <div className={styles.manageHead}>
        <h2 id="author-panel" className={styles.sectionTitle}>
          내 모집글 관리
        </h2>
        {actions.edit && (
          <Link
            href={path(`/posts/${encodeURIComponent(detail.id)}/edit`)}
            className={styles.manageSecondary}
          >
            모집글 수정
          </Link>
        )}
      </div>
      <SeatSlots
        className={styles.seats}
        total={detail.capacity}
        filled={detail.currentMemberCount}
      />
      <p className={styles.cardCount}>
        현재 {detail.currentMemberCount} / {detail.capacity}명
        <span className={styles.cardCountMeta}> · 작성자 포함</span>
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
              ? "직접 마감한 모집이에요. 참여자가 줄어도 다시 열리지 않고, 일정과 소통 링크는 그대로예요."
              : status === "CANCELLED"
                ? "취소한 모집이에요."
                : "모집이 끝났어요."}
      </p>

      {(actions.close || actions.cancel) && (
        <div className={styles.manageRow}>
          {actions.close && (
            <button
              type="button"
              className={styles.managePrimary}
              disabled={!!busy || !operations.close}
              onClick={() => setConfirm("close")}
            >
              {busy === "close" ? "마감하는 중…" : "모집 마감하기"}
            </button>
          )}
          {actions.cancel && (
            <button
              type="button"
              className={styles.manageDanger}
              disabled={!!busy || !operations.cancel}
              onClick={() => setConfirm("cancel")}
            >
              {busy === "cancel" ? "취소하는 중…" : "모집 취소하기"}
            </button>
          )}
        </div>
      )}
      {(actions.close || actions.cancel) && (
        <ul className={styles.manageNotes}>
          {actions.close && (
            <li>
              <strong>현재 인원으로 모집 마감</strong>
              {operations.close
                ? `지금 ${detail.currentMemberCount}명으로 확정하고 새 참여를 막아요. 일정과 소통 링크는 그대로예요.`
                : "모집 마감 기능은 준비 중이에요."}
            </li>
          )}
          {actions.cancel && (
            <li>
              <strong>모집 취소 (일정 자체 취소)</strong>
              {operations.cancel
                ? "모임이 없어지고 참여자에게는 '모집 취소'로 보여요. 되돌릴 수 없어요."
                : "모집 취소 기능은 준비 중이에요."}
            </li>
          )}
        </ul>
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
        confirmDisabled={!actions.close}
        restoreFocus={!actions.close ? () => panel.current?.focus() : undefined}
        onClose={() => setConfirm(null)}
        onConfirm={() => void run("close")}
      >
        <p>
          지금 {detail.currentMemberCount}명으로 확정해요. 새로 참여할 수 없고,
          참여자가 줄어도 다시 열리지 않아요. 일정과 소통 링크는 그대로
          유지돼요.
        </p>
        {!actions.close && (
          <p role="status">
            모집 상태가 바뀌었거나 기준시각이 지나 더 이상 처리할 수 없어요.
          </p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "cancel"}
        title="모집을 취소할까요?"
        confirmLabel="모집 취소"
        confirmDisabled={!actions.cancel}
        restoreFocus={
          !actions.cancel ? () => panel.current?.focus() : undefined
        }
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => void run("cancel")}
      >
        <p>
          모임 일정 자체가 없어지고, 참여한 학생의 참여도 함께 취소돼요.
          참여자에게는 &lsquo;모집 취소&rsquo;로 보이고, 되돌릴 수 없어요.
        </p>
        {!actions.cancel && (
          <p role="status">
            모집 상태가 바뀌었거나 기준시각이 지나 더 이상 처리할 수 없어요.
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}
