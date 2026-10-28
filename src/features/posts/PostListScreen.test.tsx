import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AuthOperations } from "@/features/auth/auth";
import { AuthProvider } from "@/features/auth/AuthProvider";
import type { PostListOperations, PostQuery } from "./posts";
import { PostListScreen } from "./PostListScreen";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/posts",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-noto-sans-kr" }),
}));

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
});

const taxi = {
  id: "t1",
  type: "TAXI",
  status: "OPEN",
  referenceTime: "2026-10-05T09:00:00Z",
  capacity: 4,
  currentMemberCount: 3,
  joinable: true,
  departure: "석계역",
  destination: "삼육대학교",
  authorName: "박지민",
};
const delivery = {
  id: "d1",
  type: "DELIVERY",
  status: "OPEN",
  referenceTime: "2026-10-05T08:50:00Z",
  capacity: 4,
  currentMemberCount: 3,
  joinable: false,
  restaurantName: "테스트음식점",
  pickupLocation: "정문",
};
const pageOf = (content: unknown[], extra: object = {}) => ({
  content,
  totalElements: content.length,
  totalPages: content.length ? 1 : 0,
  number: 0,
  size: 20,
  ...extra,
});

const defaultQuery: PostQuery = { type: "ALL", joinableOnly: false, page: 0 };

async function setup(
  list: PostListOperations["list"],
  query: PostQuery = defaultQuery,
  me: AuthOperations["me"] = async () => ({
    id: "1",
    displayName: "김하늘",
    role: "STUDENT",
  }),
) {
  const operations = { list: vi.fn(list) };
  const view = render(
    <AuthProvider
      operations={{ me: vi.fn(me), login: vi.fn(), logout: vi.fn() }}
    >
      <PostListScreen query={query} operations={operations} />
    </AuthProvider>,
  );
  await act(async () => {});
  return { operations, view };
}

const cards = () => within(screen.getByRole("list")).getAllByRole("link");

describe("PostListScreen", () => {
  it("AC-DISC-001-01, AC-NFR-TIME-01-01: 서버 순서대로 카드와 Asia/Seoul 시각을 표시한다", async () => {
    const { operations } = await setup(async () => pageOf([taxi, delivery]));
    expect(operations.list).toHaveBeenCalledWith(defaultQuery);
    const [first, second] = cards();
    expect(first).toHaveTextContent("석계역");
    expect(first).toHaveTextContent("삼육대학교");
    expect(first).toHaveTextContent("18:00");
    expect(first).toHaveTextContent("10. 5. (월) · 출발");
    expect(first).toHaveAttribute("href", "/posts/t1");
    expect(second).toHaveTextContent("테스트음식점");
    expect(screen.getByText("전체 2개 · 정원은 작성자 포함")).toBeVisible();
  });

  it("AC-TAXI-003-01: 택시 카드는 유형·경로·출발·작성자 포함 인원·상태를 보여 준다", async () => {
    await setup(async () => pageOf([taxi]));
    const card = cards()[0];
    expect(within(card).getByText("택시")).toBeVisible();
    expect(within(card).getByText("모집 중")).toBeVisible();
    expect(card).toHaveTextContent("석계역에서");
    expect(card).toHaveTextContent("삼육대학교까지");
    expect(card).toHaveTextContent("3 / 4명");
    expect(card).toHaveTextContent("1자리 남음");
    expect(card).toHaveTextContent("박지민");
  });

  it("AC-DELIVERY-003-01, AC-DISC-003-04: 배달 카드는 음식점·수령 장소·주문 마감과 참여 마감을 보여 준다", async () => {
    await setup(async () => pageOf([delivery]));
    const card = cards()[0];
    expect(within(card).getByText("배달")).toBeVisible();
    expect(card).toHaveTextContent("테스트음식점");
    expect(card).toHaveTextContent("수령 장소 · 정문");
    expect(card).toHaveTextContent("17:50");
    expect(card).toHaveTextContent("주문 마감");
    expect(within(card).getByText("참여 마감")).toBeVisible();
    expect(card).toHaveTextContent("주문 마감 10분 전 마감");
    expect(card).not.toHaveTextContent("자리 남음");
    expect(card).not.toHaveTextContent(/에서|→/);
  });

  it("삭제된 모집은 카드로 표시하지 않는다", async () => {
    await setup(async () => pageOf([taxi, { ...delivery, status: "REMOVED" }]));
    expect(cards()).toHaveLength(1);
  });

  it("AC-DISC-001-04: 응답 전에는 로딩만 표시한다", async () => {
    await setup(() => new Promise(() => {}));
    expect(screen.getByRole("status")).toHaveTextContent("불러오고 있어요");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/아직 모집글이 없어요/)).not.toBeInTheDocument();
  });

  it("AC-DISC-001-05, AC-UI-ERROR-01: 실패를 빈 목록과 구분하고 다시 불러온다", async () => {
    const list = vi
      .fn<PostListOperations["list"]>()
      .mockRejectedValueOnce(new ApiError(500, "stack"))
      .mockResolvedValue(pageOf([taxi]));
    const { operations } = await setup(list);
    expect(screen.getByRole("alert")).toHaveTextContent("불러오지 못했어요");
    expect(screen.queryByText(/아직 모집글이 없어요/)).not.toBeInTheDocument();
    expect(screen.queryByText("stack")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    });
    expect(operations.list).toHaveBeenCalledTimes(2);
    expect(cards()).toHaveLength(1);
  });

  it("AC-TAXI-003-02: 필수값이 빠진 응답은 오류와 재시도로 표시한다", async () => {
    await setup(async () => pageOf([{ ...taxi, departure: undefined }]));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "정보를 확인할 수 없어요",
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
  });

  it("AC-DISC-001-02: 빈 목록은 작성 진입을 제공한다", async () => {
    await setup(async () => pageOf([]));
    expect(screen.getByRole("status")).toHaveTextContent(
      "아직 모집글이 없어요",
    );
    expect(
      screen.getAllByRole("link", { name: /모집글 쓰기/ }).at(-1),
    ).toHaveAttribute("href", "/posts/new");
  });

  it("AC-DISC-002-04: 필터 결과가 없으면 조건 없음 안내와 전체 보기를 제공한다", async () => {
    await setup(async () => pageOf([]), {
      type: "DELIVERY",
      joinableOnly: false,
      page: 0,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "조건에 맞는 모집글이 없어요",
    );
    expect(
      screen.getByRole("link", { name: "전체 모집글 보기" }),
    ).toHaveAttribute("href", "/posts");
    expect(screen.getByText("배달 0개 · 정원은 작성자 포함")).toBeVisible();
  });

  it("AC-DISC-002-01~03: 유형 탭은 현재 유형을 표시하고 첫 페이지 주소로 이동한다", async () => {
    await setup(async () => pageOf([taxi]), {
      type: "TAXI",
      joinableOnly: true,
      page: 2,
    });
    const tabs = within(screen.getByRole("navigation", { name: "모집 유형" }));
    expect(tabs.getByRole("link", { name: "택시" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(tabs.getByRole("link", { name: "전체" })).toHaveAttribute(
      "href",
      "/posts?joinable=true",
    );
    expect(tabs.getByRole("link", { name: "배달" })).toHaveAttribute(
      "href",
      "/posts?type=DELIVERY&joinable=true",
    );
  });

  it("AC-UI-FILTER-07: 참여 가능 체크는 유형을 유지하고 첫 페이지로 이동한다", async () => {
    await setup(async () => pageOf([taxi]), {
      type: "TAXI",
      joinableOnly: false,
      page: 1,
    });
    fireEvent.click(screen.getByLabelText("참여 가능한 글만 보기"));
    expect(router.push).toHaveBeenCalledWith("/posts?type=TAXI&joinable=true", {
      scroll: false,
    });
  });

  it("AC-UI-FILTER-08, AC-UI-FILTER-09: 최신순 선택 없이 기준시각 빠른 순을 표시한다", async () => {
    await setup(async () => pageOf([taxi]));
    expect(screen.getByText("출발·마감 빠른 순")).toBeVisible();
    expect(screen.queryByText("최신순")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("AC-UI-PAGE-01, AC-UI-PAGE-02: 페이지 이동은 필터를 유지하고 끝에서는 비활성이다", async () => {
    await setup(
      async () =>
        pageOf([taxi], { totalElements: 41, totalPages: 3, number: 1 }),
      { type: "TAXI", joinableOnly: true, page: 1 },
    );
    const pager = within(
      screen.getByRole("navigation", { name: "모집글 페이지" }),
    );
    expect(pager.getByRole("link", { name: "이전 페이지" })).toHaveAttribute(
      "href",
      "/posts?type=TAXI&joinable=true",
    );
    expect(pager.getByRole("link", { name: "다음 페이지" })).toHaveAttribute(
      "href",
      "/posts?type=TAXI&joinable=true&page=3",
    );
    expect(pager.getByRole("link", { name: "2페이지" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("첫 페이지의 이전, 마지막 페이지의 다음은 링크가 아니다", async () => {
    await setup(async () =>
      pageOf([taxi], { totalElements: 21, totalPages: 2, number: 0 }),
    );
    const pager = within(
      screen.getByRole("navigation", { name: "모집글 페이지" }),
    );
    expect(pager.queryByRole("link", { name: "이전 페이지" })).toBeNull();
    expect(pager.getByLabelText("이전 페이지")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("AC-DISC-001-09: 마지막 이후 페이지는 마지막 페이지로 안내한다", async () => {
    await setup(
      async () => pageOf([], { totalElements: 41, totalPages: 3, number: 5 }),
      { type: "ALL", joinableOnly: false, page: 5 },
    );
    expect(
      screen.getByRole("link", { name: "마지막 페이지로 이동" }),
    ).toHaveAttribute("href", "/posts?page=3");
  });

  it("조건이 바뀌면 늦게 도착한 이전 응답을 무시한다", async () => {
    let resolveOld!: (value: unknown) => void;
    const list = vi
      .fn<PostListOperations["list"]>()
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockResolvedValue(pageOf([delivery]));
    const operations = { list };
    const auth = {
      me: vi.fn(async () => ({
        id: "1",
        displayName: "김하늘",
        role: "STUDENT",
      })),
      login: vi.fn(),
      logout: vi.fn(),
    };
    const { rerender } = render(
      <AuthProvider operations={auth}>
        <PostListScreen query={defaultQuery} operations={operations} />
      </AuthProvider>,
    );
    await act(async () => {});
    rerender(
      <AuthProvider operations={auth}>
        <PostListScreen
          query={{ type: "DELIVERY", joinableOnly: false, page: 0 }}
          operations={operations}
        />
      </AuthProvider>,
    );
    await act(async () => {});
    await act(async () => resolveOld(pageOf([taxi])));
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toHaveTextContent("테스트음식점");
  });

  it("AC-DISC-001-06: 목록 API 401이면 만료 안내로 바꾸고 목록을 보여 주지 않는다", async () => {
    await setup(async () => Promise.reject(new ApiError(401, "")));
    expect(screen.getByRole("alert")).toHaveTextContent("로그인이 만료됐어요");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("비로그인 사용자는 목록을 요청하지 않고 로그인 안내를 본다", async () => {
    const { operations } = await setup(
      async () => pageOf([taxi]),
      defaultQuery,
      async () => null,
    );
    expect(operations.list).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "로그인하러 가기" }),
    ).toHaveAttribute("href", "/login?next=%2Fposts");
  });

  it("AC-UI-NAV-01: 헤더에서 모집글을 현재 메뉴로 표시하고 작성 CTA를 제공한다", async () => {
    await setup(async () => pageOf([taxi]));
    const nav = within(screen.getByRole("navigation", { name: "주요 메뉴" }));
    expect(nav.getByRole("link", { name: "모집글" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "김하늘님" })).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: /모집글 쓰기/ })[0],
    ).toHaveAttribute("href", "/posts/new");
  });
});
