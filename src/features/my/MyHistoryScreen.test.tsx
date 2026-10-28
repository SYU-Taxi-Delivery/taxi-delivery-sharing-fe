import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { MyHistoryScreen } from "./MyHistoryScreen";
import type { MyHistoryOperations, MyTab } from "./myHistory";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/my",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-font" }),
}));

const T = Date.parse("2026-10-20T18:00:00+09:00");
const NOW = T - 1_800_000;
function post(patch: Record<string, unknown> = {}) {
  return {
    id: "p1",
    type: "TAXI",
    status: "OPEN",
    relation: "JOINED",
    referenceTime: new Date(T).toISOString(),
    capacity: 4,
    currentMemberCount: 3,
    joinable: true,
    authorName: "박지민",
    departure: "삼육대학교 정문",
    destination: "태릉입구역 7번 출구",
    ...patch,
  };
}
const history = (content: unknown[], now = NOW) => ({
  content,
  serverTime: new Date(now).toISOString(),
});
const auth = (
  me = async (): Promise<unknown> => ({
    id: "1",
    displayName: "김하늘",
    role: "STUDENT",
  }),
) => ({ me: vi.fn(me), login: vi.fn(), logout: vi.fn() });

async function setup(
  list: MyHistoryOperations["list"] = async () => history([post()]),
  leave: MyHistoryOperations["leave"] = async () => {},
  tab: MyTab = "participated",
  authOperations = auth(),
) {
  const operations = { list: vi.fn(list), leave: vi.fn(leave) };
  const viewFor = (next: MyTab) => (
    <AuthProvider operations={authOperations}>
      <MyHistoryScreen tab={next} operations={operations} />
    </AuthProvider>
  );
  const view = render(viewFor(tab));
  await act(async () => {});
  return {
    ...view,
    operations,
    authOperations,
    switchTab: (next: MyTab) => view.rerender(viewFor(next)),
  };
}
const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");
async function openCancel(index = 0) {
  const button = within(rows()[index]).getByRole("button", {
    name: "참여 취소",
  });
  button.focus();
  fireEvent.click(button);
  return button;
}
async function confirmCancel() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "참여 취소하기" }));
  });
}

beforeEach(() => {
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
});

describe("my history screen", () => {
  it("AC-MY-002-05/004-01: 모집 상태와 내 참여 상태·유형·서울 시각·작성자 포함 정원을 구분한다", async () => {
    await setup(async () =>
      history([
        post(),
        post({ id: "p2", status: "CLOSED" }),
        post({ id: "p3", status: "FINISHED" }),
        post({ id: "p4", status: "CANCELLED", relation: "CANCELLED" }),
        post({
          id: "p5",
          type: "DELIVERY",
          restaurantName: "정문 김밥",
          pickupLocation: "학생회관",
          relation: "CANCELLED",
        }),
      ]),
    );
    expect(rows()).toHaveLength(5);
    expect(rows()[0]).toHaveTextContent("모집 중");
    expect(rows()[0]).toHaveTextContent("참여 중");
    expect(rows()[0]).toHaveTextContent("18:00 · 출발");
    expect(rows()[0]).toHaveTextContent("3 / 4명 · 작성자 포함");
    expect(rows()[0]).toHaveTextContent("17:50");
    expect(rows()[1]).toHaveTextContent("모집 마감");
    expect(rows()[2]).toHaveTextContent("모집 완료");
    expect(rows()[2]).toHaveTextContent("참여 이력");
    expect(rows()[3]).toHaveTextContent("모집 취소");
    expect(rows()[3]).toHaveTextContent("참여 취소됨");
    expect(rows()[4]).toHaveTextContent("정문 김밥");
    expect(rows()[4]).toHaveTextContent("수령 장소 · 학생회관");
    expect(rows()[4]).toHaveTextContent("주문 마감");
    expect(screen.queryByRole("button", { name: /참여하기/ })).toBeNull();
  });

  it("AC-MY-001-03/003-01, AC-UI-MY-COUNT-01: 두 이력 링크와 작성자 관리 진입을 제공한다", async () => {
    await setup(
      async () => history([post({ relation: "AUTHOR" })]),
      undefined,
      "created",
    );
    const nav = within(screen.getByRole("navigation", { name: "내 이력" }));
    expect(nav.getAllByRole("link")).toHaveLength(2);
    expect(nav.getByRole("link", { name: "참여한 글" })).toHaveAttribute(
      "href",
      "/my",
    );
    expect(nav.getByRole("link", { name: "작성한 글" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "모집 관리" })).toHaveAttribute(
      "href",
      "/posts/p1",
    );
    expect(screen.queryByRole("button", { name: "참여 취소" })).toBeNull();
    expect(screen.queryByText(/^전체/)).toBeNull();
  });

  it.each(["participated", "created"] as const)(
    "AC-MY-001-03/002-05: %s 빈 이력은 오류와 구분한다",
    async (tab) => {
      await setup(async () => history([]), undefined, tab);
      expect(screen.getByRole("status")).toHaveTextContent(
        tab === "created" ? "아직 작성한 모집" : "아직 참여한 모집",
      );
      expect(screen.queryByRole("alert")).toBeNull();
      expect(
        screen.getByRole("link", { name: "모집글 목록으로" }),
      ).toHaveAttribute("href", "/posts");
    },
  );

  it("AC-MY-001-04/002-03: REMOVED에는 원래 콘텐츠와 상세 진입을 제공하지 않는다", async () => {
    await setup(async () =>
      history([
        post({
          id: "removed",
          status: "REMOVED",
          departure: "삭제된 비밀 장소",
          title: "비밀 제목",
          description: "비밀 본문",
          participantNames: ["비밀 참가자"],
          communicationUrl: "https://example.com/private",
        }),
      ]),
    );
    expect(rows()[0]).toHaveTextContent("관리자에 의해 삭제된 모집");
    expect(within(rows()[0]).queryByRole("link")).toBeNull();
    expect(within(rows()[0]).queryByRole("button")).toBeNull();
    expect(rows()[0]).not.toHaveTextContent(/비밀|18:00|박지민|명/);
    expect(document.body.innerHTML).not.toContain("example.com/private");
  });

  it("AC-MY-003-02: 탭 전환 중 이전 응답을 새 탭의 이력으로 표시하지 않는다", async () => {
    let resolve!: (raw: unknown) => void;
    const { switchTab } = await setup((tab) =>
      tab === "participated"
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve(history([post({ id: "mine", relation: "AUTHOR" })])),
    );
    expect(screen.getByRole("status")).toHaveTextContent("불러오고 있어요");
    await act(async () => switchTab("created"));
    await act(async () =>
      resolve(history([post({ departure: "이전 응답 장소" })])),
    );
    expect(screen.queryByText("이전 응답 장소")).toBeNull();
    expect(screen.getByRole("link", { name: "모집 관리" })).toHaveAttribute(
      "href",
      "/posts/mine",
    );
  });

  it("AC-MY-003-03: 조회 실패는 원문을 숨기고 같은 탭을 재시도한다", async () => {
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockRejectedValueOnce(new Error("private server message"))
      .mockResolvedValue(history([post()]));
    const { operations } = await setup(list);
    expect(screen.getByRole("alert")).toHaveTextContent("불러오지 못했어요");
    expect(screen.queryByText("private server message")).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" })),
    );
    expect(rows()).toHaveLength(1);
    expect(operations.list).toHaveBeenLastCalledWith("participated");
  });

  it.each(["FULL", "CLOSED"])(
    "JOIN-006: JOINED %s는 T-10 전이면 취소할 수 있다",
    async (status) => {
      await setup(async () =>
        history([
          post({
            status,
            joinable: false,
            currentMemberCount: status === "FULL" ? 4 : 3,
          }),
        ]),
      );
      expect(screen.getByRole("button", { name: "참여 취소" })).toBeEnabled();
    },
  );

  it("Q-CONFIRM: 돌아가기·Escape는 요청 없이 닫고 포커스를 돌려준다", async () => {
    const { operations } = await setup();
    const trigger = await openCancel();
    expect(screen.getByRole("button", { name: "돌아가기" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    expect(trigger).toHaveFocus();
    await openCancel();
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(trigger).toHaveFocus();
    expect(operations.leave).not.toHaveBeenCalled();
  });

  it("AC-MY-002-02/JOIN-006: 취소 성공 후 같은 카드의 현재 관계를 갱신하고 다른 카드도 취소할 수 있다", async () => {
    const records = [post(), post({ id: "p2" })];
    const { operations } = await setup(
      async () => history(records),
      async (id) => {
        const item = records.find((record) => record.id === id)!;
        item.relation = "CANCELLED";
        item.currentMemberCount -= 1;
      },
    );
    await openCancel();
    const confirm = screen.getByRole("button", { name: "참여 취소하기" });
    await act(async () => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(operations.leave).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent("참여 취소됨");
    expect(rows()[0]).toHaveTextContent("2 / 4명");
    expect(rows()[0]).toHaveFocus();
    expect(
      within(rows()[1]).getByRole("button", { name: "참여 취소" }),
    ).toBeEnabled();
    await openCancel(1);
    await confirmCancel();
    expect(operations.leave).toHaveBeenCalledTimes(2);
    expect(rows()[1]).toHaveTextContent("참여 취소됨");
  });

  it("JOIN-006: 성공 후 조회 실패는 취소 관계를 유지하고 변경 재전송 없이 조회만 재시도한다", async () => {
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockResolvedValueOnce(history([post(), post({ id: "p2" })]))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(
        history([
          post({ relation: "CANCELLED", currentMemberCount: 2 }),
          post({ id: "p2" }),
        ]),
      );
    const { operations } = await setup(list);
    await openCancel();
    await confirmCancel();
    expect(rows()[0]).toHaveTextContent("참여 취소됨");
    expect(screen.getByRole("alert")).toHaveTextContent("내 참여는 취소됐지만");
    expect(
      within(rows()[1]).getByRole("button", { name: "참여 취소" }),
    ).toBeDisabled();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "다시 조회하기" })),
    );
    expect(operations.leave).toHaveBeenCalledTimes(1);
    expect(rows()[0]).toHaveTextContent("2 / 4명");
    expect(
      within(rows()[1]).getByRole("button", { name: "참여 취소" }),
    ).toBeEnabled();
  });

  it("JOIN-006: 취소 응답 유실 뒤 최신 서버 관계를 확인하고 자동 재전송하지 않는다", async () => {
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockResolvedValueOnce(history([post()]))
      .mockResolvedValue(history([post({ relation: "CANCELLED" })]));
    const { operations } = await setup(list, async () => {
      throw new Error("lost response");
    });
    await openCancel();
    await confirmCancel();
    expect(rows()[0]).toHaveTextContent("참여 취소됨");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "최신 참여 상태를 확인했어요",
    );
    expect(operations.leave).toHaveBeenCalledTimes(1);
  });

  it("느린 취소 응답은 사용자가 옮긴 포커스를 빼앗지 않는다", async () => {
    let finish!: () => void;
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockResolvedValueOnce(history([post()]))
      .mockResolvedValue(history([post({ relation: "CANCELLED" })]));
    await setup(
      list,
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await openCancel();
    await confirmCancel();
    const other = screen.getByRole("link", { name: "모집글 목록으로" });
    other.focus();
    await act(async () => finish());
    expect(other).toHaveFocus();
    expect(rows()[0]).toHaveTextContent("참여 취소됨");
  });

  it("JOIN-006: 조회 후 오래 기다려 확인창을 열어도 정확히 T-10부터 취소하지 않는다", async () => {
    vi.useFakeTimers();
    const { operations } = await setup();
    await act(async () => vi.advanceTimersByTime(1_199_000));
    await openCancel();
    await act(async () => vi.advanceTimersByTime(1_000));
    await confirmCancel();
    expect(screen.getByRole("alert")).toHaveTextContent("10분 전부터");
    expect(screen.queryByRole("button", { name: "참여 취소" })).toBeNull();
    expect(operations.leave).not.toHaveBeenCalled();
  });

  it.each(["FINISHED", "CANCELLED"])(
    "AC-MY-004-01: %s에는 참여·취소 CTA가 없다",
    async (status) => {
      await setup(async () => history([post({ status })]));
      expect(screen.queryByRole("button", { name: "참여 취소" })).toBeNull();
      expect(screen.getByRole("link", { name: "상세 보기" })).toBeVisible();
    },
  );

  it("화면 복귀는 카드 수와 무관하게 이력을 한 번 재조회한다", async () => {
    const { operations } = await setup(async () =>
      history([post(), post({ id: "p2" }), post({ id: "p3" })]),
    );
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(operations.list).toHaveBeenCalledTimes(2);
  });

  it("ADMIN-003: 선택한 모집이 삭제되면 확인창의 기존 제목도 제거한다", async () => {
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockResolvedValueOnce(history([post()]))
      .mockResolvedValue(
        history([{ id: "p1", status: "REMOVED", relation: "JOINED" }]),
      );
    await setup(list);
    await openCancel();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.queryByText(/삼육대학교 정문/)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("관리자에 의해 삭제된 모집")).toBeVisible();
  });

  it("AUTH-003: 비로그인 상태에서는 이력을 조회하지 않는다", async () => {
    const { operations } = await setup(
      undefined,
      undefined,
      "participated",
      auth(async () => {
        throw new ApiError(401, "");
      }),
    );
    expect(operations.list).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "로그인하러 가기" }),
    ).toHaveAttribute("href", "/login?next=%2Fmy");
  });

  it("AUTH-003: 참여 취소 401은 기존 이력을 제거하고 만료 안내로 전환한다", async () => {
    await setup(undefined, async () => {
      throw new ApiError(401, "private");
    });
    await openCancel();
    await confirmCancel();
    expect(
      screen.getByRole("heading", { name: "로그인이 만료됐어요" }),
    ).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
