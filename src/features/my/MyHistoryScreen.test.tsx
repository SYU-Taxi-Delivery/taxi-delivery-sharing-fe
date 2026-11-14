import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ParticipationRejected } from "@/features/participation/participation";
import { PostDetailError } from "@/features/posts/detail/postDetail";
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
const group = (name: RegExp) => screen.queryByRole("region", { name });
const upcoming = () => {
  const region = group(/^다가오는 일정/);
  return region ? within(region).queryAllByRole("listitem") : [];
};
const past = () => {
  const region = group(/^지난 이력/);
  return region ? within(region).queryAllByRole("listitem") : [];
};
/** Upcoming rows first, then history rows, in screen order. */
const rows = () => [...upcoming(), ...past()];
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
  it("API가 없는 작성한 글 탭은 다시 불러오기 대신 모집글 목록으로 안내한다", async () => {
    const missing = new Error("adapter internals");
    missing.name = "MyHistoryNotConnectedError";
    await setup(async () => Promise.reject(missing), undefined, "created");
    expect(screen.getByRole("status")).toHaveTextContent(
      "작성한 글 목록은 아직 준비 중이에요.",
    );
    expect(
      screen.queryByRole("button", { name: "다시 불러오기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "모집글 목록 보기" }),
    ).toHaveAttribute("href", "/posts");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("AC-MY-002-05/004-01: 다가오는 일정과 지난 이력을 나누고 각 상태를 구분한다", async () => {
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
    expect(
      screen.getByRole("heading", { name: "다가오는 일정 2건" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "지난 이력 3건" }),
    ).toBeVisible();
    expect(upcoming()).toHaveLength(2);
    expect(past()).toHaveLength(3);
    const [first, second] = upcoming();
    expect(first).toHaveTextContent("모집 중");
    expect(first).toHaveTextContent("참여 중");
    expect(first).toHaveTextContent("오늘 18:00 출발");
    expect(first).toHaveTextContent("오늘 17:50까지 가능");
    expect(first).toHaveTextContent("3 / 4명 · 작성자 포함");
    expect(second).toHaveTextContent("모집 마감");
    expect(past()[0]).toHaveTextContent("일정 종료");
    expect(past()[1]).toHaveTextContent("참여 취소함");
    expect(past()[2]).toHaveTextContent("배달정문 김밥");
    expect(past()[2]).toHaveTextContent(/10\/20 \(화\) 18:00/);
    expect(past()[2]).toHaveTextContent("참여 취소함");
    expect(screen.queryByRole("button", { name: /참여하기/ })).toBeNull();
  });

  it("다가오는 일정은 가까운 순으로 보여 주고 배달은 주문 마감·수령 장소를 쓴다", async () => {
    await setup(async () =>
      history([
        post({
          id: "later",
          referenceTime: new Date(T + 86_400_000).toISOString(),
        }),
        post({
          id: "soon",
          type: "DELIVERY",
          restaurantName: "정문 김밥",
          pickupLocation: "학생회관",
        }),
      ]),
    );
    const [first, second] = upcoming();
    expect(first).toHaveTextContent("정문 김밥");
    expect(first).toHaveTextContent("오늘 18:00 주문 마감");
    expect(first).toHaveTextContent("수령 장소 · 학생회관");
    expect(second).toHaveTextContent("내일 18:00 출발");
    expect(second).toHaveTextContent("내일 17:50까지 가능");
    expect(group(/^지난 이력/)).toBeNull();
  });

  it("작성한 글은 참여자 취소 기한을, 기한이 지나면 마감을 알린다", async () => {
    await setup(
      async () =>
        history(
          [
            post({ relation: "AUTHOR" }),
            post({ id: "p2", relation: "AUTHOR" }),
          ],
          T - 300_000,
        ),
      undefined,
      "created",
    );
    expect(upcoming()[0]).toHaveTextContent("참여자 취소 마감됨");
    expect(upcoming()[0]).toHaveTextContent("작성한 글");
  });

  it("참여 카드: 제목은 상세 링크, 주 버튼은 오픈채팅, 참여 취소는 마감 시각과 함께 아래 줄에 둔다", async () => {
    await setup(async () =>
      history([post({ communicationUrl: "https://open.kakao.com/o/abc" })]),
    );
    const card = within(upcoming()[0]);
    expect(card.getByRole("link", { name: /삼육대학교 정문/ })).toHaveAttribute(
      "href",
      "/posts/p1",
    );
    const chat = card.getByRole("link", { name: /오픈채팅/ });
    expect(chat).toHaveAttribute("href", "https://open.kakao.com/o/abc");
    expect(chat).toHaveAttribute("target", "_blank");
    const cancel = card.getByRole("button", { name: "참여 취소" });
    expect(cancel).toHaveAccessibleDescription("오늘 17:50까지 가능");
    // Primary first on its own row, then the cancel row.
    expect(chat.compareDocumentPosition(cancel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(cancel.parentElement).not.toBe(chat.parentElement);
  });

  it("참여 카드에 소통 링크가 없으면 상세의 참여자 안내로 가는 모임 장소 보기를 둔다", async () => {
    await setup(async () => history([post()]));
    const card = within(upcoming()[0]);
    expect(card.getByRole("link", { name: "모임 장소 보기" })).toHaveAttribute(
      "href",
      "/posts/p1#participant-guide",
    );
    expect(card.queryByRole("link", { name: /오픈채팅/ })).toBeNull();
  });

  it("출발 시각이 지나면 카드가 지난 이력으로 옮겨진다", async () => {
    vi.useFakeTimers();
    await setup(async () => history([post()], T - 1_000));
    expect(upcoming()[0]).toHaveTextContent("취소 마감됨");
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(upcoming()).toHaveLength(0);
    expect(screen.getByText("다가오는 일정이 없어요.")).toBeVisible();
    expect(past()[0]).toHaveTextContent("일정 종료");
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
      // Next action: browse (participated) or write (created, also the top CTA)
      expect(
        screen.getAllByRole("link", {
          name: tab === "created" ? "모집글 쓰기" : "모집 둘러보기",
        }),
      ).toHaveLength(tab === "created" ? 2 : 1);
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
    expect(rows()[0]).toHaveTextContent("삭제됨");
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
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" })),
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
    expect(upcoming()).toHaveLength(1);
    expect(past()).toHaveLength(1);
    // The cancelled card moved to 지난 이력; focus follows it there.
    expect(past()[0]).toHaveTextContent("참여 취소함");
    expect(past()[0]).toHaveFocus();
    expect(
      within(upcoming()[0]).getByRole("button", { name: "참여 취소" }),
    ).toBeEnabled();
    await openCancel(0);
    await confirmCancel();
    expect(operations.leave).toHaveBeenCalledTimes(2);
    expect(upcoming()).toHaveLength(0);
    expect(past()).toHaveLength(2);
    expect(past()[1]).toHaveTextContent("참여 취소함");
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
    expect(past()[0]).toHaveTextContent("참여 취소함");
    expect(screen.getByRole("alert")).toHaveTextContent("내 참여는 취소됐지만");
    expect(
      within(upcoming()[0]).getByRole("button", { name: "참여 취소" }),
    ).toBeDisabled();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "다시 조회하기" })),
    );
    expect(operations.leave).toHaveBeenCalledTimes(1);
    expect(past()[0]).toHaveTextContent("참여 취소함");
    expect(
      within(upcoming()[0]).getByRole("button", { name: "참여 취소" }),
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
    expect(past()[0]).toHaveTextContent("참여 취소함");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "최신 참여 상태를 확인했어요",
    );
    expect(operations.leave).toHaveBeenCalledTimes(1);
  });

  it("마감 직후 취소가 409로 거절되면 결과와 마감 사유를 알린다", async () => {
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockResolvedValueOnce(history([post()]))
      .mockResolvedValueOnce(history([post()], T - 599_999));
    const { operations } = await setup(list, async () => {
      throw new PostDetailError("conflict");
    });

    await openCancel();
    await confirmCancel();

    expect(operations.leave).toHaveBeenCalledExactlyOnceWith("p1");
    expect(list).toHaveBeenCalledTimes(2);
    expect(rows()[0]).toHaveTextContent("참여 중");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("참여 취소가 처리되지 않았어요.");
    expect(alert).toHaveTextContent(
      "출발 10분 전부터 참여 신청과 취소가 마감됩니다.",
    );
  });

  it("모집 취소의 최신 상태가 담긴 409도 부모 이력을 갱신해 링크와 취소 버튼을 없앤다", async () => {
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockResolvedValueOnce(
        history([post({ communicationUrl: "https://open.kakao.com/o/test" })]),
      )
      .mockResolvedValueOnce(
        history([
          post({
            status: "CANCELLED",
            recruitmentStatus: "CANCELLED",
            relation: "CANCELLED",
            currentMemberCount: 1,
            joinable: false,
          }),
        ]),
      );
    const { operations } = await setup(list, async () => {
      throw new ParticipationRejected("POST_CANCELLED", {
        status: "CANCELLED",
        recruitmentStatus: "CANCELLED",
        currentMemberCount: 1,
        joinable: false,
      });
    });
    expect(screen.getByRole("link", { name: /오픈채팅/ })).toBeVisible();

    await openCancel();
    await confirmCancel();

    expect(operations.leave).toHaveBeenCalledExactlyOnceWith("p1");
    expect(list).toHaveBeenCalledTimes(2);
    expect(upcoming()).toHaveLength(0);
    expect(past()[0]).toHaveTextContent("참여 취소함");
    expect(
      screen.queryByRole("link", { name: /오픈채팅/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "참여 취소" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "현재 내 참여가 취소된 상태예요",
    );
  });

  it("409 뒤 이력 조회가 실패하면 변경을 막고 재전송 없이 조회만 재시도한다", async () => {
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockResolvedValueOnce(history([post()]))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(history([post()], T - 599_999));
    const { operations } = await setup(list, async () => {
      throw new ParticipationRejected("CANCEL_TIME_CLOSED", {
        recruitmentStatus: "APPLICATION_CLOSED",
        currentMemberCount: 3,
        joinable: false,
      });
    });
    await openCancel();
    await confirmCancel();

    expect(screen.getByRole("button", { name: "참여 취소" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "최신 참여 상태를 확인하지 못했어요",
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "다시 조회하기" })),
    );
    expect(list).toHaveBeenCalledTimes(3);
    expect(operations.leave).toHaveBeenCalledExactlyOnceWith("p1");
    expect(
      screen.queryByRole("button", { name: "참여 취소" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["POST_CANCELLED", "CANCELLED", "모집 취소", 1],
    ["POST_FINISHED", "FINISHED", "일정 종료", 3],
  ] as const)(
    "%s의 최신 상태는 후속 조회 실패에도 링크와 다가오는 일정에서 제거한다",
    async (code, status, label, count) => {
      const list = vi
        .fn<MyHistoryOperations["list"]>()
        .mockResolvedValueOnce(
          history([
            post({ communicationUrl: "https://open.kakao.com/o/test" }),
          ]),
        )
        .mockRejectedValueOnce(new Error("offline"));
      const { operations } = await setup(list, async () => {
        throw new ParticipationRejected(code, {
          status,
          recruitmentStatus: status,
          currentMemberCount: count,
          joinable: false,
        });
      });
      expect(screen.getByRole("link", { name: /오픈채팅/ })).toBeVisible();
      await openCancel();
      await confirmCancel();

      expect(operations.leave).toHaveBeenCalledExactlyOnceWith("p1");
      expect(list).toHaveBeenCalledTimes(2);
      expect(upcoming()).toHaveLength(0);
      expect(past()[0]).toHaveTextContent(label);
      expect(
        screen.queryByRole("link", { name: /오픈채팅/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "참여 취소" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "다시 조회하기" }),
      ).toBeEnabled();
    },
  );

  it("창 복귀 재조회에서 취소 마감이 확인되면 요청을 보내지 않고 이유를 알린다", async () => {
    let complete!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      complete = resolve;
    });
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockResolvedValueOnce(history([post()]))
      .mockReturnValueOnce(pending);
    const { operations } = await setup(list);

    await openCancel();
    await act(async () => window.dispatchEvent(new Event("focus")));
    await confirmCancel();
    await act(async () => complete(history([post()], T - 599_999)));

    expect(operations.leave).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("참여 취소를 보내지 않았어요.");
    expect(alert).toHaveTextContent(
      "출발 10분 전부터 참여 신청과 취소가 마감됩니다.",
    );
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
    expect(past()[0]).toHaveTextContent("참여 취소함");
  });

  it("JOIN-006: 조회 후 오래 기다려 확인창을 열어도 정확히 T-10부터 취소하지 않는다", async () => {
    vi.useFakeTimers();
    const { operations } = await setup();
    await act(async () => vi.advanceTimersByTime(1_199_000));
    await openCancel();
    await act(async () => vi.advanceTimersByTime(1_000));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "참여 취소하기" }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("10분 전부터");
    await confirmCancel();
    expect(screen.queryByRole("button", { name: "참여 취소" })).toBeNull();
    expect(operations.leave).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
    });
    expect(rows()[0]).toHaveFocus();
  });

  it.each(["FINISHED", "CANCELLED"])(
    "AC-MY-004-01: %s에는 참여·취소 CTA가 없다",
    async (status) => {
      await setup(async () => history([post({ status })]));
      expect(screen.queryByRole("button", { name: "참여 취소" })).toBeNull();
      expect(upcoming()).toHaveLength(0);
      const link = within(past()[0]).getByRole("link", {
        name: /삼육대학교 정문 → 태릉입구역 7번 출구/,
      });
      expect(link).toHaveAttribute("href", "/posts/p1");
      expect(link).toHaveTextContent(
        status === "FINISHED" ? "일정 종료" : "모집 취소",
      );
    },
  );

  it("화면 복귀는 카드 수와 무관하게 이력을 한 번 재조회한다", async () => {
    const { operations } = await setup(async () =>
      history([post(), post({ id: "p2" }), post({ id: "p3" })]),
    );
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(operations.list).toHaveBeenCalledTimes(2);
  });

  it("늦게 도착한 화면 복귀 응답이 최신 이력을 다시 불러오게 하지 않는다", async () => {
    const original = history([post()]);
    let finish!: (value: unknown) => void;
    let finishLatest!: (value: unknown) => void;
    const delayed = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const latest = new Promise<unknown>((resolve) => {
      finishLatest = resolve;
    });
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockResolvedValueOnce(original)
      .mockReturnValueOnce(delayed)
      .mockReturnValueOnce(latest)
      .mockRejectedValue(new Error("unexpected retry"));
    const session = auth();
    await setup(list, undefined, "participated", session);
    session.me.mockRejectedValue(new Error("session recheck unavailable"));

    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await act(async () => finish(original));
    await act(async () =>
      finishLatest(history([post({ relation: "CANCELLED" })])),
    );

    expect(list).toHaveBeenCalledTimes(3);
    expect(past()[0]).toHaveTextContent("참여 취소함");
  });

  it("화면 복귀 재조회가 403이면 기존 이력을 지우고 접근 제한을 표시한다", async () => {
    const original = history([post()]);
    const list = vi
      .fn<MyHistoryOperations["list"]>()
      .mockResolvedValueOnce(original)
      .mockRejectedValueOnce(new ApiError(403, "private"))
      .mockResolvedValue(original);
    await setup(list);

    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(list).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("heading", { name: "접근 권한이 없어요" }),
    ).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
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
      screen.getByRole("link", { name: "로그인하고 내 내역 보기" }),
    ).toHaveAttribute("href", "/login?next=%2Fmy");
    expect(screen.queryByRole("link", { name: "모집글 쓰기" })).toBeNull();
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
