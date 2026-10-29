"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { AccessDenied, RequireAuth } from "@/features/auth/RequireAuth";
import { AppShell } from "@/features/posts/AppShell";
import { ConfirmDialog } from "@/features/posts/detail/ConfirmDialog";
import { REPORT_REASONS } from "@/features/posts/detail/postDetail";
import common from "@/features/posts/detail/detail.module.css";
import shell from "@/features/posts/posts.module.css";
import {
  AdminError,
  adminErrorMessage,
  adminOperations,
  toRemovalResult,
  toReportDetail,
  toReportList,
  type AdminOperations,
  type AdminReportDetail,
  type AdminReportSummary,
  type RemovalResult,
  type ReportResolution,
} from "./admin";
import styles from "./admin.module.css";

const statusLabels = {
  PENDING: "처리 대기",
  RESOLVED: "해결",
  REJECTED: "반려",
};
const postLabels = {
  OPEN: "모집 중",
  FULL: "정원 마감",
  CLOSED: "직접 마감",
  CANCELLED: "모집 취소",
  FINISHED: "모집 완료",
  REMOVED: "관리자에 의해 삭제된 모집",
};
const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const reasonLabel = (reason: AdminReportSummary["reason"]) =>
  REPORT_REASONS.find(({ value }) => value === reason)!.label;

export function AdminScreen({
  operations = adminOperations,
}: {
  operations?: AdminOperations;
}) {
  const { user } = useAuth();
  const [source, setSource] = useState({ operations, revision: 0 });
  if (source.operations !== operations)
    setSource({ operations, revision: source.revision + 1 });
  return (
    <AppShell current="admin">
      <h1 className={shell.title}>관리자</h1>
      <p className={`${shell.muted} mb-6 mt-2`}>
        신고를 확인하고 필요한 조치를 기록해요.
      </p>
      <RequireAuth role="ADMIN">
        {user && (
          <Workspace
            key={JSON.stringify([user.id, source.revision])}
            operations={operations}
          />
        )}
      </RequireAuth>
    </AppShell>
  );
}

function Workspace({ operations }: { operations: AdminOperations }) {
  const { handleUnauthorized } = useAuth();
  const [reports, setReports] = useState<AdminReportSummary[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [denied, setDenied] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [removal, setRemoval] = useState<RemovalResult | null>(null);
  const mounted = useRef(true);
  const listSequence = useRef(0);
  const selectionSequence = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const locked = useRef(false);
  const focusList = useRef(false);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const result = useRef<HTMLParagraphElement>(null);
  const hideButton = useRef<HTMLButtonElement>(null);

  const accessFailure = useCallback(
    (failure: unknown) => {
      if (failure instanceof ApiError && failure.status === 401) {
        setReports(null);
        setDetail(null);
        handleUnauthorized();
        return true;
      }
      if (
        (failure instanceof ApiError && failure.status === 403) ||
        (failure instanceof AdminError && failure.kind === "forbidden")
      ) {
        setReports(null);
        setDetail(null);
        setSelected(null);
        selectedRef.current = null;
        selectionSequence.current += 1;
        setDetailLoading(false);
        setConfirm(false);
        setDenied(true);
        return true;
      }
      return false;
    },
    [handleUnauthorized],
  );

  const readList = useCallback(() => {
    const ticket = ++listSequence.current;
    return operations
      .list()
      .then((raw) => {
        const next = toReportList(raw);
        if (!mounted.current || listSequence.current !== ticket) return false;
        setReports(next);
        setNotConnected(false);
        setDenied(false);
        return true;
      })
      .catch((failure: unknown) => {
        if (!mounted.current || listSequence.current !== ticket) return false;
        if (accessFailure(failure)) return false;
        if (failure instanceof AdminError && failure.kind === "notConnected") {
          setReports(null);
          setNotConnected(true);
        } else setListError(adminErrorMessage(failure));
        return false;
      })
      .finally(() => {
        if (mounted.current && listSequence.current === ticket)
          setListLoading(false);
      });
  }, [operations, accessFailure]);

  useEffect(() => {
    mounted.current = true;
    void readList();
    return () => {
      mounted.current = false;
      listSequence.current += 1;
      selectionSequence.current += 1;
    };
  }, [readList]);

  useEffect(() => {
    if (notice) result.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (selected && !detailLoading && !notice) detailHeading.current?.focus();
    else if (!selected && focusList.current) {
      focusList.current = false;
      listHeading.current?.focus();
    }
  }, [selected, detailLoading, notice]);

  function applyReport(next: AdminReportDetail) {
    setReports((current) =>
      current
        ? toReportList({
            content: current.map((item) => {
              if (item.id === next.id) return next;
              return item.postId === next.postId &&
                next.postStatus === "REMOVED"
                ? { ...item, postStatus: "REMOVED", postTitle: null }
                : item;
            }),
          })
        : null,
    );
  }

  async function readDetail(id: string) {
    const ticket = ++selectionSequence.current;
    try {
      const next = toReportDetail(await operations.load(id));
      if (
        !mounted.current ||
        selectedRef.current !== id ||
        selectionSequence.current !== ticket
      )
        return false;
      if (next.id !== id) throw new AdminError("invalid");
      setDetail(next);
      applyReport(next);
      return true;
    } catch (failure) {
      if (
        !mounted.current ||
        selectedRef.current !== id ||
        selectionSequence.current !== ticket
      )
        return false;
      if (!accessFailure(failure)) {
        setDetail(null);
        setDetailError(
          adminErrorMessage(
            failure instanceof ApiError && failure.status === 404
              ? new AdminError("notFound")
              : failure,
          ),
        );
      }
      return false;
    } finally {
      if (mounted.current && selectionSequence.current === ticket)
        setDetailLoading(false);
    }
  }

  function selectReport(id: string) {
    if (locked.current) return;
    selectedRef.current = id;
    setSelected(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setNotice(null);
    setRemoval(null);
    void readDetail(id);
  }

  function back() {
    if (locked.current) return;
    selectedRef.current = null;
    selectionSequence.current += 1;
    setSelected(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    setNotice(null);
    setRemoval(null);
    focusList.current = true;
  }

  async function refresh() {
    if (locked.current || listLoading || detailLoading) return;
    setListLoading(true);
    setListError(null);
    setDetailError(null);
    const id = selectedRef.current;
    if (id) setDetailLoading(true);
    const listOk = await readList();
    if (!mounted.current) return;
    if (!listOk) {
      if (id && selectedRef.current === id) {
        setDetailLoading(false);
        setDetailError(
          "최신 신고 목록을 확인하지 못했어요. 다시 불러와 주세요.",
        );
      }
      return;
    }
    const detailOk = id
      ? selectedRef.current === id && (await readDetail(id))
      : true;
    if (mounted.current && listOk && detailOk) {
      setNeedsReview(false);
      setNotice("최신 정보를 확인했어요. 처리 결과를 확인한 뒤 이용해 주세요.");
    }
  }

  async function act(resolution?: ReportResolution) {
    if (
      locked.current ||
      needsReview ||
      listLoading ||
      detailLoading ||
      !detail ||
      denied ||
      (resolution
        ? detail.status !== "PENDING"
        : detail.postStatus === "REMOVED")
    )
      return;
    const previous = detail;
    const ticket = selectionSequence.current;
    let answered = false;
    locked.current = true;
    setBusy(true);
    setDetailError(null);
    setNotice(null);
    try {
      if (resolution) {
        const raw = await operations.process(previous.id, resolution);
        answered = true;
        const next = toReportDetail(raw);
        if (
          next.id !== previous.id ||
          next.postId !== previous.postId ||
          next.status !== resolution
        )
          throw new AdminError("invalid");
        if (!mounted.current || selectionSequence.current !== ticket) return;
        setDetail(next);
        applyReport(next);
        setNotice(`신고를 ${statusLabels[resolution]} 처리했어요.`);
      } else {
        const raw = await operations.removePost(previous.postId);
        answered = true;
        const next = toRemovalResult(raw);
        if (next.postId !== previous.postId) throw new AdminError("invalid");
        if (!mounted.current || selectionSequence.current !== ticket) return;
        const hide = (item: AdminReportSummary) =>
          item.postId === next.postId
            ? { ...item, postStatus: "REMOVED" as const, postTitle: null }
            : item;
        setReports((current) => current?.map(hide) ?? null);
        setDetail({
          ...previous,
          postStatus: "REMOVED",
          postTitle: null,
          postContent: null,
          referenceTime: null,
        });
        setRemoval(next);
        setNotice("모집을 숨겼어요. 일반 화면에는 삭제 안내만 표시돼요.");
      }
    } catch (failure) {
      if (!mounted.current || selectionSequence.current !== ticket) return;
      if (!answered && accessFailure(failure)) return;
      if (
        !answered &&
        ((failure instanceof AdminError && failure.kind === "notFound") ||
          (failure instanceof ApiError && failure.status === 404))
      ) {
        setDetail(null);
        setDetailError(adminErrorMessage(new AdminError("notFound")));
        return;
      }
      const unknown =
        answered ||
        !(failure instanceof AdminError) ||
        failure.kind === "unknownOutcome";
      const conflict =
        failure instanceof AdminError && failure.kind === "conflict";
      setNeedsReview(unknown || conflict);
      setDetailError(
        adminErrorMessage(unknown ? new AdminError("unknownOutcome") : failure),
      );
    } finally {
      if (mounted.current) {
        locked.current = false;
        setBusy(false);
        setConfirm(false);
      }
    }
  }

  const pending = busy || listLoading || detailLoading;
  if (denied)
    return (
      <div className={styles.stack}>
        <AccessDenied />
        <button
          type="button"
          className={common.secondary}
          onClick={() => void refresh()}
          disabled={pending}
        >
          관리자 권한 다시 확인
        </button>
      </div>
    );
  return (
    <div className={styles.stack}>
      {notice && (
        <p ref={result} tabIndex={-1} role="status" className={common.success}>
          {notice}
        </p>
      )}
      {needsReview && (
        <p className={common.notice}>
          처리 결과를 확인하기 전에는 추가 조치를 할 수 없어요.
        </p>
      )}
      {selected ? (
        <section
          className={styles.stack}
          aria-labelledby="admin-detail-title"
          aria-busy={pending}
        >
          <button
            type="button"
            className={common.textButton}
            disabled={busy}
            onClick={back}
          >
            신고 목록으로
          </button>
          <h2
            ref={detailHeading}
            id="admin-detail-title"
            tabIndex={-1}
            className={common.sectionTitle}
          >
            신고 상세
          </h2>
          {detailLoading && <p role="status">신고 정보를 불러오고 있어요.</p>}
          {detailError && (
            <p role="alert" className={common.alert}>
              {detailError}
            </p>
          )}
          {!detailLoading && (detailError || needsReview) && (
            <button
              type="button"
              className={common.secondary}
              disabled={pending}
              onClick={() => void refresh()}
            >
              {needsReview ? "최신 정보 확인" : "다시 불러오기"}
            </button>
          )}
          {detail && (
            <>
              <dl className={styles.facts}>
                <div>
                  <dt>신고 상태</dt>
                  <dd>{statusLabels[detail.status]}</dd>
                </div>
                <div>
                  <dt>신고 사유</dt>
                  <dd>{reasonLabel(detail.reason)}</dd>
                </div>
                <div>
                  <dt>신고자 식별값</dt>
                  <dd>{detail.reporterId}</dd>
                </div>
                <div>
                  <dt>접수 시각</dt>
                  <dd>{dateTime.format(new Date(detail.createdAt))}</dd>
                </div>
                <div>
                  <dt>신고 상세 내용</dt>
                  <dd className={styles.content}>
                    {detail.detail || "추가 내용 없음"}
                  </dd>
                </div>
                {detail.processedAt && (
                  <>
                    <div>
                      <dt>처리 시각</dt>
                      <dd>{dateTime.format(new Date(detail.processedAt))}</dd>
                    </div>
                    <div>
                      <dt>처리자</dt>
                      <dd>{detail.processedBy}</dd>
                    </div>
                  </>
                )}
              </dl>
              <section className={common.section} aria-label="신고 대상 모집">
                <h3 className={common.label}>
                  {detail.postStatus === "REMOVED"
                    ? postLabels.REMOVED
                    : detail.postTitle}
                </h3>
                {detail.postStatus !== "REMOVED" && (
                  <>
                    <p className={common.help}>
                      {postLabels[detail.postStatus]} · 모집 {detail.postId}
                    </p>
                    <p className={styles.content}>{detail.postContent}</p>
                    {detail.referenceTime && (
                      <p className={common.help}>
                        기준 시각{" "}
                        {dateTime.format(new Date(detail.referenceTime))}
                      </p>
                    )}
                  </>
                )}
              </section>
              {removal && (
                <div className={common.notice}>
                  <p>
                    {removal.participationEffect === "CANCELLED_ACTIVE"
                      ? "진행 중이던 참여는 취소 처리됐어요."
                      : "완료된 모집의 참여 이력은 유지돼요."}
                  </p>
                  <p className={common.help}>
                    숨김 처리: {dateTime.format(new Date(removal.removedAt))} ·{" "}
                    {removal.removedBy}
                  </p>
                </div>
              )}
              <div className={styles.actions}>
                {detail.status === "PENDING" && (
                  <>
                    <button
                      type="button"
                      className={common.primary}
                      disabled={pending || needsReview}
                      onClick={() => void act("RESOLVED")}
                    >
                      해결 처리
                    </button>
                    <button
                      type="button"
                      className={common.secondary}
                      disabled={pending || needsReview}
                      onClick={() => void act("REJECTED")}
                    >
                      반려 처리
                    </button>
                  </>
                )}
                {detail.postStatus !== "REMOVED" && (
                  <button
                    ref={hideButton}
                    type="button"
                    className={common.dangerOutline}
                    disabled={pending || needsReview}
                    onClick={() => setConfirm(true)}
                  >
                    모집 숨김
                  </button>
                )}
              </div>
              <p className={common.help}>
                신고 처리와 모집 숨김은 별도 조치예요. 신고가 많아도 모집을
                자동으로 숨기지 않아요.
              </p>
            </>
          )}
          {busy && <p role="status">조치 결과를 확인하고 있어요.</p>}
        </section>
      ) : (
        <section
          className={styles.stack}
          aria-labelledby="admin-list-title"
          aria-busy={listLoading}
        >
          <div className={styles.row}>
            <h2
              ref={listHeading}
              id="admin-list-title"
              tabIndex={-1}
              className={common.sectionTitle}
            >
              신고 목록
            </h2>
            {!notConnected && (
              <button
                type="button"
                className={common.textButton}
                disabled={pending}
                onClick={() => void refresh()}
              >
                {needsReview ? "최신 정보 확인" : "새로 불러오기"}
              </button>
            )}
          </div>
          {listLoading && <p role="status">신고 목록을 불러오고 있어요.</p>}
          {notConnected ? (
            <p className={common.help}>
              {adminErrorMessage(new AdminError("notConnected"))}
            </p>
          ) : (
            <>
              {listError && (
                <p role="alert" className={common.alert}>
                  {listError}
                </p>
              )}
              {!listLoading && reports?.length === 0 && (
                <p>접수된 신고가 없어요.</p>
              )}
              {reports && (
                <ul className={styles.list}>
                  {reports.map((report) => (
                    <li key={report.id} className={styles.card}>
                      <div className={styles.row}>
                        <strong>
                          {report.postStatus === "REMOVED"
                            ? postLabels.REMOVED
                            : report.postTitle}
                        </strong>
                        <span
                          className={styles.badge}
                          data-pending={report.status === "PENDING"}
                        >
                          {statusLabels[report.status]}
                        </span>
                      </div>
                      <p className={common.help}>
                        {reasonLabel(report.reason)} ·{" "}
                        {dateTime.format(new Date(report.createdAt))}
                      </p>
                      <button
                        type="button"
                        className={common.secondary}
                        disabled={busy || listLoading}
                        aria-label={`신고 ${report.id} 상세 보기`}
                        onClick={() => selectReport(report.id)}
                      >
                        상세 보기
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
      <ConfirmDialog
        open={confirm}
        title="모집을 숨길까요?"
        confirmLabel="모집 숨김"
        danger
        confirmDisabled={pending || needsReview}
        onClose={() => setConfirm(false)}
        onConfirm={() => void act()}
        restoreFocus={() => {
          if (hideButton.current?.isConnected && !hideButton.current.disabled)
            hideButton.current.focus();
          else detailHeading.current?.focus();
        }}
      >
        <p>
          모집 콘텐츠를 일반 화면에서 숨겨요. 진행 중 참여는 취소되고, 완료된
          모집의 참여 이력은 유지돼요. 물리적으로 삭제하지 않아요.
        </p>
      </ConfirmDialog>
    </div>
  );
}
