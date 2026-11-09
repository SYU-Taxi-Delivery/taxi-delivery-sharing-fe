import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParticipationPanel } from "./ParticipationPanel";
import type { ParticipationSnapshot } from "./participation";
import {
  useParticipation,
  type ParticipationOperations,
} from "./useParticipation";

vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-noto-sans-kr" }),
}));

const initial: ParticipationSnapshot = {
  postId: "post-1",
  type: "TAXI",
  title: "정문에서 태릉입구역까지 같이 가요",
  status: "OPEN",
  referenceTime: "2026-10-13T18:00:00+09:00",
  serverTime: "2026-10-13T17:30:00+09:00",
  currentMemberCount: 2,
  capacity: 4,
  viewerRelation: "JOINED",
  joinable: true,
  participantNames: ["테스트 참가자"],
  communicationUrl: "https://example.com/chat",
};

function setup(snapshot = initial) {
  const operations: ParticipationOperations = {
    join: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    refresh: vi.fn(async () => snapshot),
  };
  function Host() {
    const participation = useParticipation(snapshot, operations);
    return (
      <>
        <ParticipationPanel participation={participation} />
        {participation.snapshot.participantNames?.map((name) => (
          <p key={name}>{name}</p>
        ))}
        {participation.snapshot.communicationUrl && (
          <a href={participation.snapshot.communicationUrl}>소통 링크</a>
        )}
        <button type="button">다른 화면 동작</button>
      </>
    );
  }
  render(<Host />);
  return operations;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T08:30:00Z"));
  // jsdom has no modal focus/inert behavior; real-browser checks cover those.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

describe("participation panel", () => {
  it("AC-JOIN-006-11: opening confirmation sends no request and focuses the return action", () => {
    const operations = setup();
    fireEvent.click(screen.getByRole("button", { name: "참여 취소" }));
    const dialog = screen.getByRole("dialog", {
      name: "내 참여를 취소할까요?",
    });
    expect(dialog).toHaveTextContent("내 참여만 취소돼요");
    expect(
      within(dialog).getByRole("button", { name: "돌아가기" }),
    ).toHaveFocus();
    expect(operations.cancel).toHaveBeenCalledTimes(0);
  });

  it.each(["돌아가기", "참여 취소 확인창 닫기", "Escape"])(
    "AC-JOIN-006-07/%s: dismissal sends no request and restores trigger focus",
    (dismissal) => {
      const operations = setup();
      const trigger = screen.getByRole("button", { name: "참여 취소" });
      fireEvent.click(trigger);
      const dialog = screen.getByRole("dialog");
      if (dismissal === "Escape")
        fireEvent(
          dialog,
          new Event("cancel", { bubbles: false, cancelable: true }),
        );
      else
        fireEvent.click(
          within(dialog).getByRole("button", { name: dismissal }),
        );
      expect(dialog.hasAttribute("open")).toBe(false);
      expect(trigger).toHaveFocus();
      expect(operations.cancel).toHaveBeenCalledTimes(0);
    },
  );

  it("AC-JOIN-006-01: cancellation updates parent-visible protected data and feedback", async () => {
    const operations = setup();
    vi.mocked(operations.refresh).mockResolvedValue({
      ...initial,
      viewerRelation: "CANCELLED",
      currentMemberCount: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "참여 취소" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "내 참여 취소" }));
    });
    expect(screen.queryByRole("link", { name: "소통 링크" })).toBeNull();
    expect(screen.queryByText("테스트 참가자")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "내 참여가 취소됐어요.",
    );
    expect(screen.getByText(/현재 1 \/ 4명/)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "3자리 남았어요" }),
    ).toBeVisible();
    expect(operations.cancel).toHaveBeenCalledTimes(1);
  });

  it("slow cancellation does not steal focus after the user moves to another control", async () => {
    const operations = setup();
    let completeCancellation!: () => void;
    vi.mocked(operations.cancel).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          completeCancellation = resolve;
        }),
    );
    vi.mocked(operations.refresh).mockResolvedValue({
      ...initial,
      viewerRelation: "CANCELLED",
      currentMemberCount: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "참여 취소" }));
    const dialog = screen.getByRole("dialog");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "내 참여 취소" }));
    });
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(operations.cancel).toHaveBeenCalledTimes(1);
    const otherControl = screen.getByRole("button", { name: "다른 화면 동작" });
    otherControl.focus();
    expect(otherControl).toHaveFocus();

    await act(async () => completeCancellation());

    expect(screen.getByRole("status")).toHaveTextContent(
      "내 참여가 취소됐어요.",
    );
    expect(otherControl).toHaveFocus();
  });

  it("AC-JOIN-006-09: reaching cutoff inside confirmation disables confirmation", async () => {
    const operations = setup({
      ...initial,
      serverTime: "2026-10-13T17:49:59+09:00",
    });
    fireEvent.click(screen.getByRole("button", { name: "참여 취소" }));
    act(() => vi.advanceTimersByTime(1000));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "내 참여 취소" }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("10분 전");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "내 참여 취소" }),
    );
    expect(operations.cancel).toHaveBeenCalledTimes(0);
  });

  it("AC-JOIN-004-01: author gets explanation and no participation CTA", () => {
    setup({ ...initial, viewerRelation: "AUTHOR" });
    expect(screen.queryByRole("button", { name: "참여하기" })).toBeNull();
    expect(
      screen.getByText("작성자는 본인 모집에 참여할 수 없습니다."),
    ).toBeVisible();
  });

  it("AC-DISC-003-02: time cutoff is participation cutoff while OPEN stays unchanged", () => {
    setup({
      ...initial,
      viewerRelation: "NONE",
      serverTime: "2026-10-13T17:50:00+09:00",
    });
    expect(screen.getByRole("heading", { name: "참여 마감" })).toBeVisible();
    expect(screen.getByRole("button", { name: "참여하기" })).toBeDisabled();
  });

  it.each(["OPEN", "FULL", "CLOSED"] as const)(
    "%s at reference time shows completion and no join CTA",
    (status) => {
      setup({
        ...initial,
        status,
        viewerRelation: "NONE",
        serverTime: "2026-10-13T18:00:00+09:00",
        currentMemberCount: status === "FULL" ? 4 : 2,
      });
      expect(screen.getByRole("heading", { name: "모집 완료" })).toBeVisible();
      expect(screen.getAllByText("완료된 모집입니다.")[0]).toBeVisible();
      expect(screen.queryByRole("button", { name: "참여하기" })).toBeNull();
      expect(screen.queryByText(/참여 신청·취소는/)).toBeNull();
    },
  );

  it.each(["OPEN", "FULL", "CLOSED"] as const)(
    "%s past reference time shows completion and no cancellation CTA",
    (status) => {
      setup({
        ...initial,
        status,
        serverTime: "2026-10-13T18:00:00.001+09:00",
        currentMemberCount: status === "FULL" ? 4 : 2,
      });
      expect(screen.getByRole("heading", { name: "모집 완료" })).toBeVisible();
      expect(screen.getAllByText("완료된 모집입니다.")[0]).toBeVisible();
      expect(screen.queryByRole("button", { name: "참여 취소" })).toBeNull();
      expect(screen.queryByText(/참여 신청·취소는/)).toBeNull();
    },
  );

  it("FINISHED participation history shows completion instead of an active participation", () => {
    setup({
      ...initial,
      status: "FINISHED",
      serverTime: "2026-10-13T18:00:00+09:00",
    });
    expect(screen.getByRole("heading", { name: "모집 완료" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "참여 중이에요" })).toBeNull();
    expect(screen.queryByRole("button", { name: "참여 취소" })).toBeNull();
  });

  it("AC-NFR-TIME-01-01: both types show Seoul reference and 10-minute deadline", () => {
    setup({
      ...initial,
      type: "DELIVERY",
      referenceTime: "2026-10-13T09:00:00Z",
    });
    expect(screen.getByText(/18:00 주문 마감/)).toBeVisible();
    expect(screen.getByText(/17:50 이전까지/)).toBeVisible();
    expect(screen.getByText(/주문 마감 10분 전부터/)).toBeVisible();
  });

  it("today prefix uses the same Seoul date across UTC midnight", () => {
    setup({
      ...initial,
      serverTime: "2026-10-13T23:59:00Z",
      referenceTime: "2026-10-14T01:00:00Z",
    });
    expect(screen.getByText(/오늘 10:00 출발/)).toBeVisible();
  });

  it("next Seoul date has no today prefix even when both UTC dates match", () => {
    setup({
      ...initial,
      serverTime: "2026-10-13T14:59:00Z",
      referenceTime: "2026-10-13T15:01:00Z",
    });
    expect(screen.getByText(/00:01 출발/)).toBeVisible();
    expect(screen.queryByText(/오늘/)).toBeNull();
  });

  it("AC-UI-STATE-01: unavailable button has a visible accessible reason", () => {
    setup({
      ...initial,
      viewerRelation: "NONE",
      status: "FULL",
      currentMemberCount: 4,
      joinable: false,
    });
    expect(
      screen.getByRole("button", { name: "참여하기" }),
    ).toHaveAccessibleDescription("모집 정원이 마감되었습니다.");
  });

  it("REMOVED shows no title, schedule, count or protected content", () => {
    setup({ ...initial, status: "REMOVED" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "관리자에 의해 삭제된 모집",
    );
    expect(screen.queryByText(initial.title)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/작성자 포함/)).toBeNull();
  });

  it("refresh failure offers read-only retry and blocks another mutation", async () => {
    const operations = setup();
    vi.mocked(operations.refresh).mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "참여 취소" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "내 참여 취소" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("내 참여는 취소됐지만");
    expect(
      screen.getByRole("button", { name: "다시 참여하기" }),
    ).toBeDisabled();
    vi.mocked(operations.refresh).mockResolvedValue({
      ...initial,
      viewerRelation: "CANCELLED",
      currentMemberCount: 1,
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "최신 상태 다시 조회" }),
      );
    });
    expect(operations.cancel).toHaveBeenCalledTimes(1);
    expect(operations.refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "다시 참여하기" })).toBeEnabled();
  });
});

describe("participation scene", () => {
  const scene = () => document.querySelector("[data-scene]");
  const name = () => scene()?.getAttribute("data-scene");
  const guest = { ...initial, viewerRelation: "NONE" as const };
  // On screen → arrival starts: two zero-delay steps, one per render.
  const settle = async () => {
    await act(async () => vi.advanceTimersByTime(0));
    await act(async () => vi.advanceTimersByTime(0));
  };
  const wait = (ms: number) => act(async () => vi.advanceTimersByTime(ms));

  it("arrives once when the page opens, then rests; no result scene without a confirmed request", async () => {
    setup();
    await settle();
    expect(name()).toBe("taxi-enter");
    await wait(1100);
    expect(name()).toBe("taxi-rest");
    fireEvent.click(screen.getByRole("button", { name: "참여 취소" }));
    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    expect(name()).not.toMatch(/-(join|leave)$/);
  });

  it.each([
    ["TAXI", "taxi"],
    ["DELIVERY", "delivery"],
  ] as const)(
    "plays %s boarding only after the join request succeeded, then rests",
    async (type, kind) => {
      const operations = setup({ ...guest, type });
      vi.mocked(operations.refresh).mockResolvedValue({
        ...guest,
        type,
        viewerRelation: "JOINED",
        currentMemberCount: 3,
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
      });
      expect(operations.join).toHaveBeenCalledTimes(1);
      expect(name()).toBe(`${kind}-join`);
      expect(scene()?.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      // The text feedback still carries the result on its own.
      expect(screen.getByRole("status")).toHaveTextContent(
        "참여 신청이 완료됐어요.",
      );
      await wait(1300);
      expect(name()).toBe(`${kind}-rest`);
    },
  );

  it("plays the step-out scene after a confirmed cancellation", async () => {
    const operations = setup({ ...initial, type: "DELIVERY" });
    vi.mocked(operations.refresh).mockResolvedValue({
      ...initial,
      type: "DELIVERY",
      viewerRelation: "CANCELLED",
      currentMemberCount: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "참여 취소" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "내 참여 취소" }));
    });
    expect(operations.cancel).toHaveBeenCalledTimes(1);
    expect(name()).toBe("delivery-leave");
  });

  it("never plays a result when the request fails", async () => {
    const operations = setup(guest);
    vi.mocked(operations.join).mockRejectedValue(new Error("409"));
    vi.mocked(operations.refresh).mockResolvedValue({
      ...guest,
      status: "FULL",
      currentMemberCount: 4,
      joinable: false,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
    });
    expect(operations.join).toHaveBeenCalledTimes(1);
    expect(name()).not.toMatch(/-(join|leave)$/);
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("shows the order's bags at rest, with yours only while you have joined", async () => {
    setup({ ...initial, type: "DELIVERY" });
    await settle();
    await wait(1100);
    expect(scene()?.querySelectorAll('[class*="restBag"]')).toHaveLength(3);
  });

  it("wiggles now and then after a quiet pause, never while a request is pending", async () => {
    const operations = setup(guest);
    await settle();
    await wait(1100);
    expect(name()).toBe("taxi-rest");
    await wait(6000);
    expect(name()).toBe("taxi-rest");
    await wait(4000);
    expect(name()).toBe("taxi-idle");
    await wait(1100);
    expect(name()).toBe("taxi-rest");

    let resolve!: () => void;
    vi.mocked(operations.join).mockReturnValue(
      new Promise<void>((done) => (resolve = done)),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
    });
    await wait(20000);
    expect(name()).toBe("taxi-rest");
    await act(async () => resolve());
    expect(name()).toBe("taxi-join");
  });

  it("does not wiggle while the tab is hidden and does not catch up afterwards", async () => {
    setup(guest);
    await settle();
    await wait(1100);
    const state = vi.spyOn(document, "visibilityState", "get");
    state.mockReturnValue("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await wait(30000);
    expect(name()).toBe("taxi-rest");
    state.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(name()).toBe("taxi-rest");
    await wait(10000);
    expect(name()).toBe("taxi-idle");
  });

  it("replays the arrival from the scene itself without sending a request", async () => {
    const operations = setup(guest);
    await settle();
    await wait(1100);
    fireEvent.click(
      screen.getByRole("button", { name: "택시 모션 다시 보기" }),
    );
    expect(name()).toBe("taxi-enter");
    expect(operations.join).not.toHaveBeenCalled();
    expect(operations.cancel).not.toHaveBeenCalled();
    expect(operations.refresh).not.toHaveBeenCalled();
  });

  it("ignores replay taps while the request is pending", async () => {
    const operations = setup(guest);
    await settle();
    await wait(1100);
    let resolve!: () => void;
    vi.mocked(operations.join).mockReturnValue(
      new Promise<void>((done) => (resolve = done)),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
    });
    fireEvent.click(
      screen.getByRole("button", { name: "택시 모션 다시 보기" }),
    );
    expect(name()).toBe("taxi-rest");
    await act(async () => resolve());
    expect(name()).toBe("taxi-join");
  });

  it("ignores replay taps while a result scene plays", async () => {
    const operations = setup(guest);
    vi.mocked(operations.refresh).mockResolvedValue({
      ...guest,
      viewerRelation: "JOINED",
      currentMemberCount: 3,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
    });
    fireEvent.click(
      screen.getByRole("button", { name: "택시 모션 다시 보기" }),
    );
    expect(name()).toBe("taxi-join");
  });

  it("skips the automatic arrival and wiggle with reduced motion", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    setup(guest);
    await settle();
    expect(name()).toBe("taxi-rest");
    await wait(30000);
    expect(name()).toBe("taxi-rest");
  });
});
