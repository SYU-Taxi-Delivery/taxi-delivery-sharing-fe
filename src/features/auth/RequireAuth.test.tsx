import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthOperations, CurrentUser } from "./auth";
import { AccountMenu } from "./AccountMenu";
import { AuthProvider, useAuth } from "./AuthProvider";
import { RequireAuth } from "./RequireAuth";

const router = { replace: vi.fn() };
const location = { pathname: "/posts/1", search: "" };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}));

const student: CurrentUser = {
  id: "1",
  displayName: "김삼육",
  role: "STUDENT",
};
const admin: CurrentUser = { id: "2", displayName: "운영자", role: "ADMIN" };

beforeEach(() => {
  router.replace.mockReset();
  location.pathname = "/posts/1";
  location.search = "";
});

function renderWith(me: AuthOperations["me"], ui: ReactNode) {
  const operations: AuthOperations = {
    me: vi.fn(me),
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
  };
  render(<AuthProvider operations={operations}>{ui}</AuthProvider>);
  return operations;
}

describe("RequireAuth", () => {
  it("확인 중에는 보호 내용을 렌더링하지 않는다", () => {
    renderWith(
      () => new Promise(() => {}),
      <RequireAuth>
        <p>보호 내용</p>
      </RequireAuth>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("확인하고 있어요");
    expect(screen.queryByText("보호 내용")).not.toBeInTheDocument();
  });

  it("AC-AUTH-004-06: 비로그인 사용자에게 로그인 안내와 돌아올 경로를 제공한다", async () => {
    renderWith(
      async () => null,
      <RequireAuth>
        <p>보호 내용</p>
      </RequireAuth>,
    );
    await act(async () => {});
    expect(
      screen.getByRole("heading", { name: "로그인이 필요해요" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "로그인하러 가기" }),
    ).toHaveAttribute("href", "/login?next=%2Fposts%2F1");
    expect(screen.queryByText("보호 내용")).not.toBeInTheDocument();
  });

  it.each([
    ["/my", "tab=created"],
    ["/posts/new", "type=DELIVERY"],
    ["/posts", "type=DELIVERY&page=2&joinable=true"],
  ])("로그인 후 %s의 검색 조건 %s로 돌아온다", async (pathname, search) => {
    location.pathname = pathname;
    location.search = search;
    renderWith(async () => null, <RequireAuth>보호 내용</RequireAuth>);
    await act(async () => {});
    expect(
      screen.getByRole("link", { name: "로그인하러 가기" }),
    ).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`${pathname}?${search}`)}`,
    );
  });

  it("AC-AUTH-002-06: 세션 만료 시 보호 내용을 지우고 만료를 알린다", async () => {
    let expire!: () => void;
    function Expire() {
      expire = useAuth().handleUnauthorized;
      return null;
    }
    renderWith(
      async () => student,
      <>
        <Expire />
        <RequireAuth>
          <p>참가자 명단</p>
        </RequireAuth>
      </>,
    );
    await act(async () => {});
    expect(screen.getByText("참가자 명단")).toBeVisible();
    act(() => expire());
    expect(screen.queryByText("참가자 명단")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("로그인이 만료됐어요");
  });

  it("확인 실패 시 다시 확인할 수 있다", async () => {
    const me = vi
      .fn<AuthOperations["me"]>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(student);
    renderWith(
      me,
      <RequireAuth>
        <p>보호 내용</p>
      </RequireAuth>,
    );
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("네트워크");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    });
    expect(screen.getByText("보호 내용")).toBeVisible();
  });

  it("AC-AUTH-004-07: STUDENT에게 관리자 화면을 제공하지 않는다", async () => {
    renderWith(
      async () => student,
      <RequireAuth role="ADMIN">
        <p>신고 목록</p>
      </RequireAuth>,
    );
    await act(async () => {});
    expect(
      screen.getByRole("heading", { name: "접근 권한이 없어요" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "홈으로 돌아가기" }),
    ).toHaveAttribute("href", "/");
    expect(screen.queryByText("신고 목록")).not.toBeInTheDocument();
  });

  it("AC-AUTH-004-02: ADMIN에게 관리자 화면을 보여준다", async () => {
    renderWith(
      async () => admin,
      <RequireAuth role="ADMIN">
        <p>신고 목록</p>
      </RequireAuth>,
    );
    await act(async () => {});
    expect(screen.getByText("신고 목록")).toBeVisible();
  });
});

describe("AccountMenu", () => {
  it("AC-UI-ACCOUNT-01, AC-UI-ACCOUNT-02: 이름 버튼으로 열고 Escape로 닫으면 포커스가 돌아온다", async () => {
    renderWith(async () => student, <AccountMenu />);
    await act(async () => {});
    const trigger = screen.getByRole("button", { name: "김삼육님" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("학생")).toBeVisible();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeVisible();
    screen.getByRole("button", { name: "로그아웃" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("바깥을 누르면 메뉴를 닫는다", async () => {
    renderWith(async () => student, <AccountMenu />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "김삼육님" }));
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("button", { name: "로그아웃" }),
    ).not.toBeInTheDocument();
  });

  it("AC-AUTH-004-01: 일반 사용자에게 관리자 메뉴를 제공하지 않는다", async () => {
    renderWith(async () => student, <AccountMenu />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "김삼육님" }));
    expect(
      screen.queryByRole("link", { name: "관리자 화면" }),
    ).not.toBeInTheDocument();
  });

  it("ADMIN에게만 관리자 메뉴를 제공한다", async () => {
    renderWith(async () => admin, <AccountMenu />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "운영자님" }));
    expect(screen.getByText("관리자")).toBeVisible();
    expect(screen.getByRole("link", { name: "관리자 화면" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("AC-AUTH-002-01: 로그아웃 후 로그인 화면으로 이동한다", async () => {
    const operations = renderWith(async () => student, <AccountMenu />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "김삼육님" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    });
    expect(operations.logout).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(
      screen.queryByRole("button", { name: "김삼육님" }),
    ).not.toBeInTheDocument();
  });

  it("비로그인 상태에서는 렌더링하지 않는다", async () => {
    renderWith(async () => null, <AccountMenu />);
    await act(async () => {});
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
