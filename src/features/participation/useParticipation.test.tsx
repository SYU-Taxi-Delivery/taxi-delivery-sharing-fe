import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParticipationSnapshot } from "./participation";
import {
  useParticipation,
  type ParticipationOperations,
} from "./useParticipation";

const initial: ParticipationSnapshot = {
  postId: "post-1",
  type: "TAXI",
  title: "정문에서 태릉입구역까지 같이 가요",
  status: "OPEN",
  referenceTime: "2026-10-13T18:00:00+09:00",
  serverTime: "2026-10-13T17:30:00+09:00",
  currentMemberCount: 1,
  capacity: 4,
  viewerRelation: "NONE",
  joinable: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(snapshot = initial) {
  const operations: ParticipationOperations = {
    join: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    refresh: vi.fn(async () => snapshot),
  };
  const hook = renderHook(() => useParticipation(snapshot, operations));
  return { ...hook, operations };
}

beforeEach(() => {
  vi.useFakeTimers();
  // Device wall time is deliberately unrelated to the server clock.
  vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("participation requests", () => {
  it.each(["TAXI", "DELIVERY"] as const)(
    "AC-JOIN-001-01/%s: server result updates participation without optimistic count changes",
    async (type) => {
      const { result, operations } = setup({ ...initial, type });
      const response = deferred<void>();
      vi.mocked(operations.join).mockReturnValue(response.promise);
      vi.mocked(operations.refresh).mockResolvedValue({
        ...initial,
        type,
        viewerRelation: "JOINED",
        currentMemberCount: 2,
      });
      let request!: Promise<void>;
      act(() => {
        request = result.current.join();
      });
      expect(result.current.busy).toBe(true);
      expect(result.current.snapshot.currentMemberCount).toBe(1);
      await act(async () => {
        response.resolve();
        await request;
      });
      expect(result.current.snapshot.viewerRelation).toBe("JOINED");
      expect(result.current.snapshot.currentMemberCount).toBe(2);
      expect(result.current.feedback?.tone).toBe("success");
    },
  );

  it("AC-JOIN-001-05: two activations in one turn send one mutation", async () => {
    const { result, operations } = setup();
    const response = deferred<void>();
    vi.mocked(operations.join).mockReturnValue(response.promise);
    let request!: Promise<void>;
    act(() => {
      request = result.current.join();
      void result.current.join();
    });
    expect(operations.join).toHaveBeenCalledTimes(1);
    await act(async () => {
      response.resolve();
      await request;
    });
  });

  it("AC-JOIN-002-02: rejected last-seat request shows latest FULL and never success", async () => {
    const { result, operations } = setup({ ...initial, currentMemberCount: 3 });
    vi.mocked(operations.join).mockRejectedValue(
      new Error("raw backend response"),
    );
    vi.mocked(operations.refresh).mockResolvedValue({
      ...initial,
      status: "FULL",
      currentMemberCount: 4,
      joinable: false,
    });
    await act(() => result.current.join());
    expect(result.current.snapshot.status).toBe("FULL");
    expect(result.current.snapshot.viewerRelation).toBe("NONE");
    expect(result.current.feedback?.tone).toBe("error");
    expect(result.current.feedback?.message).toContain("정원");
    expect(result.current.feedback?.message.includes("raw backend")).toBe(
      false,
    );
  });

  it("AC-JOIN-003-02: rejoin reflects one current server relationship", async () => {
    const { result, operations } = setup({
      ...initial,
      viewerRelation: "CANCELLED",
    });
    vi.mocked(operations.refresh).mockResolvedValue({
      ...initial,
      viewerRelation: "JOINED",
      currentMemberCount: 2,
    });
    await act(() => result.current.join());
    expect(operations.join).toHaveBeenCalledTimes(1);
    expect(result.current.snapshot.viewerRelation).toBe("JOINED");
  });

  it.each(["OPEN", "FULL", "CLOSED"] as const)(
    "AC-JOIN-006-04/%s: confirmed cancel uses server count and transition",
    async (status) => {
      const starting = {
        ...initial,
        viewerRelation: "JOINED" as const,
        status,
        currentMemberCount: status === "OPEN" ? 3 : 4,
        joinable: false,
      };
      const { result, operations } = setup(starting);
      vi.mocked(operations.refresh).mockResolvedValue({
        ...starting,
        viewerRelation: "CANCELLED",
        status: status === "FULL" ? "OPEN" : status,
        currentMemberCount: starting.currentMemberCount - 1,
      });
      await act(() => result.current.cancel());
      expect(result.current.snapshot.viewerRelation).toBe("CANCELLED");
      expect(result.current.snapshot.status).toBe(
        status === "FULL" ? "OPEN" : status,
      );
      expect(result.current.snapshot.currentMemberCount).toBe(
        starting.currentMemberCount - 1,
      );
    },
  );

  it("AC-JOIN-006-01: confirmed cancel clears protected data before a delayed/failed refresh", async () => {
    const { result, operations } = setup({
      ...initial,
      viewerRelation: "JOINED",
      currentMemberCount: 2,
      participantNames: ["테스트 참가자"],
      communicationUrl: "https://example.com/chat",
    });
    const lookup = deferred<ParticipationSnapshot>();
    vi.mocked(operations.refresh).mockReturnValue(lookup.promise);
    let request!: Promise<void>;
    await act(async () => {
      request = result.current.cancel();
      await Promise.resolve();
    });
    expect(result.current.snapshot.viewerRelation).toBe("CANCELLED");
    expect(Object.hasOwn(result.current.snapshot, "participantNames")).toBe(
      false,
    );
    expect(Object.hasOwn(result.current.snapshot, "communicationUrl")).toBe(
      false,
    );
    expect(result.current.snapshot.currentMemberCount).toBe(2);
    lookup.resolve({ ...initial, viewerRelation: "CANCELLED" });
    await act(async () => {
      await request;
    });
  });

  it("confirmed cancel plus lookup failure preserves completion and permits read-only retry", async () => {
    const joined = {
      ...initial,
      viewerRelation: "JOINED" as const,
      currentMemberCount: 2,
      communicationUrl: "https://example.com/chat",
    };
    const { result, operations } = setup(joined);
    vi.mocked(operations.refresh).mockRejectedValueOnce(new Error("offline"));
    await act(() => result.current.cancel());
    expect(result.current.feedback?.message).toContain("내 참여는 취소됐지만");
    expect(result.current.needsRefresh).toBe(true);
    expect(result.current.snapshot.communicationUrl).toBeUndefined();
    await act(() => result.current.join());
    expect(operations.join).toHaveBeenCalledTimes(0);
    vi.mocked(operations.refresh).mockResolvedValue({
      ...initial,
      viewerRelation: "CANCELLED",
    });
    await act(() => result.current.refresh());
    expect(operations.cancel).toHaveBeenCalledTimes(1);
    expect(result.current.needsRefresh).toBe(false);
  });

  it("AC-JOIN-006-08: rejection and failed reconciliation preserve previous relationship", async () => {
    const joined = {
      ...initial,
      viewerRelation: "JOINED" as const,
      currentMemberCount: 2,
      communicationUrl: "https://example.com/chat",
    };
    const { result, operations } = setup(joined);
    vi.mocked(operations.cancel).mockRejectedValue(new Error("response lost"));
    vi.mocked(operations.refresh).mockRejectedValue(new Error("offline"));
    await act(() => result.current.cancel());
    expect(result.current.snapshot).toEqual(joined);
    expect(result.current.needsRefresh).toBe(true);
    expect(operations.cancel).toHaveBeenCalledTimes(1);
  });

  it("lost join response reconciles JOINED without claiming the rejected request succeeded", async () => {
    const { result, operations } = setup();
    vi.mocked(operations.join).mockRejectedValue(
      new SyntaxError("malformed successful response"),
    );
    vi.mocked(operations.refresh).mockResolvedValue({
      ...initial,
      viewerRelation: "JOINED",
      currentMemberCount: 2,
    });
    await act(() => result.current.join());
    expect(result.current.snapshot.viewerRelation).toBe("JOINED");
    expect(result.current.feedback?.tone).toBe("error");
    expect(result.current.feedback?.message).toContain("현재");
    expect(operations.join).toHaveBeenCalledTimes(1);
  });

  it("out-of-order old lookup cannot reach a new post after keyed unmount", async () => {
    const old = setup();
    const delayed = deferred<ParticipationSnapshot>();
    vi.mocked(old.operations.refresh).mockReturnValue(delayed.promise);
    let request!: Promise<void>;
    act(() => {
      request = old.result.current.refresh();
    });
    old.unmount();
    const current = setup({ ...initial, postId: "post-2" });
    await act(async () => {
      delayed.resolve({
        ...initial,
        viewerRelation: "JOINED",
        currentMemberCount: 2,
      });
      await request;
    });
    expect(current.result.current.snapshot.postId).toBe("post-2");
    expect(current.result.current.snapshot.viewerRelation).toBe("NONE");
    expect(current.result.current.feedback).toBeNull();
  });

  it("lookup locks concurrent writes and repeated reads", async () => {
    const { result, operations } = setup();
    const delayed = deferred<ParticipationSnapshot>();
    vi.mocked(operations.refresh).mockReturnValue(delayed.promise);
    let request!: Promise<void>;
    act(() => {
      request = result.current.refresh();
      void result.current.refresh();
      void result.current.join();
    });
    expect(operations.refresh).toHaveBeenCalledTimes(1);
    expect(operations.join).toHaveBeenCalledTimes(0);
    await act(async () => {
      delayed.resolve(initial);
      await request;
    });
  });

  it("a different post returned by refresh cannot replace the current post", async () => {
    const { result, operations } = setup();
    vi.mocked(operations.refresh).mockResolvedValue({
      ...initial,
      postId: "other",
    });
    await act(() => result.current.refresh());
    expect(result.current.snapshot.postId).toBe("post-1");
    expect(result.current.needsRefresh).toBe(true);
  });
});

describe("server clock", () => {
  it.each(["TAXI", "DELIVERY"] as const)(
    "AC-FLOW-MAIN-16/%s: an initial response past T removes URL while preserving enum and final names",
    (type) => {
      const { result, operations } = setup({
        ...initial,
        type,
        serverTime: "2026-10-13T18:00:00.001+09:00",
        viewerRelation: "JOINED",
        currentMemberCount: 2,
        participantNames: ["테스트 참가자"],
        communicationUrl: "https://example.com/chat",
      });
      expect(Object.hasOwn(result.current.snapshot, "communicationUrl")).toBe(
        false,
      );
      expect(result.current.snapshot.participantNames).toEqual([
        "테스트 참가자",
      ]);
      expect(result.current.snapshot.status).toBe("OPEN");
      expect(operations.refresh).toHaveBeenCalledTimes(0);
    },
  );

  it.each(["TAXI", "DELIVERY"] as const)(
    "AC-FLOW-MAIN-16/%s: mounted clock crosses T−10 then removes URL at exact T without changing enum",
    (type) => {
      const { result } = setup({
        ...initial,
        type,
        serverTime: "2026-10-13T17:49:59.999+09:00",
        viewerRelation: "JOINED",
        currentMemberCount: 2,
        participantNames: ["테스트 참가자"],
        communicationUrl: "https://example.com/chat",
      });
      expect(result.current.availability.action).toBe("cancel");
      act(() => vi.advanceTimersByTime(1));
      expect(result.current.availability.action).toBeNull();
      expect(result.current.snapshot.communicationUrl).toBe(
        "https://example.com/chat",
      );
      act(() => vi.advanceTimersByTime(599_999));
      expect(result.current.snapshot.communicationUrl).toBe(
        "https://example.com/chat",
      );
      act(() => vi.advanceTimersByTime(1));
      expect(Object.hasOwn(result.current.snapshot, "communicationUrl")).toBe(
        false,
      );
      expect(result.current.snapshot.participantNames).toEqual([
        "테스트 참가자",
      ]);
      expect(result.current.snapshot.status).toBe("OPEN");
    },
  );

  it("AC-FLOW-MAIN-16: refreshing an active enum past T cannot re-expose a returned URL", async () => {
    const joined: ParticipationSnapshot = {
      ...initial,
      serverTime: "2026-10-13T17:55:00+09:00",
      viewerRelation: "JOINED",
      currentMemberCount: 2,
      participantNames: ["테스트 참가자"],
      communicationUrl: "https://example.com/chat",
    };
    const { result, operations } = setup(joined);
    expect(result.current.snapshot.communicationUrl).toBe(
      joined.communicationUrl,
    );
    vi.mocked(operations.refresh).mockResolvedValue({
      ...joined,
      serverTime: "2026-10-13T18:00:00.001+09:00",
      status: "FULL",
      currentMemberCount: 4,
      communicationUrl: "https://example.com/refreshed-chat",
    });
    await act(() => result.current.refresh());
    expect(Object.hasOwn(result.current.snapshot, "communicationUrl")).toBe(
      false,
    );
    expect(result.current.snapshot.participantNames).toEqual(["테스트 참가자"]);
    expect(result.current.snapshot.status).toBe("FULL");
    expect(operations.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(["NONE", "JOINED"] as const)(
    "AC-JOIN-005-01/006-04/%s: exact millisecond cutoff while mounted",
    async (viewerRelation) => {
      const { result, operations } = setup({
        ...initial,
        viewerRelation,
        currentMemberCount: 2,
        serverTime: "2026-10-13T17:49:59.999+09:00",
      });
      expect(result.current.availability.action).toBe(
        viewerRelation === "JOINED" ? "cancel" : "join",
      );
      act(() => vi.advanceTimersByTime(1));
      expect(result.current.availability.action).toBeNull();
      await act(() =>
        viewerRelation === "JOINED"
          ? result.current.cancel()
          : result.current.join(),
      );
      expect(operations.join).toHaveBeenCalledTimes(0);
      expect(operations.cancel).toHaveBeenCalledTimes(0);
      expect(result.current.snapshot.status).toBe("OPEN");
    },
  );

  it("device clock changes do not reopen the server deadline", () => {
    const { result } = setup({
      ...initial,
      serverTime: "2026-10-13T17:50:00+09:00",
    });
    act(() => vi.setSystemTime(new Date("2010-01-01T00:00:00Z")));
    expect(result.current.availability.action).toBeNull();
  });

  it("visible-tab return reads server time and blocks writes after failed recheck", async () => {
    const { result, operations } = setup();
    vi.mocked(operations.refresh).mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(operations.refresh).toHaveBeenCalledTimes(1);
    expect(result.current.needsRefresh).toBe(true);
    await act(() => result.current.join());
    expect(operations.join).toHaveBeenCalledTimes(0);
  });
});
