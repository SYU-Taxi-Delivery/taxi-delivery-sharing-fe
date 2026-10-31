"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { AppShell } from "./AppShell";
import { Pagination } from "./Pagination";
import { PostCard } from "./PostCard";
import {
  postQueryHref,
  type PostFilter,
  type PostListOperations,
  type PostQuery,
} from "./posts";
import { postListOperations } from "./postsApi";
import { usePostList } from "./usePostList";
import styles from "./posts.module.css";
import { useAppPath } from "@/features/demo/AppProviders";

const tabs: { type: PostFilter; label: string; description: string }[] = [
  { type: "ALL", label: "전체", description: "교내 택시·배달 모집" },
  { type: "TAXI", label: "택시", description: "같은 방향, 함께 이동" },
  { type: "DELIVERY", label: "배달", description: "함께하는 배달 모임" },
];

const NEW_POST_PATH = "/posts/new";

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
  const active = tabs.find((tab) => tab.type === query.type) ?? tabs[0];

  return (
    <AppShell current="posts" postsPath={basePath} wide>
      <div className={styles.listHeading}>
        <div>
          <h1 className={styles.title}>함께할 학생 모집</h1>
          <p className={`${styles.muted} mt-1`}>{active.description}</p>
        </div>
        <Link
          href={path(
            query.type === "DELIVERY"
              ? `${NEW_POST_PATH}?type=DELIVERY`
              : NEW_POST_PATH,
          )}
          className={styles.cta}
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
  const checkId = useId();
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
  const filtered = query.type !== "ALL" || query.joinableOnly;
  const posts = page?.content.filter((post) => post.status !== "REMOVED") ?? [];

  return (
    <>
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
      </nav>
      <label className={styles.check} htmlFor={checkId}>
        <input
          id={checkId}
          type="checkbox"
          checked={query.joinableOnly}
          onChange={(event) =>
            router.push(href({ joinableOnly: event.target.checked }), {
              scroll: false,
            })
          }
        />
        참여 가능한 글만 보기
      </label>

      <section aria-labelledby={`${checkId}-heading`} aria-busy={loading}>
        <h2 id={`${checkId}-heading`} className={styles.srOnly}>
          {active.label} 모집글 목록
        </h2>
        {page && (
          <p className={styles.summary}>
            <span>
              {active.label} {page.totalElements}개 · 정원은 작성자 포함
            </span>
            <span className={styles.sort}>출발·마감 빠른 순</span>
          </p>
        )}

        {loading ? (
          <p role="status" className={`${styles.state} ${styles.muted}`}>
            모집글을 불러오고 있어요.
          </p>
        ) : error ? (
          <div className={styles.state}>
            <p role="alert">{error}</p>
            <button type="button" className={styles.secondary} onClick={retry}>
              다시 불러오기
            </button>
          </div>
        ) : posts.length > 0 ? (
          <ul className={styles.list}>
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
        ) : page && page.totalPages > 0 && page.number >= page.totalPages ? (
          <div className={styles.state}>
            <p role="status">이 페이지에는 모집글이 없어요.</p>
            <Link
              href={href({ page: page.totalPages - 1 })}
              className={styles.secondary}
            >
              마지막 페이지로 이동
            </Link>
          </div>
        ) : filtered ? (
          <div className={styles.state}>
            <p role="status">조건에 맞는 모집글이 없어요.</p>
            <Link href={path(basePath)} className={styles.secondary}>
              전체 모집글 보기
            </Link>
          </div>
        ) : (
          <div className={styles.state}>
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
