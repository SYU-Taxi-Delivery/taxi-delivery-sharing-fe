"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId } from "react";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { AppShell } from "./AppShell";
import { Pagination } from "./Pagination";
import { PostCard, postDayText, useClientNow } from "./PostCard";
import {
  DEFAULT_POST_QUERY,
  groupPostsByDay,
  isFilteredQuery,
  postQueryHref,
  type PostFilter,
  type PostListOperations,
  type PostQuery,
} from "./posts";
import { postListOperations } from "./postsApi";
import { usePostList } from "./usePostList";
import styles from "./posts.module.css";
import { useAppPath } from "@/features/demo/AppProviders";
import { SpotArt } from "@/features/ui/SpotArt";
import { BeanArt } from "@/features/ui/art";
import { formatDate } from "@/lib/dateFormat";

const tabs: { type: PostFilter; label: string }[] = [
  { type: "ALL", label: "전체" },
  { type: "TAXI", label: "택시" },
  { type: "DELIVERY", label: "배달" },
];

const NEW_POST_PATH = "/posts/new";
const SORT_LABEL = "출발·마감 빠른 순";
const SCROLL_KEY = "posts:scroll:";

/** sessionStorage can throw (private mode, blocked storage); never fatal. */
function readScroll(key: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(SCROLL_KEY + key);
    if (raw === null) return null;
    window.sessionStorage.removeItem(SCROLL_KEY + key);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveScroll(key: string) {
  try {
    window.sessionStorage.setItem(SCROLL_KEY + key, String(window.scrollY));
  } catch {
    // Storage unavailable: coming back simply starts at the top.
  }
}

export function PostListScreen({
  query,
  basePath = "/posts",
  operations = postListOperations,
}: {
  query: PostQuery;
  basePath?: string;
  operations?: PostListOperations;
}) {
  const path = useAppPath();

  return (
    <AppShell current="posts" postsPath={basePath} wide>
      <div className={styles.listHeading}>
        <BeanArt className={styles.headingBean} wave />
        <div className={styles.headingText}>
          <p className={styles.eyebrow}>두유팟</p>
          <h1 className={styles.listTitle}>택시·배달 모집</h1>
        </div>
        <Link
          href={path(
            query.type === "DELIVERY"
              ? `${NEW_POST_PATH}?type=DELIVERY`
              : NEW_POST_PATH,
          )}
          className={styles.headingCta}
        >
          <span aria-hidden="true">+</span> 모집글 쓰기
        </Link>
      </div>
      <RequireAuth>
        <PostList query={query} basePath={basePath} operations={operations} />
      </RequireAuth>
    </AppShell>
  );
}

function PostList({
  query,
  basePath,
  operations,
}: {
  query: PostQuery;
  basePath: string;
  operations: PostListOperations;
}) {
  const path = useAppPath();
  const router = useRouter();
  const headingId = useId();
  const now = useClientNow();
  const { loading, page, error, retry } = usePostList(
    query.type,
    query.joinableOnly,
    query.page,
    operations,
  );
  const active = tabs.find((tab) => tab.type === query.type) ?? tabs[0];
  // Changing a filter always starts from the first page (AC-UI-PAGE-01).
  const href = (next: Partial<PostQuery>) =>
    path(postQueryHref(basePath, { ...query, page: 0, ...next }));
  const go = (next: Partial<PostQuery>) =>
    router.push(href(next), { scroll: false });
  const filtered = isFilteredQuery(query);
  const posts = page?.content.filter((post) => post.status !== "REMOVED") ?? [];
  const groups = groupPostsByDay(posts);
  const scrollKey = path(postQueryHref(basePath, query));
  const loaded = !loading && page !== null;

  // Back from a detail page: return to the same spot once the rows exist.
  useEffect(() => {
    if (!loaded) return;
    const top = readScroll(scrollKey);
    if (top !== null) window.scrollTo({ top, behavior: "instant" });
  }, [loaded, scrollKey]);

  const showClosed = query.joinableOnly && (
    <button
      type="button"
      className={styles.textButton}
      onClick={() => go({ joinableOnly: false })}
    >
      마감된 모집도 보기
    </button>
  );

  return (
    <>
      <div className={styles.filters}>
        <nav className={styles.tabs} aria-label="모집 유형">
          {tabs.map((tab) => (
            <Link
              key={tab.type}
              href={href({ type: tab.type })}
              className={styles.tab}
              aria-current={tab.type === query.type ? "page" : undefined}
              scroll={false}
            >
              {tab.label}
            </Link>
          ))}
          <span className={styles.tabThumb} aria-hidden="true" />
        </nav>
        <div className={styles.filterRow}>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={query.joinableOnly}
            onClick={() => go({ joinableOnly: !query.joinableOnly })}
          >
            <span className={styles.toggleMark} aria-hidden="true" />
            참여 가능
          </button>
          {filtered && (
            <button
              type="button"
              className={styles.textButton}
              onClick={() =>
                router.push(path(postQueryHref(basePath, DEFAULT_POST_QUERY)), {
                  scroll: false,
                })
              }
            >
              초기화
            </button>
          )}
        </div>
      </div>

      <section
        className={styles.results}
        aria-labelledby={headingId}
        aria-busy={loading}
      >
        <h2 id={headingId} className={styles.srOnly}>
          {active.label} 모집글 목록
        </h2>
        {page && (
          <p className={styles.summary}>
            <span className={styles.count}>
              {query.joinableOnly
                ? `${query.type === "ALL" ? "" : `${active.label} `}참여 가능 ${page.totalElements}개`
                : `${active.label} ${page.totalElements}개`}
            </span>
            <span className={styles.sort}>{SORT_LABEL}</span>
          </p>
        )}

        {loading ? (
          <div className={styles.loading}>
            <p role="status" className={styles.loadingText}>
              모집글을 불러오고 있어요.
            </p>
            <ul className={styles.skeletonList} aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <li key={index} className={styles.skeleton}>
                  <span className={styles.skeletonSticker} />
                  <span className={styles.skeletonLines}>
                    <span />
                    <span />
                    <span />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : error ? (
          <div className={styles.state}>
            <SpotArt kind="error" />
            <p role="alert">{error}</p>
            <button type="button" className={styles.secondary} onClick={retry}>
              다시 불러오기
            </button>
          </div>
        ) : posts.length > 0 ? (
          <>
            {/* Save the spot only when a card is opened, not on every scroll. */}
            <div
              className={styles.board}
              onClickCapture={(event) => {
                if ((event.target as Element).closest("a")) {
                  saveScroll(scrollKey);
                }
              }}
            >
              {groups.map((group, index) => {
                const day = postDayText(group.time, now);
                const date = formatDate(group.time);
                return (
                  <div key={`${group.key}-${index}`} className={styles.day}>
                    {/* Headings only once a page spans more than one day. */}
                    {groups.length > 1 && (
                      <h3 className={styles.dayHeading}>
                        {day === date ? date : `${day} · ${date}`}
                      </h3>
                    )}
                    <ul className={styles.list}>
                      {group.posts.map((post) => (
                        <li key={post.id}>
                          <PostCard post={post} now={now} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            {showClosed && <p className={styles.listEnd}>{showClosed}</p>}
          </>
        ) : page && page.totalPages > 0 && page.number >= page.totalPages ? (
          <div className={styles.state}>
            <SpotArt />
            <p role="status">이 페이지에는 모집글이 없어요.</p>
            <Link
              href={href({ page: page.totalPages - 1 })}
              className={styles.secondary}
            >
              마지막 페이지로 이동
            </Link>
          </div>
        ) : query.joinableOnly ? (
          <div className={styles.state}>
            <SpotArt />
            <p role="status">
              지금 참여할 수 있는{" "}
              {query.type === "ALL" ? "" : `${active.label} `}모집글이 없어요.
            </p>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => go({ joinableOnly: false })}
            >
              마감된 모집도 보기
            </button>
          </div>
        ) : filtered && query.type !== "ALL" ? (
          <div className={styles.state}>
            <SpotArt />
            <p role="status">조건에 맞는 모집글이 없어요.</p>
            <Link href={href({ type: "ALL" })} className={styles.secondary}>
              전체 모집글 보기
            </Link>
          </div>
        ) : (
          <div className={styles.state}>
            <SpotArt />
            <p role="status">아직 모집글이 없어요. 첫 모집글을 써 보세요.</p>
            <Link href={path(NEW_POST_PATH)} className={styles.secondary}>
              모집글 쓰기
            </Link>
          </div>
        )}

        {page && (
          <Pagination
            current={page.number}
            totalPages={page.totalPages}
            href={(next) =>
              path(postQueryHref(basePath, { ...query, page: next }))
            }
          />
        )}
      </section>
    </>
  );
}
