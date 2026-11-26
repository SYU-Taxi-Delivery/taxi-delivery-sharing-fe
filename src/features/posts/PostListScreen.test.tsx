import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AuthOperations } from "@/features/auth/auth";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { listOriginFor } from "./listOrigin";
import {
  parsePostQuery,
  type PostListOperations,
  type PostQuery,
} from "./posts";
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
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

const defaultQuery: PostQuery = { type: "ALL", joinableOnly: true, page: 0 };
const allQuery: PostQuery = { type: "ALL", joinableOnly: false, page: 0 };

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

const cards = () =>
  within(screen.getByRole("region", { name: /모집글 목록/ }))
    .getAllByRole("listitem")
    .map((item) => within(item).getByRole("link"));

describe("8주차 목록 상태 갱신", () => {
  it.each([
    ["TAXI", "RECRUITING"],
    ["DELIVERY", "RECRUITING"],
    ["TAXI", undefined],
    ["DELIVERY", undefined],
  ])(
    "%s / %s 참여 마감 정각과 일정 종료에 서버 시계로 갱신한다",
    async (type, recruitmentStatus) => {
      vi.useFakeTimers();
      const referenceTime = "2026-11-16T00:05:00+09:00";
      const participationDeadline = "2026-11-15T23:45:00+09:00";
      const { operations, view } = await setup(async () =>
        pageOf(
          [
            {
              ...(type === "TAXI" ? taxi : delivery),
              referenceTime,
              participationDeadline,
              joinable: true,
              recruitmentStatus,
            },
          ],
          { serverTime: "2026-11-15T23:44:59.999+09:00" },
        ),
      );
      expect(cards()[0]).toHaveAttribute("data-available", "true");
      await act(async () => vi.advanceTimersByTime(1));
      expect(cards()[0]).toHaveTextContent("참여 마감");
      expect(cards()[0]).toHaveAttribute("data-available", "false");
      await act(async () => vi.advanceTimersByTime(20 * 60_000));
      expect(cards()[0]).toHaveTextContent("모집 완료");
      expect(operations.list).toHaveBeenCalledTimes(1);
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("조회 후 기기 시계를 바꿔도 참여 마감이 앞당겨지거나 되돌아가지 않는다", async () => {
    vi.useFakeTimers();
    const deadline = Date.parse("2026-11-15T23:50:00+09:00");
    vi.setSystemTime(new Date(deadline - 60_000));
    await setup(async () =>
      pageOf(
        [
          {
            ...taxi,
            referenceTime: "2026-11-16T00:00:00+09:00",
            recruitmentStatus: "RECRUITING",
          },
        ],
        { serverTime: new Date(deadline - 60_000).toISOString() },
      ),
    );
    vi.setSystemTime(new Date(deadline + 3_600_000));
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(cards()[0]).toHaveTextContent("모집 중");
    vi.setSystemTime(new Date(deadline - 3_600_000));
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(cards()[0]).toHaveTextContent("참여 마감");
  });

  it.each(["focus", "visibilitychange"])(
    "%s 복귀 시 최신 인원과 작성자 마감을 조회한다",
    async (event) => {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      const list = vi
        .fn()
        .mockResolvedValueOnce(pageOf([taxi]))
        .mockResolvedValue(
          pageOf([
            {
              ...taxi,
              status: "CLOSED",
              currentMemberCount: 2,
              joinable: false,
            },
          ]),
        );
      const { operations } = await setup(list);
      await act(async () =>
        fireEvent(event === "focus" ? window : document, new Event(event)),
      );
      expect(operations.list).toHaveBeenCalledTimes(2);
      expect(cards()[0]).toHaveTextContent("모집 마감");
      expect(cards()[0]).not.toHaveTextContent("자리 남음");
    },
  );

  it("복귀 재조회 실패에는 이전 인원을 확정 표시하지 않고 재시도를 제공한다", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(pageOf([taxi]))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(pageOf([{ ...taxi, currentMemberCount: 2 }]));
    await setup(list);
    await act(async () => fireEvent.focus(window));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "모집글을 불러오지 못했어요",
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await act(async () => {});
    expect(cards()[0]).toHaveTextContent("2자리 남음");
  });

  it("백그라운드 복귀 조회의 늦은 응답은 새 조건 결과를 덮어쓰지 않는다", async () => {
    let resolve!: (value: unknown) => void;
    const delayed = new Promise((done) => {
      resolve = done;
    });
    const list = vi
      .fn()
      .mockResolvedValueOnce(pageOf([taxi]))
      .mockReturnValueOnce(delayed)
      .mockResolvedValue(pageOf([delivery]));
    const { operations, view } = await setup(list);
    await act(async () => fireEvent.focus(window));
    view.rerender(
      <AuthProvider
        operations={{
          me: async () => ({ id: "1", displayName: "김하늘", role: "STUDENT" }),
          login: vi.fn(),
          logout: vi.fn(),
        }}
      >
        <PostListScreen
          query={{ ...defaultQuery, type: "DELIVERY" }}
          operations={operations}
        />
      </AuthProvider>,
    );
    await act(async () => {});
    await act(async () =>
      resolve(pageOf([{ ...taxi, currentMemberCount: 4 }])),
    );
    expect(cards()[0]).toHaveTextContent("테스트음식점");
    expect(cards()).toHaveLength(1);
  });

  it("숨겨진 탭은 조회하지 않고 동시에 발생한 복귀 이벤트는 한 번만 조회한다", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    let resolve!: (value: unknown) => void;
    const list = vi
      .fn()
      .mockResolvedValueOnce(pageOf([taxi]))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
    const { operations, view } = await setup(list);
    await act(async () => fireEvent(document, new Event("visibilitychange")));
    expect(operations.list).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("visible");
    act(() => {
      fireEvent.focus(window);
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(operations.list).toHaveBeenCalledTimes(2);
    await act(async () =>
      resolve(pageOf([{ ...taxi, currentMemberCount: 2 }])),
    );
    expect(cards()[0]).toHaveTextContent("2자리 남음");
    view.unmount();
    fireEvent.focus(window);
    expect(operations.list).toHaveBeenCalledTimes(2);
  });

  it("화면 복귀 중 세션 만료는 이전 모집을 제거하고 로그인 안내로 전환한다", async () => {
    await setup(
      vi
        .fn()
        .mockResolvedValueOnce(pageOf([taxi]))
        .mockRejectedValueOnce(new ApiError(401, "expired")),
    );
    await act(async () => fireEvent.focus(window));
    expect(screen.getByRole("alert")).toHaveTextContent("로그인이 만료됐어요");
    expect(
      screen.queryByRole("link", { name: /석계역에서/ }),
    ).not.toBeInTheDocument();
  });
});

describe("PostListScreen", () => {
  it("AC-DISC-001-01, AC-NFR-TIME-01-01: 서버 순서대로 카드와 Asia/Seoul 시각을 표시한다", async () => {
    const { operations } = await setup(async () => pageOf([taxi, delivery]));
    expect(operations.list).toHaveBeenCalledWith(defaultQuery);
    const [first, second] = cards();
    expect(first).toHaveTextContent("석계역");
    expect(first).toHaveTextContent("삼육대학교");
    expect(first).toHaveTextContent("10/5 (월) 18:00 출발");
    expect(first).toHaveAttribute("href", "/posts/t1");
    expect(second).toHaveTextContent("테스트음식점");
    expect(screen.getByText("참여 가능 2개")).toBeVisible();
  });

  it("AC-TAXI-003-01: 택시 카드는 경로, 출발·남은 자리, 유형·상태·작성자를 세 줄로 보여 준다", async () => {
    await setup(async () => pageOf([taxi]));
    const card = cards()[0];
    expect(within(card).getByText("택시")).toBeVisible();
    expect(within(card).getByText("모집 중")).toBeVisible();
    expect(card).toHaveTextContent("석계역에서 → 삼육대학교까지");
    expect(card).toHaveAccessibleName(/석계역에서\s*삼육대학교까지/);
    expect(within(card).getByText("1자리 남음")).toHaveAttribute(
      "data-last",
      "true",
    );
    expect(card).toHaveTextContent("택시·모집 중·작성자 박지민");
    // Place, then the time band, then type · status · author.
    const text = card.textContent ?? "";
    expect(text.indexOf("삼육대학교")).toBeLessThan(text.indexOf("출발"));
    expect(text.indexOf("1자리 남음")).toBeLessThan(text.indexOf("모집 중"));
    expect(card).not.toHaveTextContent("3 / 4명");
  });

  it("남은 자리가 여럿이면 마지막 자리 강조를 하지 않는다", async () => {
    await setup(async () => pageOf([{ ...taxi, currentMemberCount: 2 }]));
    expect(within(cards()[0]).getByText("2자리 남음")).toHaveAttribute(
      "data-last",
      "false",
    );
  });

  it.each([25, 60])(
    "기기 시계가 서버보다 %s분 빨라도 서버의 모집 중 판정을 유지한다",
    async (minutes) => {
      const evaluatedAt = Date.parse(taxi.referenceTime) - 30 * 60_000;
      vi.spyOn(Date, "now").mockReturnValue(evaluatedAt + minutes * 60_000);
      await setup(async () =>
        pageOf([{ ...taxi, recruitmentStatus: "RECRUITING" }]),
      );

      const card = cards()[0];
      expect(card).toHaveAttribute("data-available", "true");
      expect(within(card).getByText("모집 중")).toBeVisible();
      expect(card).not.toHaveTextContent("모집 완료");
    },
  );

  it("서버 시각이 오면 기기 시계가 60분 빨라도 서버 기준으로 모집 중을 유지한다", async () => {
    const evaluatedAt = Date.parse(taxi.referenceTime) - 30 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(evaluatedAt + 60 * 60_000);
    await setup(async () =>
      pageOf([{ ...taxi, recruitmentStatus: "RECRUITING" }], {
        serverTime: new Date(evaluatedAt).toISOString(),
      }),
    );
    const card = cards()[0];
    expect(card).toHaveAttribute("data-available", "true");
    expect(within(card).getByText("모집 중")).toBeVisible();
  });

  it("서버 시각으로 참여 마감이 지났으면 기기 시계가 늦어도 상세와 같이 마감으로 보인다", async () => {
    // Server: 5 minutes before T (past the 10-minute cutoff). Device: 30 minutes slow.
    const evaluatedAt = Date.parse(taxi.referenceTime) - 5 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(evaluatedAt - 30 * 60_000);
    await setup(async () =>
      pageOf([{ ...taxi, recruitmentStatus: "RECRUITING" }], {
        serverTime: new Date(evaluatedAt).toISOString(),
      }),
    );
    const card = cards()[0];
    expect(card).toHaveAttribute("data-available", "false");
    expect(card).not.toHaveTextContent("모집 중");
  });

  it("AC-DELIVERY-003-01, AC-DISC-003-04: 배달 카드는 음식점·수령 장소·주문 마감과 참여 마감을 보여 준다", async () => {
    await setup(async () => pageOf([delivery]));
    const card = cards()[0];
    expect(within(card).getByText("배달")).toBeVisible();
    // The restaurant is the title; the pickup place is its own small line.
    expect(card.querySelector("[class*=cardTitle]")).toHaveTextContent(
      /^테스트음식점$/,
    );
    expect(card.querySelector("[class*=pickup]")).toHaveTextContent(
      "수령 · 정문",
    );
    expect(card).toHaveTextContent("10/5 (월) 17:50 주문 마감");
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
    expect(
      screen.getByRole("heading", { name: "전체 모집글 목록" }),
    ).toHaveFocus();
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
    await setup(async () => pageOf([]), allQuery);
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
      "조건에 맞는 모집이 없어요아직 배달 모집이 없어요.",
    );
    expect(
      screen.getByRole("link", { name: "전체 모집글 보기" }),
    ).toHaveAttribute("href", "/posts?joinable=false");
    expect(screen.getByText("배달 0개")).toBeVisible();
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
      "/posts",
    );
    expect(tabs.getByRole("link", { name: "배달" })).toHaveAttribute(
      "href",
      "/posts?type=DELIVERY",
    );
  });

  it("참여 가능만은 기본으로 켜져 있고 기본 조건에서는 초기화가 없다", async () => {
    const { operations } = await setup(async () => pageOf([taxi]));
    expect(operations.list).toHaveBeenCalledWith(
      expect.objectContaining({ joinableOnly: true }),
    );
    expect(screen.getByRole("button", { name: "참여 가능만" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: "초기화" }),
    ).not.toBeInTheDocument();
  });

  it("AC-UI-FILTER-07: 참여 가능만 토글은 유형을 유지하고 첫 페이지로 이동한다", async () => {
    await setup(async () => pageOf([taxi]), {
      type: "TAXI",
      joinableOnly: false,
      page: 1,
    });
    const toggle = screen.getByRole("button", { name: "참여 가능만" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(router.push).toHaveBeenCalledWith("/posts?type=TAXI", {
      scroll: false,
    });
  });

  it("초기화는 검색 조건이 있을 때만 보이고, 유형과 참여 가능만은 그대로 두고 조건만 지운다", async () => {
    await setup(async () => pageOf([taxi]), {
      type: "TAXI",
      joinableOnly: false,
      page: 2,
    });
    // Type and the toggle alone are not search conditions.
    expect(
      screen.queryByRole("button", { name: "초기화" }),
    ).not.toBeInTheDocument();
  });

  it("검색 조건이 있으면 초기화로 조건만 지운다", async () => {
    await setup(async () => pageOf([taxi]), {
      type: "TAXI",
      joinableOnly: false,
      page: 2,
      time: "tonight",
      sort: "RECENT",
    });
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(router.push).toHaveBeenCalledWith(
      "/posts?type=TAXI&joinable=false",
      { scroll: false },
    );
  });

  it("참여 가능만 토글은 목록 위 한 곳에만 있고, 목록 끝이나 필터 안에는 없다", async () => {
    await setup(async () => pageOf([taxi]));
    expect(screen.getAllByRole("button", { name: /참여 가능/ })).toHaveLength(
      1,
    );
    expect(
      screen.queryByRole("button", { name: "마감된 모집도 보기" }),
    ).not.toBeInTheDocument();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /필터/ }));
    const sheet = screen.getByRole("dialog", { name: "필터" });
    expect(
      within(sheet).queryByRole("checkbox", { name: /참여 가능/ }),
    ).not.toBeInTheDocument();
    // The sort sits over the list where the current order shows: a button
    // opening a menu of orders.
    expect(
      within(sheet).queryByRole("radio", { name: "최근 등록 순" }),
    ).not.toBeInTheDocument();
  });

  it("정렬 버튼은 현재 정렬을 보여 주고, 누르면 정렬 목록을 펼친다", async () => {
    await setup(async () => pageOf([taxi]));
    const button = screen.getByRole("button", {
      name: /^정렬:\s*출발·마감 빠른 순$/,
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "최근 등록 순" })).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const menu = within(screen.getByRole("group", { name: "정렬" }));
    expect(
      menu.getByRole("link", { name: "출발·마감 빠른 순" }),
    ).toHaveAttribute("aria-current", "true");
    expect(menu.getByRole("link", { name: "최근 등록 순" })).toHaveAttribute(
      "href",
      "/posts?sort=RECENT",
    );
    fireEvent.keyDown(menu.getByRole("link", { name: "최근 등록 순" }), {
      key: "Escape",
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("참여 중인 모집은 상태 옆에 참여 중을 함께 보여 준다", async () => {
    await setup(async () =>
      pageOf([
        { ...taxi, viewerJoined: true, currentMemberCount: 4, joinable: false },
      ]),
    );
    const [card] = cards();
    expect(card).toHaveTextContent("정원 마감");
    expect(within(card).getByText("참여 중")).toBeInTheDocument();
  });

  it("참여 가능한 글이 없으면 마감된 모집도 보기를 안내한다", async () => {
    await setup(async () => pageOf([]));
    // No search condition: the fallback line instead of a quote.
    expect(screen.getByRole("status")).toHaveTextContent(
      "조건에 맞는 모집이 없어요지금 참여할 수 있는 모집이 없어요.",
    );
    expect(
      screen.getByRole("button", { name: "마감된 모집도 보기" }),
    ).toBeVisible();
  });

  it("날짜가 바뀌는 곳마다 오늘·내일 제목을 넣는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T22:30:00+09:00"));
    await setup(async () =>
      pageOf([
        { ...taxi, id: "a", referenceTime: "2026-11-13T23:40:00+09:00" },
        { ...taxi, id: "b", referenceTime: "2026-11-14T00:10:00+09:00" },
        { ...taxi, id: "c", referenceTime: "2026-11-14T09:00:00+09:00" },
      ]),
    );
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "오늘 · 11/13 (금)",
      "내일 · 11/14 (토)",
    ]);
    const [a, b] = cards();
    expect(a).toHaveTextContent("오늘 23:40 출발");
    expect(b).toHaveTextContent("내일 00:10 출발");
  });

  it("하루치 목록에는 날짜 제목을 넣지 않는다", async () => {
    await setup(async () => pageOf([taxi, delivery]));
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("서울 자정을 지날 때 카드와 날짜 제목을 다음 날 기준으로 갱신한다", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-11-13T23:59:59+09:00"));
    const { view } = await setup(async () =>
      pageOf([
        { ...taxi, id: "a", referenceTime: "2026-11-14T09:00:00+09:00" },
        { ...taxi, id: "b", referenceTime: "2026-11-15T09:00:00+09:00" },
      ]),
    );
    expect(cards()[0]).toHaveTextContent("내일 09:00 출발");

    await act(async () => vi.advanceTimersByTime(1_000));
    expect(cards()[0]).toHaveTextContent("오늘 09:00 출발");
    expect(cards()[1]).toHaveTextContent("내일 09:00 출발");
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["오늘 · 11/14 (토)", "내일 · 11/15 (일)"]);

    await act(async () => vi.advanceTimersByTime(86_400_000));
    expect(cards()[1]).toHaveTextContent("오늘 09:00 출발");
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["focus", "visibilitychange"])(
    "%s로 화면에 돌아오면 지연된 자정 타이머를 기다리지 않고 날짜를 갱신한다",
    async (event) => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date("2026-11-13T23:59:00+09:00"));
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      await setup(async () =>
        pageOf([{ ...taxi, referenceTime: "2026-11-14T09:00:00+09:00" }]),
      );
      expect(cards()[0]).toHaveTextContent("내일 09:00 출발");
      vi.setSystemTime(new Date("2026-11-14T00:01:00+09:00"));
      await act(async () => {
        fireEvent(event === "focus" ? window : document, new Event(event));
      });
      expect(cards()[0]).toHaveTextContent("오늘 09:00 출발");
    },
  );

  it("상세에서 돌아오면 저장한 스크롤 위치로 돌아간다", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const first = await setup(async () => pageOf([taxi]));
    Object.defineProperty(window, "scrollY", {
      value: 640,
      configurable: true,
    });
    const card = cards()[0];
    card.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(card);
    first.view.unmount();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });

    await setup(async () => pageOf([taxi]));
    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: "instant" });
    // The scroll is used once; only the detail's return target stays.
    expect(sessionStorage.getItem("posts:scroll:/posts")).toBeNull();
  });

  it("조건을 건 2쪽에서 카드를 열면 그 목록 주소와 스크롤을 상세의 목록 복귀용으로 기억한다", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const query: PostQuery = {
      type: "TAXI",
      joinableOnly: true,
      page: 1,
      destination: "석계",
      time: "tonight",
    };
    const listHref =
      "/posts?type=TAXI&destination=%EC%84%9D%EA%B3%84&time=tonight&page=2";
    const first = await setup(
      async () => pageOf([taxi], { totalPages: 2, number: 1 }),
      query,
    );
    Object.defineProperty(window, "scrollY", {
      value: 900,
      configurable: true,
    });
    const card = cards()[0];
    card.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(card);
    expect(listOriginFor("t1", "/posts")).toBe(listHref);
    expect(listOriginFor("other", "/posts")).toBeNull();
    first.view.unmount();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });

    // "모집글 목록" opens the same URL, which parses back to the same list.
    await setup(
      async () => pageOf([taxi], { totalPages: 2, number: 1 }),
      parsePostQuery(
        Object.fromEntries(new URL(listHref, "http://x").searchParams),
      ),
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "instant" });
  });

  it("AC-UI-FILTER-08, AC-UI-FILTER-09: 기본은 기준시각 빠른 순이고 정렬·검색은 목록에 펼치지 않는다", async () => {
    await setup(async () => pageOf([taxi]));
    expect(
      screen.getByRole("button", { name: /출발·마감 빠른 순/ }),
    ).toBeVisible();
    expect(screen.queryByText("최신순")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("AC-UI-PAGE-01, AC-UI-PAGE-02: 페이지 이동은 필터를 유지하고 끝에서는 비활성이다", async () => {
    await setup(
      async () =>
        pageOf([taxi], { totalElements: 41, totalPages: 3, number: 1 }),
      { type: "TAXI", joinableOnly: false, page: 1 },
    );
    const pager = within(
      screen.getByRole("navigation", { name: "모집글 페이지" }),
    );
    expect(pager.getByRole("link", { name: "이전 페이지" })).toHaveAttribute(
      "href",
      "/posts?type=TAXI&joinable=false",
    );
    expect(pager.getByRole("link", { name: "다음 페이지" })).toHaveAttribute(
      "href",
      "/posts?type=TAXI&joinable=false&page=3",
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
      { type: "ALL", joinableOnly: true, page: 5 },
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
