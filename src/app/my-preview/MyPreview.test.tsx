import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  toMyHistory,
  type MyHistory,
  type MyHistoryOperations,
  type MyTab,
} from "@/features/my/myHistory";
import { MyPreview } from "./MyPreview";
import MyPreviewPage from "./page";

const { renderHistory, notFound } = vi.hoisted(() => ({
  renderHistory: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("preview not found");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/my/MyHistoryScreen", () => ({
  MyHistoryScreen: (props: unknown) => {
    renderHistory(props);
    return null;
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  renderHistory.mockClear();
  notFound.mockClear();
});
afterEach(() => vi.useRealTimers());

const props = () =>
  renderHistory.mock.lastCall?.[0] as {
    tab: MyTab;
    basePath: string;
    operations: MyHistoryOperations;
  };

async function finish<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([
    promise,
    vi.advanceTimersByTimeAsync(400),
  ]);
  return result;
}

async function setup() {
  let view: ReturnType<typeof render>;
  await act(async () => {
    view = render(<MyPreview tab="participated" />);
  });
  return view!;
}

const list = async (
  operations: MyHistoryOperations,
  tab: MyTab = "participated",
): Promise<MyHistory> => toMyHistory(await finish(operations.list(tab)), tab);

describe("MyPreview", () => {
  it("두 탭에 상태별 UI 모델과 최소 삭제 이력을 제공하고 탭 이동 때 operation을 유지한다", async () => {
    const view = await setup();
    const operations = props().operations;
    expect(props().basePath).toBe("/my-preview");
    for (const tab of ["participated", "created"] as const) {
      const history = await list(operations, tab);
      expect(new Set(history.content.map((item) => item.status))).toEqual(
        new Set(["OPEN", "FULL", "CLOSED", "FINISHED", "CANCELLED", "REMOVED"]),
      );
      expect(
        history.content.every((item) =>
          tab === "created"
            ? item.relation === "AUTHOR"
            : ["JOINED", "CANCELLED"].includes(item.relation),
        ),
      ).toBe(true);
      expect(
        Object.keys(history.content.find((item) => item.status === "REMOVED")!),
      ).toEqual(["id", "status", "relation"]);
    }
    view.rerender(<MyPreview tab="created" />);
    expect(props().tab).toBe("created");
    expect(props().operations).toBe(operations);
  });

  it("참여 취소 후 같은 카드의 관계·인원을 바꾸며 FULL을 열고 CLOSED는 유지한다", async () => {
    await setup();
    const operations = props().operations;
    const before = await list(operations);
    for (const status of ["FULL", "CLOSED"] as const) {
      const initial = before.content.find((item) => item.status === status)!;
      if (initial.status === "REMOVED") throw new Error("invalid fixture");
      await finish(operations.leave(initial.id));
      const after = await list(operations);
      const changed = after.content.find((item) => item.id === initial.id)!;
      expect(changed.relation).toBe("CANCELLED");
      expect(changed.status).toBe(status === "FULL" ? "OPEN" : "CLOSED");
      expect(changed).toHaveProperty(
        "currentMemberCount",
        initial.currentMemberCount - 1,
      );
      expect(after.content).toHaveLength(before.content.length);
    }
  });

  it("실패한 취소는 이력을 바꾸지 않고 후속 조회 실패는 한 번 뒤 재시도할 수 있다", async () => {
    await setup();
    fireEvent.change(screen.getByRole("combobox", { name: "상황" }), {
      target: { value: "leaveError" },
    });
    let operations = props().operations;
    await expect(finish(operations.leave("participated-0"))).rejects.toThrow(
      "Failed to fetch",
    );
    expect((await list(operations)).content[0].relation).toBe("JOINED");

    fireEvent.change(screen.getByRole("combobox", { name: "상황" }), {
      target: { value: "refreshError" },
    });
    operations = props().operations;
    await finish(operations.leave("participated-0"));
    await expect(list(operations)).rejects.toThrow("Failed to fetch");
    expect((await list(operations)).content[0].relation).toBe("CANCELLED");
  });

  it("빈 이력·조회 오류·실제 시계의 취소 경계 시나리오를 제공한다", async () => {
    await setup();
    const scenario = screen.getByRole("combobox", { name: "상황" });
    fireEvent.change(scenario, { target: { value: "empty" } });
    expect((await list(props().operations)).content).toEqual([]);
    fireEvent.change(scenario, { target: { value: "loadError" } });
    await expect(list(props().operations)).rejects.toThrow("Failed to fetch");
    fireEvent.change(scenario, { target: { value: "boundary" } });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(
      finish(props().operations.leave("participated-0")),
    ).rejects.toThrow("현재 참여를 취소할 수 없습니다.");
    expect((await list(props().operations)).content[0].relation).toBe("JOINED");
  });

  it("미리보기 라우트는 운영 환경에서도 열리고 탭 query를 전달한다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const page = await MyPreviewPage({
      searchParams: Promise.resolve({ tab: "created" }),
    });
    expect(page.props.tab).toBe("created");
    vi.stubEnv("NODE_ENV", "production");
    const production = await MyPreviewPage({
      searchParams: Promise.resolve({}),
    });
    expect(production.props.tab).toBe("participated");
    expect(notFound).not.toHaveBeenCalled();
  });
});
