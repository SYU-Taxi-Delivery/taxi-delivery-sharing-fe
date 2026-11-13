import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

async function setup(
  query: PostQuery,
  list: PostListOperations["list"] = async () => pageOf([taxi]),
) {
  const operations = { list: vi.fn(list) };
  render(
    <AuthProvider
      operations={{
        me: async () => ({ id: "1", displayName: "김하늘", role: "STUDENT" }),
        login: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <PostListScreen query={query} operations={operations} />
    </AuthProvider>,
  );
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

  it("택시 조건(출발·도착 추천, 바꾸기, 학교행, 시간대, 정렬)을 주소로 적용한다", async () => {
    const operations = await setup(taxiQuery);
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    const sheet = within(screen.getByRole("dialog", { name: "필터" }));

    fireEvent.click(
      within(sheet.getByRole("group", { name: "출발지 추천" })).getByRole(
        "button",
        { name: "삼육대학교 정문" },
      ),
    );
    fireEvent.change(sheet.getByLabelText("도착지"), {
      target: { value: "석계" },
    });
    fireEvent.click(
      sheet.getByRole("button", { name: /출발지·도착지 바꾸기/ }),
    );
    expect(sheet.getByLabelText("출발지")).toHaveValue("석계");
    expect(sheet.getByLabelText("도착지")).toHaveValue("삼육대학교 정문");
    fireEvent.click(sheet.getByRole("button", { name: "학교행" }));
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
    fireEvent.click(sheet.getByRole("button", { name: "결과 1개 보기" }));
    expect(router.push).toHaveBeenCalledWith(
      "/posts?type=TAXI&departure=%EC%84%9D%EA%B3%84&destination=%EC%82%BC%EC%9C%A1%EB%8C%80%ED%95%99%EA%B5%90+%EC%A0%95%EB%AC%B8&direction=TO_SCHOOL&time=tonight&sort=RECENT",
      { scroll: false },
    );
  });

  it("배달은 음식점·수령 장소, 직접 시간은 잘못된 구간을 막는다", async () => {
    await setup({ type: "DELIVERY", joinableOnly: true, page: 0 });
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    const sheet = within(screen.getByRole("dialog", { name: "필터" }));
    expect(sheet.queryByLabelText("출발지")).not.toBeInTheDocument();
    fireEvent.change(sheet.getByLabelText("음식점"), {
      target: { value: "김밥" },
    });
    fireEvent.click(sheet.getByRole("button", { name: "학생회관" }));
    expect(sheet.getByLabelText("수령 장소")).toHaveValue("학생회관");

    fireEvent.click(sheet.getByRole("button", { name: "직접" }));
    fireEvent.change(sheet.getByLabelText("부터"), {
      target: { value: "2026-11-14T21:00" },
    });
    fireEvent.change(sheet.getByLabelText("까지"), {
      target: { value: "2026-11-14T20:00" },
    });
    expect(sheet.getByRole("alert")).toHaveTextContent(
      "끝나는 시각을 시작 시각보다 뒤로",
    );
    fireEvent.click(sheet.getByRole("button", { name: /결과/ }));
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.click(sheet.getByRole("button", { name: "초기화" }));
    expect(sheet.getByLabelText("음식점")).toHaveValue("");
    expect(sheet.queryByLabelText("부터")).not.toBeInTheDocument();
  });

  it("적용된 조건은 결과 수 위의 칩으로 보이고 하나씩 지울 수 있다", async () => {
    await setup({
      ...taxiQuery,
      departure: "석계",
      time: "hour",
    });
    const chips = screen.getByRole("group", { name: "적용된 검색 조건" });
    expect(
      within(chips)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["출발 석계× 조건 지우기", "1시간 안× 조건 지우기"]);
    expect(screen.getByRole("button", { name: /^필터/ })).toHaveAccessibleName(
      "필터, 적용된 조건 2개",
    );
    fireEvent.click(within(chips).getByRole("button", { name: /출발 석계/ }));
    expect(router.push).toHaveBeenCalledWith("/posts?type=TAXI&time=hour", {
      scroll: false,
    });
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
