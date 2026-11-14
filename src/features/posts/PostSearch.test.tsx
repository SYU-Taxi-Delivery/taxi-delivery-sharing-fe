import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth/AuthProvider";
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

const taxi = {
  id: "t1",
  type: "TAXI",
  status: "OPEN",
  referenceTime: "2026-11-13T23:30:00+09:00",
  capacity: 4,
  currentMemberCount: 2,
  joinable: true,
  departure: "석계역 1번 출구",
  destination: "삼육대학교 정문",
};
const pageOf = (content: unknown[], total = content.length) => ({
  content,
  totalElements: total,
  totalPages: total ? 1 : 0,
  number: 0,
  size: 20,
});

function setDesktop(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  router.push.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Opens the "<end> 시간" picker and picks the hour, then the minute. */
function pickTime(
  scope: ReturnType<typeof within>,
  end: "부터" | "까지",
  hour: number,
  minute: number,
) {
  fireEvent.click(scope.getByLabelText(`${end} 시간`));
  const picker = scope.getByRole("dialog", { name: `${end} 시간 선택` });
  const pad = (value: number) => String(value).padStart(2, "0");
  fireEvent.click(
    within(picker).getByRole("option", { name: `${pad(hour)}시` }),
  );
  fireEvent.click(
    within(picker).getByRole("option", { name: `${pad(minute)}분` }),
  );
}

let rerenderWith: (query: PostQuery) => Promise<void> = async () => {};

async function setup(
  query: PostQuery,
  list: PostListOperations["list"] = async () => pageOf([taxi]),
) {
  const operations = { list: vi.fn(list) };
  const tree = (current: PostQuery) => (
    <AuthProvider
      operations={{
        me: async () => ({ id: "1", displayName: "김하늘", role: "STUDENT" }),
        login: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <PostListScreen query={current} operations={operations} />
    </AuthProvider>
  );
  const view = render(tree(query));
  // The URL the router was sent to becomes the screen's new query.
  rerenderWith = async (next) => {
    view.rerender(tree(next));
    await act(async () => {});
  };
  await act(async () => {});
  return operations;
}

const taxiQuery: PostQuery = { type: "TAXI", joinableOnly: true, page: 0 };

describe("모집 검색 (휴대폰: 필터 시트)", () => {
  it("필터를 누르면 시트로 초점이 옮겨 가고 Esc로 닫으면 필터 버튼으로 돌아온다", async () => {
    await setup(taxiQuery);
    const button = screen.getByRole("button", { name: "필터" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(button);
    const sheet = screen.getByRole("dialog", { name: "필터" });
    expect(sheet).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "필터 닫기" })).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "true");

    fireEvent(sheet, new Event("cancel", { cancelable: true }));
    await act(async () => {});
    expect(sheet).not.toHaveAttribute("open");
    expect(button).toHaveFocus();
  });

  it("택시 조건(추천 장소, 바꾸기, 학교행, 시간대, 정렬)을 주소로 적용한다", async () => {
    const operations = await setup(taxiQuery);
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    const sheet = within(screen.getByRole("dialog", { name: "필터" }));

    // One suggestion list; it starts on the empty 출발지.
    expect(sheet.getAllByRole("group", { name: /추천 장소/ })).toHaveLength(1);
    const suggestions = () => sheet.getByRole("group", { name: /추천 장소/ });
    expect(suggestions()).toHaveAccessibleName("추천 장소 출발지에 넣기");
    fireEvent.click(
      within(suggestions()).getByRole("button", { name: "삼육대학교 정문" }),
    );
    expect(sheet.getByLabelText("출발지")).toHaveValue("삼육대학교 정문");
    // Filling 출발지 moves the target on to 도착지.
    expect(suggestions()).toHaveAccessibleName("추천 장소 도착지에 넣기");
    fireEvent.change(sheet.getByLabelText("도착지"), {
      target: { value: "석계" },
    });
    fireEvent.click(
      sheet.getByRole("button", { name: /출발지·도착지 바꾸기/ }),
    );
    expect(sheet.getByLabelText("출발지")).toHaveValue("석계");
    expect(sheet.getByLabelText("도착지")).toHaveValue("삼육대학교 정문");
    // 방향 is its own radio group, apart from the place suggestions.
    const direction = sheet.getByRole("radiogroup", { name: "방향" });
    expect(
      within(direction)
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent),
    ).toEqual(["전체", "학교행", "학교발"]);
    expect(
      within(direction).getByRole("radio", { name: "전체" }),
    ).toBeChecked();
    expect(
      within(suggestions()).queryByRole("button", { name: "학교행" }),
    ).toBeNull();
    fireEvent.click(within(direction).getByRole("radio", { name: "학교행" }));
    expect(
      within(direction).getByRole("radio", { name: "학교행" }),
    ).toBeChecked();
    fireEvent.click(sheet.getByRole("button", { name: "오늘 밤" }));
    fireEvent.click(sheet.getByRole("radio", { name: "최근 등록 순" }));

    // The draft's count is asked once typing settles.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(operations.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        departure: "석계",
        destination: "삼육대학교 정문",
        direction: "TO_SCHOOL",
        time: "tonight",
        sort: "RECENT",
      }),
    );
    fireEvent.click(
      sheet.getByRole("button", { name: "조건 적용하기 · 결과 1개" }),
    );
    expect(router.push).toHaveBeenCalledWith(
      "/posts?type=TAXI&departure=%EC%84%9D%EA%B3%84&destination=%EC%82%BC%EC%9C%A1%EB%8C%80%ED%95%99%EA%B5%90+%EC%A0%95%EB%AC%B8&direction=TO_SCHOOL&time=tonight&sort=RECENT",
      { scroll: false },
    );
  });

  it("고른 입력칸이 추천 장소의 대상이 되고, 다시 누르면 비운다", async () => {
    await setup({ ...taxiQuery, departure: "기숙사" });
    fireEvent.click(screen.getByRole("button", { name: /^필터/ }));
    const sheet = within(screen.getByRole("dialog", { name: "필터" }));
    const suggestions = () => sheet.getByRole("group", { name: /추천 장소/ });
    // 출발지 already set: 도착지 is the default target.
    expect(suggestions()).toHaveAccessibleName("추천 장소 도착지에 넣기");
    expect(sheet.getByLabelText("도착지").closest("label")).toHaveAttribute(
      "data-target",
      "true",
    );

    fireEvent.focus(sheet.getByLabelText("출발지"));
    expect(suggestions()).toHaveAccessibleName("추천 장소 출발지에 넣기");
    expect(sheet.getByLabelText("출발지").closest("label")).toHaveAttribute(
      "data-target",
      "true",
    );
    const dorm = within(suggestions()).getByRole("button", { name: "기숙사" });
    expect(dorm).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(dorm);
    expect(sheet.getByLabelText("출발지")).toHaveValue("");
    expect(sheet.getByLabelText("도착지")).toHaveValue("");
  });

  it("바꾼 조건이 아직 적용 전이면 적용 안 됨을 알리고, 위 칩은 적용된 조건만 보여 준다", async () => {
    setDesktop(true);
    await setup({ ...taxiQuery, destination: "석계" });
    const sidebar = within(
      screen.getByRole("complementary", { name: "검색 조건" }),
    );
    const chips = screen.getByRole("group", { name: "적용된 검색 조건" });
    expect(sidebar.queryByText("적용 안 됨")).not.toBeInTheDocument();
    expect(
      sidebar.getByRole("button", { name: "결과 1개 보기" }),
    ).toBeVisible();

    fireEvent.change(sidebar.getByLabelText("도착지"), {
      target: { value: "태릉" },
    });
    expect(sidebar.getByText("적용 안 됨")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(
      sidebar.getByRole("button", { name: "조건 적용하기 · 결과 1개" }),
    ).toBeVisible();
    expect(
      within(chips).getByRole("button", { name: "도착 석계 조건 지우기" }),
    ).toBeVisible();
    expect(within(chips).queryByText(/태릉/)).not.toBeInTheDocument();

    // Typing it back to the applied value clears the note.
    fireEvent.change(sidebar.getByLabelText("도착지"), {
      target: { value: "석계" },
    });
    expect(sidebar.queryByText("적용 안 됨")).not.toBeInTheDocument();
  });

  it("배달은 음식점·수령 장소, 시간 지정은 잘못된 구간을 막는다", async () => {
    await setup({ type: "DELIVERY", joinableOnly: true, page: 0 });
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    const sheet = within(screen.getByRole("dialog", { name: "필터" }));
    expect(sheet.queryByLabelText("출발지")).not.toBeInTheDocument();
    expect(sheet.getByLabelText("모집글 제목·장소 검색")).toBeVisible();
    fireEvent.change(sheet.getByLabelText("음식점"), {
      target: { value: "김밥" },
    });
    expect(
      sheet.getByRole("group", { name: "추천 장소 수령 장소에 넣기" }),
    ).toBeVisible();
    fireEvent.click(sheet.getByRole("button", { name: "학생회관" }));
    expect(sheet.getByLabelText("수령 장소")).toHaveValue("학생회관");
    expect(sheet.queryByRole("button", { name: "직접" })).toBeNull();

    vi.setSystemTime(new Date("2026-11-14T12:00:00+09:00"));
    fireEvent.click(sheet.getByRole("button", { name: "시간 지정" }));
    pickTime(sheet, "부터", 21, 0);
    pickTime(sheet, "까지", 20, 0);
    expect(sheet.getByRole("alert")).toHaveTextContent(
      "끝나는 시각을 시작 시각보다 뒤로",
    );
    fireEvent.click(sheet.getByRole("button", { name: /조건 적용하기/ }));
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.click(sheet.getByRole("button", { name: "초기화" }));
    expect(sheet.getByLabelText("음식점")).toHaveValue("");
    expect(sheet.queryByLabelText("부터 날짜")).not.toBeInTheDocument();
  });

  it("시간 지정은 한국어 날짜·시간 선택기로 고르고, 자정을 넘으면 오늘·내일로 보여 준다", async () => {
    vi.setSystemTime(new Date("2026-11-14T12:00:00+09:00"));
    await setup(taxiQuery);
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    const sheet = within(screen.getByRole("dialog", { name: "필터" }));
    fireEvent.click(sheet.getByRole("button", { name: "시간 지정" }));
    // No native date/time inputs (they show the browser's own English UI).
    expect(
      screen
        .getByRole("dialog", { name: "필터" })
        .querySelector(
          'input[type="date"], input[type="time"], input[type="datetime-local"]',
        ),
    ).toBeNull();

    // 부터: a date from the calendar (today), then a time from the lists.
    const fromDate = sheet.getByLabelText("부터 날짜");
    fireEvent.click(fromDate);
    const calendar = sheet.getByRole("dialog", { name: "부터 날짜 선택" });
    fireEvent.click(
      within(calendar).getByRole("button", { name: /11월 14일 토요일/ }),
    );
    expect(fromDate).toHaveFocus();
    expect(fromDate).toHaveTextContent("11/14 (토)");
    // Picking only the date starts the day at 00:00.
    expect(sheet.getByLabelText("부터 시간")).toHaveTextContent("00:00");
    pickTime(sheet, "부터", 21, 0);
    expect(sheet.getByLabelText("부터 시간")).toHaveFocus();

    // 까지: the next day at 02:00 crosses midnight.
    fireEvent.click(sheet.getByLabelText("까지 날짜"));
    fireEvent.click(
      within(sheet.getByRole("dialog", { name: "까지 날짜 선택" })).getByRole(
        "button",
        { name: /11월 15일 일요일/ },
      ),
    );
    pickTime(sheet, "까지", 2, 0);
    expect(sheet.getByLabelText("까지 날짜")).toHaveTextContent("11/15 (일)");
    expect(sheet.getByTestId("time-range")).toHaveTextContent(
      "오늘 21:00 ~ 내일 02:00",
    );
    expect(sheet.queryByRole("alert")).toBeNull();

    // Escape closes an open picker and returns focus to its field.
    const toTime = sheet.getByLabelText("까지 시간");
    fireEvent.click(toTime);
    fireEvent.keyDown(sheet.getByRole("dialog", { name: "까지 시간 선택" }), {
      key: "Escape",
    });
    expect(
      sheet.queryByRole("dialog", { name: "까지 시간 선택" }),
    ).not.toBeInTheDocument();
    expect(toTime).toHaveFocus();

    fireEvent.click(sheet.getByRole("button", { name: /조건 적용하기/ }));
    expect(router.push).toHaveBeenCalledWith(
      "/posts?type=TAXI&time=custom&from=2026-11-14T21%3A00&to=2026-11-15T02%3A00",
      { scroll: false },
    );
  });

  it("오늘 밤은 자정을 넘는 실제 검색 시각을 날짜와 함께 보여 준다", async () => {
    vi.setSystemTime(new Date("2026-11-13T23:30:00+09:00"));
    await setup({ ...taxiQuery, time: "tonight" });
    const chips = screen.getByRole("group", { name: "적용된 검색 조건" });
    expect(
      within(chips).getByRole("button", {
        name: "오늘 밤 · 오늘 18:00~내일 03:00 조건 지우기",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^필터/ }));
    const sheet = within(screen.getByRole("dialog", { name: "필터" }));
    expect(sheet.getByTestId("time-range")).toHaveTextContent(
      "오늘 18:00 ~ 내일 03:00 (11/13 금 ~ 11/14 토)",
    );
    fireEvent.click(sheet.getByRole("button", { name: "내일 아침" }));
    expect(sheet.getByTestId("time-range")).toHaveTextContent(
      "내일 06:00 ~ 12:00 (11/14 토)",
    );
  });

  it("적용된 조건은 결과 수 위의 칩으로 보이고, 하나를 지우면 주소·결과·요약이 함께 바뀐다", async () => {
    const operations = await setup(
      { ...taxiQuery, departure: "석계", time: "hour" },
      async (query) =>
        pageOf(query.departure ? [taxi] : [taxi, { ...taxi, id: "t2" }]),
    );
    const chips = screen.getByRole("group", { name: "적용된 검색 조건" });
    const labels = within(chips)
      .getAllByRole("button")
      .map((chip) => chip.getAttribute("aria-label"));
    expect(labels[0]).toBe("출발 석계 조건 지우기");
    expect(labels[1]).toMatch(/^1시간 이내 · .+~.+ 조건 지우기$/);
    expect(screen.getByRole("button", { name: /^필터/ })).toHaveAccessibleName(
      "필터, 적용된 조건 2개",
    );
    expect(screen.getByText("택시 참여 가능 1개")).toBeVisible();
    fireEvent.click(
      within(chips).getByRole("button", { name: "출발 석계 조건 지우기" }),
    );
    expect(router.push).toHaveBeenCalledWith("/posts?type=TAXI&time=hour", {
      scroll: false,
    });
    await rerenderWith(
      parsePostQuery(
        Object.fromEntries(
          new URL(router.push.mock.calls[0][0], "http://x").searchParams,
        ),
      ),
    );
    expect(operations.list).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ departure: expect.anything() }),
    );
    expect(screen.getByText("택시 참여 가능 2개")).toBeVisible();
    expect(
      within(screen.getByRole("group", { name: "적용된 검색 조건" }))
        .getAllByRole("button")
        .map((chip) => chip.getAttribute("aria-label")),
    ).toEqual([expect.stringMatching(/^1시간 이내 · /)]);
  });

  it("결과가 없으면 조건 초기화와 이 조건으로 글쓰기를 안내한다", async () => {
    await setup(
      { ...taxiQuery, departure: "석계", destination: "정문" },
      async () => pageOf([]),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "조건에 맞는 모집글이 없어요.",
    );
    expect(
      screen.getByRole("link", { name: "이 조건으로 모집글 쓰기" }),
    ).toHaveAttribute(
      "href",
      "/posts/new?departure=%EC%84%9D%EA%B3%84&destination=%EC%A0%95%EB%AC%B8",
    );
    fireEvent.click(screen.getByRole("button", { name: "조건 초기화" }));
    expect(router.push).toHaveBeenCalledWith("/posts?type=TAXI", {
      scroll: false,
    });
  });
});

describe("모집 검색 (데스크톱: 왼쪽 조건)", () => {
  it("넓은 화면에서는 같은 조건을 목록 옆에 두고 필터 버튼은 없다", async () => {
    setDesktop(true);
    const operations = await setup({ ...taxiQuery, departure: "석계" });
    const sidebar = screen.getByRole("complementary", { name: "검색 조건" });
    expect(within(sidebar).getByLabelText("출발지")).toHaveValue("석계");
    expect(
      screen.queryByRole("button", { name: /^필터/ }),
    ).not.toBeInTheDocument();
    // Unchanged conditions reuse the list's own total.
    expect(
      within(sidebar).getByRole("button", { name: "결과 1개 보기" }),
    ).toBeVisible();
    expect(operations.list).toHaveBeenCalledTimes(1);
  });
});
