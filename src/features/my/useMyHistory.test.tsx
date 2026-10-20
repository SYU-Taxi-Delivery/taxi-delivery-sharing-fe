import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type {
  MyHistory,
  MyHistoryItem,
  MyHistoryOperations,
  MyTab,
} from "./myHistory";
import { useMyHistory } from "./useMyHistory";

const { handleUnauthorized } = vi.hoisted(() => ({
  handleUnauthorized: vi.fn(),
}));
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ handleUnauthorized }),
}));

const card = {
  id: "post-1",
  type: "TAXI",
  departure: "정문",
  destination: "태릉입구역",
  status: "FULL",
  referenceTime: "2026-10-20T18:00:00+09:00",
  currentMemberCount: 4,
  capacity: 4,
  joinable: false,
  relation: "JOINED",
} satisfies MyHistoryItem;
const initial: MyHistory = {
  serverTime: "2026-10-20T17:49:59.999+09:00",
  content: [card],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup(list: MyHistoryOperations["list"] = vi.fn(async () => initial)) {
  const operations: MyHistoryOperations = {
    list,
    leave: vi.fn(async () => {}),
  };
  const hook = renderHook(
    ({ tab, operations }) => useMyHistory(tab, operations),
    { initialProps: { tab: "participated" as MyTab, operations } },
  );
  return { ...hook, operations };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("my history requests", () => {
  it("loads the selected tab and anchors its clock to the validated server result", async () => {
    const response = deferred<unknown>();
    const { result, operations } = setup(vi.fn(() => response.promise));
    expect(result.current.loading).toBe(true);
    expect(result.current.history).toBeNull();
    expect(operations.list).toHaveBeenCalledWith("participated");
    await act(async () => response.resolve(initial));
    expect(result.current.loading).toBe(false);
    expect(result.current.history).toEqual(initial);
    expect(result.current.nowMs).toBe(Date.parse(initial.serverTime));
  });

  it("retries a failed load without exposing a raw response", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret backend details"))
      .mockResolvedValueOnce(initial);
    const { result } = setup(list);
    await act(async () => {});
    expect(result.current.error).toContain("네트워크");
    expect(result.current.error).not.toContain("secret");
    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);
    await act(async () => {});
    expect(result.current.error).toBeNull();
    expect(result.current.history).toEqual(initial);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("explains the missing adapter and invalid data without displaying their errors", async () => {
    const missing = new Error("adapter internals");
    missing.name = "MyHistoryNotConnectedError";
    const list = vi
      .fn()
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce({ content: "invalid" });
    const { result } = setup(list);
    await act(async () => {});
    expect(result.current.error).toContain("연동을 준비");
    act(() => result.current.retry());
    await act(async () => {});
    expect(result.current.history).toBeNull();
    expect(result.current.error).toContain("이력 정보를 확인");
  });

  it("clears the previous tab immediately and ignores its delayed response", async () => {
    const delayed = deferred<unknown>();
    const created = {
      ...initial,
      content: initial.content.map((item) => ({ ...item, relation: "AUTHOR" })),
    };
    const list = vi
      .fn()
      .mockReturnValueOnce(delayed.promise)
      .mockResolvedValueOnce(created);
    const { result, rerender, operations } = setup(list);
    rerender({ tab: "created", operations });
    expect(result.current.history).toBeNull();
    await act(async () => {});
    expect(result.current.history?.content[0].relation).toBe("AUTHOR");
    await act(async () => delayed.resolve(initial));
    expect(result.current.history?.content[0].relation).toBe("AUTHOR");
    expect(list).toHaveBeenLastCalledWith("created");
  });

  it("ignores an abandoned adapter's unauthorized response", async () => {
    const delayed = deferred<unknown>();
    const { result, rerender, operations } = setup(
      vi.fn(() => delayed.promise),
    );
    const replacement = { ...operations, list: vi.fn(async () => initial) };
    rerender({ tab: "participated", operations: replacement });
    await act(async () => {});
    await act(async () => delayed.reject(new ApiError(401, "old user")));
    expect(result.current.history).toEqual(initial);
    expect(handleUnauthorized).not.toHaveBeenCalled();
  });

  it("an old refresh callback cannot start another adapter request", async () => {
    const { result, rerender, operations } = setup();
    await act(async () => {});
    const oldRefresh = result.current.refresh;
    const replacement = { ...operations, list: vi.fn(async () => initial) };
    rerender({ tab: "participated", operations: replacement });
    await act(async () => {
      await expect(oldRefresh()).rejects.toThrow();
    });
    expect(operations.list).toHaveBeenCalledTimes(1);
    expect(result.current.history).toEqual(initial);
  });

  it("ignores responses after unmount", async () => {
    const delayed = deferred<unknown>();
    const { unmount } = setup(vi.fn(() => delayed.promise));
    unmount();
    await act(async () => delayed.reject(new ApiError(401, "abandoned")));
    expect(handleUnauthorized).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    "clears protected history on a %s refresh",
    async (status) => {
      const list = vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockRejectedValueOnce(new ApiError(status, "private response"));
      const { result } = setup(list);
      await act(async () => {});
      await act(async () => {
        await expect(result.current.refresh()).rejects.toBeInstanceOf(ApiError);
      });
      expect(result.current.history).toBeNull();
      expect(result.current.forbidden).toBe(status === 403);
      expect(result.current.error).toBeNull();
      expect(handleUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    },
  );

  it("retains displayed history on a failed background refresh and rejects to the caller", async () => {
    const response = deferred<unknown>();
    const list = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(response.promise);
    const { result } = setup(list);
    await act(async () => {});
    let request!: Promise<MyHistory>;
    act(() => {
      request = result.current.refresh();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.history).toEqual(initial);
    await act(async () => {
      response.reject(new Error("offline"));
      await expect(request).rejects.toThrow("offline");
    });
    expect(result.current.history).toEqual(initial);
    expect(result.current.error).toBeNull();
  });

  it("only accepts the latest of concurrent refreshes", async () => {
    const delayed = deferred<unknown>();
    const latest = {
      ...initial,
      content: [{ ...initial.content[0], relation: "CANCELLED" }],
    };
    const list = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(delayed.promise)
      .mockResolvedValueOnce(latest);
    const { result } = setup(list);
    await act(async () => {});
    let stale!: Promise<MyHistory>;
    act(() => {
      stale = result.current.refresh();
    });
    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      delayed.resolve(initial);
      await expect(stale).rejects.toThrow();
    });
    expect(result.current.history?.content[0].relation).toBe("CANCELLED");
  });

  it("records confirmed cancellation without guessing counts or recruitment status", async () => {
    const { result } = setup();
    await act(async () => {});
    act(() => result.current.markCancelled("post-1"));
    expect(result.current.history?.content[0]).toEqual({
      ...initial.content[0],
      relation: "CANCELLED",
    });
    act(() => result.current.markCancelled("missing"));
    expect(result.current.history?.content).toHaveLength(1);
  });

  it("a pending background read cannot overwrite confirmed cancellation", async () => {
    const delayed = deferred<unknown>();
    const list = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(delayed.promise);
    const { result } = setup(list);
    await act(async () => {});
    let stale!: Promise<MyHistory>;
    act(() => {
      stale = result.current.refresh();
    });
    act(() => result.current.markCancelled("post-1"));
    await act(async () => {
      delayed.resolve(initial);
      await expect(stale).rejects.toThrow();
    });
    expect(result.current.history?.content[0].relation).toBe("CANCELLED");
  });
});

describe("one history server clock", () => {
  it("reads elapsed server time between scheduled boundaries", async () => {
    const history = { ...initial, serverTime: "2026-10-20T17:30:00+09:00" };
    const { result } = setup(vi.fn(async () => history));
    await act(async () => {});
    const start = Date.parse(history.serverTime);
    act(() => vi.advanceTimersByTime(300_000));
    expect(result.current.nowMs).toBe(start);
    expect(result.current.serverNow()).toBe(start + 300_000);
    act(() => vi.setSystemTime(new Date("2010-01-01T00:00:00Z")));
    expect(result.current.serverNow()).toBe(start + 300_000);
  });

  it("crosses the nearest T−10 and T boundaries across cards using elapsed time", async () => {
    const history: MyHistory = {
      ...initial,
      content: [
        ...initial.content,
        {
          ...card,
          id: "post-2",
          referenceTime: "2026-10-20T18:05:00+09:00",
        },
        { id: "removed", status: "REMOVED", relation: "CANCELLED" },
      ],
    };
    const { result } = setup(vi.fn(async () => history));
    await act(async () => {});
    const start = Date.parse(initial.serverTime);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.nowMs).toBe(start + 1);
    act(() => vi.advanceTimersByTime(300_000));
    expect(result.current.nowMs).toBe(start + 300_001);
    act(() => vi.setSystemTime(new Date("2010-01-01T00:00:00Z")));
    act(() => vi.advanceTimersByTime(300_000));
    expect(result.current.nowMs).toBe(start + 600_001);
    expect(result.current.history?.content[0].status).toBe("FULL");
    act(() => vi.advanceTimersByTime(300_000));
    expect(result.current.nowMs).toBe(start + 900_001);
  });
});
