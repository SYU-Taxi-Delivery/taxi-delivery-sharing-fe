import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AuthOperations, CurrentUser } from "@/features/auth/auth";
import {
  AuthProvider,
  useAuth,
  type AuthController,
} from "@/features/auth/AuthProvider";
import { CommentsPanel, type CommentsPanelProps } from "./CommentsPanel";
import {
  CommentsError,
  type CommentItem,
  type CommentsOperations,
} from "./comments";

vi.mock("next/navigation", () => ({
  usePathname: () => "/posts/p1",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  // jsdom does not implement modal dialogs.
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

const NOW = Date.parse("2026-10-30T09:00:00+09:00");
const REFERENCE = new Date(NOW + 5 * 60_000).toISOString();
const student: CurrentUser = {
  id: "student-1",
  displayName: "김하늘",
  role: "STUDENT",
};
const mine: CommentItem = {
  id: "c1",
  authorName: "김하늘",
  content: "정문에서 기다릴게요.",
  createdAt: new Date(NOW - 120_000).toISOString(),
  isMine: true,
};
const other: CommentItem = {
  id: "c2",
  authorName: "박지민",
  content: "출발 장소를 확인했어요.",
  createdAt: new Date(NOW - 60_000).toISOString(),
  isMine: false,
};

function operations(overrides: Partial<CommentsOperations> = {}) {
  let content = [{ ...mine }, { ...other }];
  return {
    list: vi.fn(async () => ({ content })),
    create: vi.fn(async (_postId: string, body: string) => {
      content = [
        ...content,
        { ...mine, id: `new-comment-${content.length}`, content: body },
      ];
    }),
    remove: vi.fn(async (_postId: string, commentId: string) => {
      content = content.filter((item) => item.id !== commentId);
    }),
    ...overrides,
  } satisfies CommentsOperations;
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

const flush = async () => {
  await act(async () => {});
};

async function setup(
  api: CommentsOperations | undefined = operations(),
  patch: Partial<CommentsPanelProps> = {},
  initialUser: CurrentUser | null = student,
) {
  let user = initialUser;
  let controller!: AuthController;
  const auth: AuthOperations = {
    me: vi.fn(async () => user),
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
  };
  function Probe() {
    controller = useAuth();
    return <p data-testid="auth-state">{controller.status}</p>;
  }
  const props: CommentsPanelProps = {
    postId: "p1",
    status: "OPEN",
    referenceTime: REFERENCE,
    serverNow: () => NOW,
    operations: api,
    onUnavailable: vi.fn(),
    ...patch,
  };
  const tree = (current: CommentsPanelProps) => (
    <AuthProvider operations={auth}>
      <Probe />
      <CommentsPanel {...current} />
    </AuthProvider>
  );
  const view = render(tree(props));
  await flush();
  await flush();
  return {
    props,
    rerender: async (next: Partial<CommentsPanelProps>) => {
      view.rerender(tree({ ...props, ...next }));
      await flush();
    },
    changeUser: async (next: CurrentUser) => {
      user = next;
      await act(async () => controller.check());
      await flush();
    },
  };
}

const input = () => screen.getByLabelText("댓글 내용", { exact: true });
const type = (value: string) =>
  fireEvent.change(input(), { target: { value } });
const click = (name: string | RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
const submit = () => click("댓글 등록");
const mineRow = () => screen.getByText(mine.content).closest("li")!;
const openDelete = () =>
  act(async () => {
    fireEvent.click(within(mineRow()).getByRole("button", { name: /삭제/ }));
  });
const confirmDelete = () =>
  act(async () => {
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "댓글 삭제",
      }),
    );
  });

describe("댓글 조회", () => {
  it("AC-COORD-002-02: 불러오는 상태와 빈 목록을 구분한다", async () => {
    const pending = deferred<unknown>();
    await setup(operations({ list: vi.fn(() => pending.promise) }));
    expect(screen.getByText(/댓글.*불러오/)).toBeVisible();
    await act(async () => pending.resolve({ content: [] }));
    expect(screen.getByText(/댓글이 없|아직.*댓글/)).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("AC-COORD-002-04: 조회 실패를 빈 목록으로 표시하지 않고 재시도한다", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("private stack trace"))
      .mockResolvedValue({ content: [mine] });
    await setup(operations({ list }));
    expect(screen.getByRole("alert")).not.toHaveTextContent("private");
    expect(screen.queryByText(/아직 댓글이 없/)).toBeNull();
    await click(/다시 불러오기|새로고침/);
    expect(screen.getByText(mine.content)).toBeVisible();
  });

  it("댓글 본문은 HTML을 실행하지 않고 텍스트로 표시한다", async () => {
    const body = '<img src=x onerror="alert(1)">';
    await setup(
      operations({
        list: vi.fn(async () => ({ content: [{ ...mine, content: body }] })),
      }),
    );
    expect(screen.getByText(body)).toBeVisible();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText("김하늘 · 나")).toBeVisible();
    expect(document.body).not.toHaveTextContent("student-1");
  });

  it("API 미연동 화면은 빈 댓글이나 작성 성공으로 가장하지 않는다", async () => {
    await setup(undefined, { operations: undefined });
    expect(screen.getByRole("heading", { name: "댓글" })).toBeVisible();
    expect(screen.getByText(/댓글.*연동.*준비/)).toBeVisible();
    expect(screen.queryByLabelText("댓글 내용")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("비로그인 및 삭제된 모집에서는 댓글을 조회하거나 표시하지 않는다", async () => {
    const api = operations();
    const view = await setup(api, {}, null);
    expect(api.list).not.toHaveBeenCalled();
    expect(screen.queryByText(mine.content)).toBeNull();
    await view.changeUser(student);
    expect(screen.getByText(mine.content)).toBeVisible();
    await view.rerender({ status: "REMOVED" });
    expect(screen.queryByText(mine.content)).toBeNull();
    expect(api.list).toHaveBeenCalledTimes(1);
  });
});

describe("댓글 작성", () => {
  it.each(["OPEN", "FULL", "CLOSED"] as const)(
    "AC-COORD-001-01/02: %s에서는 T-5분에도 댓글을 등록하고 결과를 다시 조회한다",
    async (status) => {
      const api = operations();
      await setup(api, { status });
      type("조금 먼저 도착할게요.");
      await submit();
      expect(api.create).toHaveBeenCalledWith("p1", "조금 먼저 도착할게요.");
      expect(screen.getByText("조금 먼저 도착할게요.")).toBeVisible();
      expect(input()).toHaveValue("");
      expect(api.list).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["", " \n\t ", "😀".repeat(501)])(
    "AC-COORD-001-03/08: 빈 값·공백·501 코드포인트 입력은 요청하지 않는다 (%#)",
    async (body) => {
      const api = operations();
      await setup(api);
      type(body);
      await submit();
      expect(api.create).not.toHaveBeenCalled();
      expect(input()).toHaveAttribute("aria-invalid", "true");
      expect(input()).toHaveFocus();
    },
  );

  it("NFC·양끝 공백만 정리하고 내부 줄바꿈과 500개 이모지 입력을 보존한다", async () => {
    const api = operations();
    await setup(api);
    type("  e\u0301\n다음 줄  ");
    await submit();
    expect(api.create).toHaveBeenLastCalledWith("p1", "é\n다음 줄");
    type("😀".repeat(500));
    await submit();
    expect(api.create).toHaveBeenLastCalledWith("p1", "😀".repeat(500));
  });

  it("확인된 등록 거절은 입력을 보존하고 수동으로 재시도할 수 있다", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new CommentsError("invalid"))
      .mockResolvedValue(undefined);
    await setup(operations({ create }));
    type("남겨 둔 댓글 초안");
    await submit();
    expect(input()).toHaveValue("남겨 둔 댓글 초안");
    expect(screen.getByRole("alert")).toBeVisible();
    await submit();
    expect(create).toHaveBeenCalledTimes(2);
    expect(input()).toHaveValue("");
  });

  it("AC-COORD-001-06: 처리 중에는 같은 등록을 다시 보내지 않는다", async () => {
    const pending = deferred<void>();
    const create = vi.fn(() => pending.promise);
    await setup(operations({ create }));
    type("중복 요청 확인");
    const form = input().closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(input()).toHaveAttribute("readonly");
    await act(async () => pending.resolve());
  });

  it("화면 갱신 직전이라도 서버 기준 시각 T부터 등록 요청을 보내지 않는다", async () => {
    let now = NOW;
    const api = operations();
    await setup(api, { serverNow: () => now });
    type("마감 직전 초안");
    now = Date.parse(REFERENCE);
    await submit();
    expect(api.create).not.toHaveBeenCalled();
    expect(input()).toHaveValue("마감 직전 초안");
    expect(input()).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "댓글 등록" })).toBeDisabled();
  });

  it("서버가 모집 종료를 알리면 초안을 복사할 수 있게 유지하고 본인 삭제는 허용한다", async () => {
    const create = vi.fn(async () => {
      throw new CommentsError("closed");
    });
    const api = operations({ create });
    await setup(api);
    type("종료 직전 작성한 초안");
    await submit();
    expect(input()).toHaveValue("종료 직전 작성한 초안");
    expect(input()).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "댓글 등록" })).toBeDisabled();
    await act(async () => fireEvent.submit(input().closest("form")!));
    expect(create).toHaveBeenCalledTimes(1);
    await openDelete();
    await confirmDelete();
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(input()).toHaveValue("종료 직전 작성한 초안");
  });

  it("등록 확인 뒤 목록 조회가 실패해도 등록을 재전송하지 않는다", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ content: [mine] })
      .mockRejectedValueOnce(new Error("read failure"))
      .mockResolvedValue({ content: [mine] });
    const api = operations({ list });
    await setup(api);
    type("등록 확인된 댓글");
    await submit();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(input()).toHaveValue("");
    expect(screen.getByText(/등록.*됐|등록.*완료/)).toBeVisible();
    await click(/다시 불러오기|최신 댓글 확인/);
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("AC-COORD-001-09: 응답 유실은 초안을 유지하고 GET 확인 전 재등록을 막는다", async () => {
    const create = vi.fn(async () => {
      throw new Error("private response lost");
    });
    const api = operations({ create });
    await setup(api);
    type("결과가 불확실한 초안");
    await submit();
    expect(input()).toHaveValue("결과가 불확실한 초안");
    expect(screen.getByRole("button", { name: "댓글 등록" })).toBeDisabled();
    expect(screen.getByRole("alert")).not.toHaveTextContent("private");
    expect(create).toHaveBeenCalledTimes(1);
    await click("최신 댓글 확인");
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(input()).toHaveValue("결과가 불확실한 초안");
  });
});

describe("댓글 삭제와 접근 변경", () => {
  it("AC-COORD-003-02: 본인 댓글만 삭제할 수 있고 확인·성공 뒤에만 제거한다", async () => {
    const api = operations();
    await setup(api);
    expect(
      within(screen.getByText(other.content).closest("li")!).queryByRole(
        "button",
        { name: /삭제/ },
      ),
    ).toBeNull();
    await openDelete();
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByText(mine.content)).toBeVisible();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "돌아가기",
      }),
    ).toHaveFocus();
    await confirmDelete();
    expect(api.remove).toHaveBeenCalledWith("p1", "c1");
    expect(screen.queryByText(mine.content)).toBeNull();
    expect(screen.getByText(other.content)).toBeVisible();
  });

  it("AC-COORD-003-04: 삭제가 거절되면 댓글을 남겨 두고 재시도한다", async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new CommentsError("forbidden"))
      .mockResolvedValue(undefined);
    await setup(operations({ remove }));
    await openDelete();
    await confirmDelete();
    expect(screen.getByText(mine.content)).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
    if (!screen.queryByRole("dialog")) await openDelete();
    await confirmDelete();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(mine.content)).toBeNull();
  });

  it("삭제 응답 유실은 목록 확인 전 완료로 표시하거나 DELETE를 재전송하지 않는다", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ content: [mine, other] })
      .mockResolvedValue({ content: [other] });
    const remove = vi.fn(async () => {
      throw new Error("private deletion response lost");
    });
    await setup(operations({ list, remove }));
    await openDelete();
    await confirmDelete();
    expect(screen.getByText(mine.content)).toBeVisible();
    expect(screen.queryByText("댓글이 삭제됐어요.")).toBeNull();
    await click("최신 댓글 확인");
    expect(screen.queryByText(mine.content)).toBeNull();
    expect(screen.getByText(other.content)).toBeVisible();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it.each(["FINISHED", "CANCELLED"] as const)(
    "%s에는 기존 댓글 조회와 본인 삭제를 제공하고 새 등록은 막는다",
    async (status) => {
      const api = operations();
      await setup(api, { status });
      expect(screen.getByText(other.content)).toBeVisible();
      const register = screen.queryByRole("button", { name: "댓글 등록" });
      if (register) expect(register).toBeDisabled();
      await openDelete();
      await confirmDelete();
      expect(api.remove).toHaveBeenCalledTimes(1);
      expect(api.create).not.toHaveBeenCalled();
    },
  );

  it("현재 요청의 401은 댓글을 지우고 로그인이 만료됐음을 안내한다", async () => {
    const api = operations({
      list: vi.fn(async () => {
        throw new ApiError(401, "private auth details");
      }),
    });
    await setup(api);
    expect(screen.getByTestId("auth-state")).toHaveTextContent("expired");
    expect(screen.queryByText(mine.content)).toBeNull();
    expect(
      screen.getByRole("heading", { name: "로그인이 만료됐어요" }),
    ).toBeVisible();
  });

  it("재조회 403은 이전 댓글 내용을 지우고 접근 제한을 안내한다", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ content: [mine] })
      .mockRejectedValue(new ApiError(403, "private forbidden details"));
    const create = vi.fn(async () => {
      throw new CommentsError("unknownOutcome");
    });
    await setup(operations({ list, create }));
    type("결과 확인 필요");
    await submit();
    await click("최신 댓글 확인");
    expect(screen.queryByText(mine.content)).toBeNull();
    expect(document.body).toHaveTextContent(/권한|허용/);
    expect(document.body).not.toHaveTextContent("private");
  });

  it("다른 모집으로 바뀐 뒤 도착한 이전 목록은 새 모집에 표시하지 않는다", async () => {
    const old = deferred<unknown>();
    const list = vi.fn((id: string) =>
      id === "p1"
        ? old.promise
        : Promise.resolve({ content: [{ ...other, content: "새 모집 댓글" }] }),
    );
    const view = await setup(operations({ list }));
    await view.rerender({ postId: "p2" });
    await act(async () => old.resolve({ content: [mine] }));
    expect(screen.getByText("새 모집 댓글")).toBeVisible();
    expect(screen.queryByText(mine.content)).toBeNull();
  });

  it("operation 교체 뒤 이전 401은 새 화면의 사용자를 로그아웃시키지 않는다", async () => {
    const old = deferred<unknown>();
    const view = await setup(operations({ list: vi.fn(() => old.promise) }));
    await view.rerender({ operations: operations() });
    await act(async () => old.reject(new ApiError(401, "")));
    expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated");
    expect(screen.getByText(mine.content)).toBeVisible();
  });

  it("사용자 전환 뒤 이전 401은 새 사용자의 댓글 화면을 지우지 않는다", async () => {
    const old = deferred<unknown>();
    const list = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue({
        content: [{ ...other, content: "새 사용자 댓글" }],
      });
    const view = await setup(operations({ list }));
    await view.changeUser({
      ...student,
      id: "student-2",
      displayName: "다른 학생",
    });
    await act(async () => old.reject(new ApiError(401, "")));
    expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated");
    expect(screen.getByText("새 사용자 댓글")).toBeVisible();
  });
});
