import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "./AppProviders";
import { AppShell } from "@/features/posts/AppShell";
import { PostCard } from "@/features/posts/PostCard";
import { PostListScreen } from "@/features/posts/PostListScreen";
import { AuthProvider } from "@/features/auth/AuthProvider";

const location = vi.hoisted(() => ({ pathname: "/posts-preview" }));
const me = vi.hoisted(() => vi.fn(async () => null));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-font" }),
}));
vi.mock("@/features/auth/authApi", () => ({
  authOperations: { me, login: vi.fn(), logout: vi.fn() },
}));

beforeEach(() => {
  me.mockClear();
  location.pathname = "/posts-preview";
});

describe("데모 화면의 연결과 세션", () => {
  it("관리자 데모에서 기본 경로를 쓰는 목록도 필터와 페이지를 데모 안에서 연결한다", async () => {
    location.pathname = "/admin-preview";
    render(
      <AppProviders>
        <AuthProvider
          operations={{
            me: async () => ({
              id: "1",
              displayName: "데모학생",
              role: "STUDENT",
            }),
            login: async () => {},
            logout: async () => {},
          }}
        >
          <PostListScreen
            query={{ type: "ALL", joinableOnly: false, page: 0 }}
            operations={{
              list: async () => ({
                content: [
                  {
                    id: "demo",
                    type: "TAXI",
                    status: "OPEN",
                    departure: "정문",
                    destination: "석계역",
                    referenceTime: "2026-11-01T10:00:00Z",
                    capacity: 4,
                    currentMemberCount: 2,
                    joinable: true,
                  },
                ],
                totalElements: 40,
                totalPages: 2,
                number: 0,
                size: 20,
              }),
            }}
          />
        </AuthProvider>
      </AppProviders>,
    );
    await act(async () => {});
    const filters = within(
      screen.getByRole("navigation", { name: "모집 유형" }),
    );
    expect(filters.getByRole("link", { name: "배달" })).toHaveAttribute(
      "href",
      "/posts-preview?type=DELIVERY",
    );
    const pagination = within(
      screen.getByRole("navigation", { name: "모집글 페이지" }),
    );
    expect(
      pagination.getByRole("link", { name: "다음 페이지" }),
    ).toHaveAttribute("href", "/posts-preview?page=2");
    expect(me).not.toHaveBeenCalled();
  });

  it("목록 카드와 메뉴는 데모 안에서 이동하며 실제 세션을 조회하지 않는다", async () => {
    render(
      <AppProviders>
        <AppShell current="posts">
          <PostCard
            post={{
              id: "preview-1",
              type: "TAXI",
              status: "OPEN",
              referenceTime: "2026-11-01T10:00:00Z",
              capacity: 4,
              currentMemberCount: 2,
              joinable: true,
              departure: "정문",
              destination: "석계역",
            }}
          />
        </AppShell>
      </AppProviders>,
    );
    await act(async () => {});
    expect(me).not.toHaveBeenCalled();
    const nav = within(screen.getByRole("navigation", { name: "주요 메뉴" }));
    expect(nav.getByRole("link", { name: "모집글" })).toHaveAttribute(
      "href",
      "/posts-preview",
    );
    expect(nav.getByRole("link", { name: "내 참여 · 모집" })).toHaveAttribute(
      "href",
      "/my-preview",
    );
    expect(
      screen.getByRole("link", { name: /정문에서.*석계역까지/ }),
    ).toHaveAttribute("href", "/post-detail-preview?postId=preview-1");
  });

  it("운영 화면은 실제 인증 어댑터를 사용하고 데모 안내를 표시하지 않는다", async () => {
    location.pathname = "/posts";
    render(
      <AppProviders>
        <p>운영 화면</p>
      </AppProviders>,
    );
    await act(async () => {});
    expect(me).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("complementary", { name: "데모 안내" }),
    ).toBeNull();
  });
});
