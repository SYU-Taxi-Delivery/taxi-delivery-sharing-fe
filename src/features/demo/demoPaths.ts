const pages: Record<string, string> = {
  "/": "/auth-preview",
  "/login": "/auth-preview",
  "/signup": "/signup-preview",
  "/forgot-password": "/password-reset-preview",
  "/reset-password": "/password-reset-preview",
  "/posts": "/posts-preview",
  "/posts/new": "/post-form-preview",
  "/my": "/my-preview",
  "/admin": "/admin-preview",
};

export const previewPages = [
  ...new Set(Object.values(pages)),
  "/post-detail-preview",
  "/participation-preview",
  "/comments-preview",
];

export function demoPath(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "https://demo.invalid");
  const post = /^\/posts\/([^/]+)(\/edit)?$/.exec(url.pathname);
  let pathname = pages[url.pathname];
  if (post && !pathname) {
    pathname = post[2] ? "/post-form-preview" : "/post-detail-preview";
    url.searchParams.set("postId", decodeURIComponent(post[1]));
    if (post[2]) url.searchParams.set("mode", "edit");
  }
  if (!pathname) return href;
  if (url.pathname === "/reset-password") url.searchParams.set("mode", "reset");
  return pathname + url.search + url.hash;
}
