import Link from "next/link";
import styles from "./posts.module.css";

const WINDOW = 5;

/** 1-based page links; `current` and `href` use the 0-based API index. */
export function Pagination({
  current,
  totalPages,
  href,
}: {
  current: number;
  totalPages: number;
  href: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const start = Math.max(
    0,
    Math.min(current - Math.floor(WINDOW / 2), totalPages - WINDOW),
  );
  const pages = Array.from(
    { length: Math.min(WINDOW, totalPages) },
    (_, index) => start + index,
  );

  const step = (page: number, label: string, symbol: string) =>
    page < 0 || page >= totalPages ? (
      <span className={styles.pageLink} aria-disabled="true" aria-label={label}>
        {symbol}
      </span>
    ) : (
      <Link className={styles.pageLink} href={href(page)} aria-label={label}>
        {symbol}
      </Link>
    );

  return (
    <nav className={styles.pagination} aria-label="모집글 페이지">
      {step(current - 1, "이전 페이지", "‹")}
      {pages.map((page) => (
        <Link
          key={page}
          className={`${styles.pageLink} ${styles.pageNumber}`}
          href={href(page)}
          aria-current={page === current ? "page" : undefined}
          aria-label={`${page + 1}페이지`}
        >
          {page + 1}
        </Link>
      ))}
      <span
        className={styles.pagePosition}
        aria-label={`전체 ${totalPages}페이지 중 ${current + 1}페이지`}
      >
        {current + 1} / {totalPages}
      </span>
      {step(current + 1, "다음 페이지", "›")}
    </nav>
  );
}
