"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { AppShell } from "./AppShell";
import { Pagination } from "./Pagination";
import { PostCard, postDayText, useClientNow } from "./PostCard";
import {
  DEFAULT_POST_QUERY,
  groupPostsByDay,
  hasSearch,
  isFilteredQuery,
  postQueryHref,
  type PostFilter,
  type PostListOperations,
  type PostQuery,
} from "./posts";
import { SearchPanel, SearchSheet } from "./SearchPanel";
import { newPostHref, searchChips, SORT_LABELS } from "./search";
import { postListOperations } from "./postsApi";
import { rememberListOrigin } from "./listOrigin";
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
const SCROLL_KEY = "posts:scroll:";
const DESKTOP = "(min-width: 64rem)";

/** True on a desktop-wide window; false on the server and where unknown. */
function useDesktop(): boolean {
  return useSyncExternalStore(
    (change) => {
      const media = window.matchMedia?.(DESKTOP);
      media?.addEventListener("change", change);
      return () => media?.removeEventListener("change", change);
    },
    () => window.matchMedia?.(DESKTOP).matches === true,
    () => false,
  );
}

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
  const { loading, page, error, retry } = usePostList(query, operations);
  const desktop = useDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
  const sheetTitleId = useId();
  const sidebarTitleId = useId();
  const chips = searchChips(query, now);
  const searching = hasSearch(query);
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

  const apply = (next: PostQuery) => {
    setSheetOpen(false);
    router.push(path(postQueryHref(basePath, { ...next, page: 0 })), {
      scroll: false,
    });
  };
  const panel = (heading: ReactNode) => (
    <SearchPanel
      // Applying or removing a chip changes the URL; the draft starts over.
      key={postQueryHref("", query)}
      query={query}
      operations={operations}
      onApply={apply}
      heading={heading}
      appliedTotal={page?.totalElements ?? null}
    />
  );

  return (
    <div className={styles.searchLayout} data-sidebar={desktop}>
      {desktop && (
        <aside className={styles.sidebar} aria-labelledby={sidebarTitleId}>
          {panel(
            <h2 id={sidebarTitleId} className={styles.panelTitle}>
              검색 조건
            </h2>,
          )}
        </aside>
      )}
      <div className={styles.searchMain}>
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
              참여 가능만
            </button>
            {!desktop && (
              <button
                ref={filterButton}
                type="button"
                className={styles.filterButton}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen(true)}
              >
                <FilterIcon />
                필터
                {chips.length > 0 && (
                  <>
                    <span className={styles.filterBadge} aria-hidden="true">
                      {chips.length}
                    </span>
                    <span className={styles.srOnly}>
                      , 적용된 조건 {chips.length}개
                    </span>
                  </>
                )}
              </button>
            )}
            {searching && (
              <button
                type="button"
                className={styles.textButton}
                onClick={() =>
                  router.push(
                    path(postQueryHref(basePath, clearedSearch(query))),
                    { scroll: false },
                  )
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
          {chips.length > 0 && (
            <div
              className={styles.activeChips}
              role="group"
              aria-label="적용된 검색 조건"
            >
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className={styles.activeChip}
                  aria-label={`${chip.label} 조건 지우기`}
                  onClick={() => go(chip.clear)}
                >
                  {chip.label}
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}
          {page && (
            <p className={styles.summary}>
              <span className={styles.count}>
                {query.joinableOnly
                  ? `${query.type === "ALL" ? "" : `${active.label} `}참여 가능 ${page.totalElements}개`
                  : `${active.label} ${page.totalElements}개`}
              </span>
              <span className={styles.sort}>
                {SORT_LABELS[query.sort ?? "TIME"]}
              </span>
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
              <button
                type="button"
                className={styles.secondary}
                onClick={retry}
              >
                다시 불러오기
              </button>
            </div>
          ) : posts.length > 0 ? (
            <>
              {/* Save the spot only when a card is opened, not on every scroll. */}
              <div
                className={styles.board}
                onClickCapture={(event) => {
                  const card = (event.target as Element).closest("a");
                  if (!card) return;
                  saveScroll(scrollKey);
                  // "모집글 목록" on the detail comes back to this exact URL.
                  const postId = card.getAttribute("data-post-id");
                  if (postId) rememberListOrigin(postId, scrollKey);
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
          ) : searching ? (
            <div className={styles.state}>
              <SpotArt />
              <p role="status">조건에 맞는 모집글이 없어요.</p>
              <div className={styles.stateActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() =>
                    router.push(
                      path(postQueryHref(basePath, clearedSearch(query))),
                      { scroll: false },
                    )
                  }
                >
                  조건 초기화
                </button>
                <Link
                  href={path(newPostHref(query))}
                  className={styles.primary}
                >
                  이 조건으로 모집글 쓰기
                </Link>
              </div>
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
      </div>
      {!desktop && (
        <SearchSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          returnFocus={filterButton}
          titleId={sheetTitleId}
        >
          {panel(
            <div className={styles.sheetHeader}>
              <h2 id={sheetTitleId} className={styles.panelTitle}>
                필터
              </h2>
              <button
                type="button"
                className={styles.sheetClose}
                aria-label="필터 닫기"
                data-autofocus
                onClick={() => setSheetOpen(false)}
              >
                ×
              </button>
            </div>,
          )}
        </SearchSheet>
      )}
    </div>
  );
}

/** Keeps the type tab and the 참여 가능만 toggle, drops every search condition. */
function clearedSearch(query: PostQuery): PostQuery {
  return {
    ...DEFAULT_POST_QUERY,
    type: query.type,
    joinableOnly: query.joinableOnly,
  };
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.filterIcon}>
      <path
        d="M3 5h14M6 10h8M8.5 15h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
