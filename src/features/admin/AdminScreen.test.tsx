import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/features/auth/auth";
import {
  AuthProvider,
  useAuth,
  type AuthController,
} from "@/features/auth/AuthProvider";
import { users } from "@/test/fixtures";
import { AdminScreen } from "./AdminScreen";
import {
  AdminError,
  type AdminOperations,
  type AdminReportDetail,
  type ReportResolution,
} from "./admin";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-noto" }),
}));

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

const CREATED = "2026-10-30T09:00:00+09:00";
const PROCESSED = "2026-10-30T09:30:00+09:00";
function report(patch: Partial<AdminReportDetail> = {}) {
  return {
    id: "r1",
    status: "PENDING" as const,
    reason: "ABUSE" as const,
    createdAt: CREATED,
    postId: "p1",
    postTitle: "신고 대상 모집",
    postStatus: "OPEN" as const,
    detail: "확인이 필요한 신고 내용",
    reporterId: "reporter-1",
    processedAt: null,
    processedBy: null,
    postContent: "모집 본문 확인",
    referenceTime: "2026-10-30T10:00:00+09:00",
    email: "private@example.com",
    phone: "010-private",
    communicationUrl: "https://secret.invalid/chat",
    ...patch,
  };
}
const done = () =>
  report({
    id: "r2",
    postId: "p2",
    postTitle: "이미 처리된 모집",
    status: "RESOLVED",
    processedAt: PROCESSED,
    processedBy: "server-moderator",
  });
function operations(patch: Partial<AdminOperations> = {}) {
  let reports = [done(), report()];
  return {
    list: vi.fn(async () => ({ content: reports })),
    load: vi.fn(async (id: string) => reports.find((item) => item.id === id)),
    process: vi.fn(async (id: string, resolution: ReportResolution) => {
      reports = reports.map((item) =>
        item.id === id
          ? {
              ...item,
              status: resolution,
              processedAt: PROCESSED,
              processedBy: "server-moderator",
            }
          : item,
      );
      return reports.find((item) => item.id === id);
    }),
    removePost: vi.fn(async (postId: string) => {
      reports = reports.map((item) =>
        item.postId === postId
          ? {
              ...item,
              postStatus: "REMOVED",
              postTitle: null,
              postContent: null,
              referenceTime: null,
            }
          : item,
      );
      return {
        postId,
        status: "REMOVED",
        participationEffect: "CANCELLED_ACTIVE",
        removedAt: PROCESSED,
        removedBy: "server-moderator",
      };
    }),
    ...patch,
  } satisfies AdminOperations;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
async function setup(
  api: AdminOperations | undefined = operations(),
  initialUser: CurrentUser | null = users.admin,
) {
  let currentUser = initialUser;
  let controller!: AuthController;
  const auth = {
    me: vi.fn(async () => currentUser),
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
  };
  function Probe() {
    controller = useAuth();
    return <span data-testid="auth-state">{controller.status}</span>;
  }
  const tree = (operations: AdminOperations | undefined) => (
    <AuthProvider operations={auth}>
      <Probe />
      <AdminScreen operations={operations} />
    </AuthProvider>
  );
  const view = render(tree(api));
  await act(async () => {});
  await act(async () => {});
  return {
    rerender: async (next: AdminOperations) => {
      view.rerender(tree(next));
      await act(async () => {});
    },
    changeUser: async (user: CurrentUser) => {
      currentUser = user;
      await act(async () => controller.check());
    },
  };
}
const click = (name: string | RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
const open = (id = "r1") => click(`신고 ${id} 상세 보기`);
const hide = () =>
  act(async () => {
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "모집 숨김",
      }),
    );
  });

describe("관리자 신고 목록과 접근 제어", () => {
  it("AC-ADMIN-001-01: 대기 신고가 먼저 보이고 목록에서 상세로 이동한다", async () => {
    const api = operations();
    await setup(api);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("신고 대상 모집");
    expect(rows[0]).toHaveTextContent("처리 대기");
    await open();
    expect(api.load).toHaveBeenCalledWith("r1");
    expect(
      screen.getByText("신고자 식별값").nextElementSibling,
    ).toHaveTextContent("reporter-1");
    expect(screen.getByText("모집 본문 확인")).toBeVisible();
    expect(document.body).not.toHaveTextContent(
      /private@example|010-private|secret.invalid/,
    );
    await click("신고 목록으로");
    expect(screen.getByRole("heading", { name: "신고 목록" })).toHaveFocus();
  });

  it.each([null, users.student])(
    "비로그인·일반 사용자 %j는 관리자 요청을 하지 않는다",
    async (user) => {
      const api = operations();
      await setup(api, user);
      expect(api.list).not.toHaveBeenCalled();
      expect(screen.queryByText("신고 대상 모집")).toBeNull();
      expect(
        screen.getByRole("heading", {
          name: user ? "접근 권한이 없어요" : "로그인이 필요해요",
        }),
      ).toBeVisible();
    },
  );

  it("기본 operation은 가짜 신고 대신 연동 준비를 안내한다", async () => {
    render(
      <AuthProvider
        operations={{
          me: async () => users.admin,
          login: async () => {},
          logout: async () => {},
        }}
      >
        <AdminScreen />
      </AuthProvider>,
    );
    await act(async () => {});
    expect(await screen.findByText(/관리자 화면 연동을 준비/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "해결 처리" })).toBeNull();
  });

  it("빈 목록과 조회 오류를 구분하고 재조회한다", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("private query failure"))
      .mockResolvedValue({ content: [] });
    await setup(operations({ list }));
    expect(screen.getByRole("alert")).not.toHaveTextContent("private");
    expect(screen.queryByText("접수된 신고가 없어요.")).toBeNull();
    await click("새로 불러오기");
    expect(screen.getByText("접수된 신고가 없어요.")).toBeVisible();
  });

  it("목록을 불러오는 동안 로딩을 표시한다", async () => {
    const pending = deferred<unknown>();
    await setup(operations({ list: vi.fn(() => pending.promise) }));
    expect(screen.getByText("신고 목록을 불러오고 있어요.")).toBeVisible();
    await act(async () => pending.resolve({ content: [] }));
    expect(screen.getByText("접수된 신고가 없어요.")).toBeVisible();
  });

  it("AC-ADMIN-002-01: 없는 신고는 이전 내용을 표시하지 않는다", async () => {
    await setup(
      operations({
        load: vi.fn(async () => {
          throw new AdminError("notFound");
        }),
      }),
    );
    await open();
    expect(screen.getByRole("alert")).toHaveTextContent("찾을 수 없어요");
    expect(screen.queryByText("모집 본문 확인")).toBeNull();
    expect(screen.queryByRole("button", { name: "해결 처리" })).toBeNull();
  });

  it("현재 401은 관리자 정보를 지우고 로그인 만료를 안내한다", async () => {
    await setup(
      operations({
        load: vi.fn(async () => {
          throw new ApiError(401, "private");
        }),
      }),
    );
    await open();
    expect(
      screen.getByRole("heading", { name: "로그인이 만료됐어요" }),
    ).toBeVisible();
    expect(screen.queryByText("신고 대상 모집")).toBeNull();
  });

  it("403은 이전 신고 목록·상세를 지우고 권한 재확인을 제공한다", async () => {
    const api = operations({
      load: vi.fn(async () => {
        throw new ApiError(403, "private");
      }),
    });
    await setup(api);
    await open();
    expect(
      screen.getByRole("heading", { name: "접근 권한이 없어요" }),
    ).toBeVisible();
    expect(screen.queryByText("신고 대상 모집")).toBeNull();
    expect(
      screen.getByRole("button", { name: "관리자 권한 다시 확인" }),
    ).toBeEnabled();
  });
});

describe("신고 처리와 별도 모집 숨김", () => {
  it.each(["RESOLVED", "REJECTED"] as const)(
    "AC-ADMIN-004-01: %s 성공은 서버 처리자를 표시하고 모집을 숨기지 않는다",
    async (resolution) => {
      const api = operations();
      await setup(api);
      await open();
      await click(resolution === "RESOLVED" ? "해결 처리" : "반려 처리");
      expect(api.process).toHaveBeenCalledWith("r1", resolution);
      expect(api.removePost).not.toHaveBeenCalled();
      expect(screen.getByText("처리자").nextElementSibling).toHaveTextContent(
        "server-moderator",
      );
      expect(
        screen.getByText("처리 시각").nextElementSibling,
      ).toHaveTextContent("09:30");
      expect(screen.getByText("모집 본문 확인")).toBeVisible();
      expect(screen.queryByRole("button", { name: "해결 처리" })).toBeNull();
      await click("신고 목록으로");
      expect(
        screen.getByRole("button", { name: "신고 r1 상세 보기" }).closest("li"),
      ).toHaveTextContent(resolution === "RESOLVED" ? "해결" : "반려");
    },
  );

  it("조치 중 반복 클릭을 막고 서버 성공 전에 상태를 바꾸지 않는다", async () => {
    const pending = deferred<unknown>();
    const process = vi.fn(() => pending.promise);
    await setup(operations({ process }));
    await open();
    await click("해결 처리");
    expect(screen.getByRole("button", { name: "반려 처리" })).toBeDisabled();
    expect(screen.getByText("신고 상태").nextElementSibling).toHaveTextContent(
      "처리 대기",
    );
    await click("해결 처리");
    expect(process).toHaveBeenCalledTimes(1);
    await act(async () =>
      pending.resolve(
        report({
          status: "RESOLVED",
          processedAt: PROCESSED,
          processedBy: "server-moderator",
        }),
      ),
    );
    expect(screen.queryByRole("button", { name: "해결 처리" })).toBeNull();
  });

  it("이미 처리된 신고는 처리 버튼을 제공하지 않는다", async () => {
    await setup();
    await open("r2");
    expect(screen.queryByRole("button", { name: "해결 처리" })).toBeNull();
    expect(screen.queryByRole("button", { name: "반려 처리" })).toBeNull();
  });

  it("응답 유실은 재조회 전 변경을 막고 자동 재처리하지 않는다", async () => {
    const process = vi.fn(async () => {
      throw new Error("private response lost");
    });
    const api = operations({ process });
    await setup(api);
    await open();
    await click("해결 처리");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private");
    expect(screen.getByRole("button", { name: "해결 처리" })).toBeDisabled();
    expect(screen.getByText("모집 본문 확인")).toBeVisible();
    await click("최신 정보 확인");
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(process).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "해결 처리" })).toBeEnabled();
  });

  it.each([
    null,
    report({
      id: "wrong-report",
      status: "RESOLVED",
      processedAt: PROCESSED,
      processedBy: "server-moderator",
    }),
  ])(
    "잘못된 성공 응답 %j는 결과 불명으로 처리하고 재조회를 요구한다",
    async (response) => {
      await setup(operations({ process: vi.fn(async () => response) }));
      await open();
      await click("해결 처리");
      expect(screen.getByRole("button", { name: "해결 처리" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "최신 정보 확인" }),
      ).toBeVisible();
      expect(
        screen.getByText("신고 상태").nextElementSibling,
      ).toHaveTextContent("처리 대기");
    },
  );

  it("충돌 응답도 최신 정보 확인 전 같은 조치를 재시도하지 않는다", async () => {
    const process = vi.fn(async () => {
      throw new AdminError("conflict");
    });
    await setup(operations({ process }));
    await open();
    await click("반려 처리");
    expect(screen.getByRole("button", { name: "반려 처리" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "최신 정보 확인" }),
    ).toBeVisible();
    expect(process).toHaveBeenCalledTimes(1);
  });

  it.each(["CANCELLED_ACTIVE", "PRESERVED_HISTORY"] as const)(
    "AC-ADMIN-003: 숨김 확인 후 %s 서버 결과를 표시하고 콘텐츠를 제거한다",
    async (effect) => {
      const api = operations({
        removePost: vi.fn(async (postId) => ({
          postId,
          status: "REMOVED",
          participationEffect: effect,
          removedAt: PROCESSED,
          removedBy: "server-moderator",
        })),
      });
      await setup(api);
      await open();
      await click("모집 숨김");
      expect(api.removePost).not.toHaveBeenCalled();
      expect(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "돌아가기",
        }),
      ).toHaveFocus();
      await hide();
      expect(api.removePost).toHaveBeenCalledWith("p1");
      expect(screen.queryByText("모집 본문 확인")).toBeNull();
      expect(
        screen.getByRole("heading", { name: "관리자에 의해 삭제된 모집" }),
      ).toBeVisible();
      expect(
        screen.getByText(
          effect === "CANCELLED_ACTIVE"
            ? "진행 중이던 참여는 취소 처리됐어요."
            : "완료된 모집의 참여 이력은 유지돼요.",
        ),
      ).toBeVisible();
      expect(screen.getByText(/숨김 처리:/)).toHaveTextContent(
        "server-moderator",
      );
      expect(
        screen.getByText("신고 상태").nextElementSibling,
      ).toHaveTextContent("처리 대기");
      expect(api.process).not.toHaveBeenCalled();
      await click("신고 목록으로");
      expect(screen.queryByText("신고 대상 모집")).toBeNull();
    },
  );

  it("숨김 거절은 기존 콘텐츠를 유지하고 완료로 표시하지 않는다", async () => {
    await setup(
      operations({
        removePost: vi.fn(async () => {
          throw new AdminError("invalid");
        }),
      }),
    );
    await open();
    await click("모집 숨김");
    await hide();
    expect(screen.getByText("모집 본문 확인")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "관리자에 의해 삭제된 모집" }),
    ).toBeNull();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("다른 모집의 숨김 응답은 완료로 반영하지 않고 재조회를 요구한다", async () => {
    await setup(
      operations({
        removePost: vi.fn(async () => ({
          postId: "wrong-post",
          status: "REMOVED",
          participationEffect: "CANCELLED_ACTIVE",
          removedAt: PROCESSED,
          removedBy: "server-moderator",
        })),
      }),
    );
    await open();
    await click("모집 숨김");
    await hide();
    expect(screen.getByText("모집 본문 확인")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "최신 정보 확인" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "해결 처리" })).toBeDisabled();
  });

  it("숨김 대기 중 닫으면 비활성 버튼 대신 상세 제목으로 포커스가 돌아온다", async () => {
    const pending = deferred<unknown>();
    await setup(operations({ removePost: vi.fn(() => pending.promise) }));
    await open();
    await click("모집 숨김");
    await hide();
    await act(async () => {
      fireEvent(
        screen.getByRole("dialog"),
        new Event("cancel", { cancelable: true }),
      );
    });
    expect(screen.getByRole("heading", { name: "신고 상세" })).toHaveFocus();
    await act(async () =>
      pending.resolve({
        postId: "p1",
        status: "REMOVED",
        participationEffect: "CANCELLED_ACTIVE",
        removedAt: PROCESSED,
        removedBy: "server-moderator",
      }),
    );
  });

  it("조치 중 대상이 사라진 404는 이전 상세를 지운다", async () => {
    await setup(
      operations({
        process: vi.fn(async () => {
          throw new ApiError(404, "");
        }),
      }),
    );
    await open();
    await click("해결 처리");
    expect(screen.queryByText("모집 본문 확인")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("찾을 수 없어요");
  });
});

describe("최신 상태 재확인", () => {
  it("상세에서 삭제 상태를 확인하면 같은 모집의 다른 신고도 삭제 안내만 남긴다", async () => {
    await setup(
      operations({
        list: vi.fn(async () => ({
          content: [report(), report({ id: "r3" })],
        })),
        load: vi.fn(async () =>
          report({
            postStatus: "REMOVED",
            postTitle: null,
            postContent: null,
            referenceTime: null,
          }),
        ),
      }),
    );
    await open();
    expect(screen.queryByText("모집 본문 확인")).toBeNull();
    await click("신고 목록으로");
    expect(screen.queryByText("신고 대상 모집")).toBeNull();
    expect(screen.getAllByText("관리자에 의해 삭제된 모집")).toHaveLength(2);
  });

  it("최신 정보 확인 중 상세 403은 앞선 목록 성공으로 권한을 복구하지 않는다", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(report())
      .mockRejectedValue(new ApiError(403, ""));
    await setup(
      operations({
        load,
        process: vi.fn(async () => {
          throw new AdminError("unknownOutcome");
        }),
      }),
    );
    await open();
    await click("해결 처리");
    await click("최신 정보 확인");
    expect(
      screen.getByRole("heading", { name: "접근 권한이 없어요" }),
    ).toBeVisible();
    expect(screen.queryByText("모집 본문 확인")).toBeNull();
    expect(
      screen.getByRole("button", { name: "관리자 권한 다시 확인" }),
    ).toBeEnabled();
  });

  it("최신 목록 조회 실패에도 결과 확인과 재시도 안내를 유지한다", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ content: [report()] })
      .mockRejectedValueOnce(new Error("read failure"))
      .mockResolvedValue({ content: [report()] });
    await setup(
      operations({
        list,
        process: vi.fn(async () => {
          throw new AdminError("unknownOutcome");
        }),
      }),
    );
    await open();
    await click("해결 처리");
    await click("최신 정보 확인");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "최신 신고 목록을 확인하지 못했어요",
    );
    expect(screen.getByRole("button", { name: "해결 처리" })).toBeDisabled();
    await click("최신 정보 확인");
    expect(screen.getByRole("button", { name: "해결 처리" })).toBeEnabled();
  });
});

describe("이전 요청 격리", () => {
  it("다른 신고를 연 뒤 이전 상세의 늦은 401은 현재 화면을 지우지 않는다", async () => {
    const old = deferred<unknown>();
    await setup(
      operations({
        load: vi.fn((id) =>
          id === "r1" ? old.promise : Promise.resolve(done()),
        ),
      }),
    );
    await open();
    await click("신고 목록으로");
    await open("r2");
    await act(async () => old.reject(new ApiError(401, "")));
    expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated");
    expect(screen.getByText("이미 처리된 모집")).toBeVisible();
  });

  it("operation 교체 뒤 이전 목록 401은 새 관리자를 로그아웃시키지 않는다", async () => {
    const old = deferred<unknown>();
    const view = await setup(operations({ list: vi.fn(() => old.promise) }));
    await view.rerender(operations());
    await act(async () => old.reject(new ApiError(401, "")));
    expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated");
    expect(screen.getByText("신고 대상 모집")).toBeVisible();
  });

  it("사용자 변경 뒤 이전 조치 401은 새 사용자의 화면을 바꾸지 않는다", async () => {
    const old = deferred<unknown>();
    const view = await setup(operations({ process: vi.fn(() => old.promise) }));
    await open();
    await click("해결 처리");
    await view.changeUser({
      ...users.admin,
      id: "another-admin",
      displayName: "다른 관리자",
    });
    await act(async () => old.reject(new ApiError(401, "")));
    expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated");
    expect(screen.getByRole("heading", { name: "신고 목록" })).toBeVisible();
  });
});
