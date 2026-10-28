import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { PostDetailError, type PostDetailOperations } from "./postDetail";
import { PostDetailScreen } from "./PostDetailScreen";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/posts/p1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-noto-sans-kr" }),
}));

beforeEach(() => {
  // jsdom has no modal dialog behavior.
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

const auth = {
  me: vi.fn(async () => ({ id: "1", displayName: "김하늘", role: "STUDENT" })),
  login: vi.fn(),
  logout: vi.fn(),
};

function post(patch: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: "p1",
    type: "TAXI",
    title: "정문에서 석계역까지 같이 가요",
    description: "정문 앞에서 만나요.\n늦지 마세요.",
    status: "OPEN",
    referenceTime: new Date(now + 2 * 3_600_000).toISOString(),
    serverTime: new Date(now).toISOString(),
    capacity: 4,
    currentMemberCount: 3,
    joinable: true,
    relation: "NONE",
    authorName: "박지민",
    participantNames: ["박지민", "이서연", "김하늘"],
    communicationUrl: "https://open.kakao.com/o/abc",
    reported: false,
    departure: "삼육대학교 정문",
    destination: "석계역 1번 출구",
    email: "secret@syuin.ac.kr",
    phone: "010-1234-5678",
    ...patch,
  };
}

function ops(patch: Partial<PostDetailOperations> = {}): PostDetailOperations {
  return {
    load: vi.fn(async () => post()),
    close: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    join: vi.fn(async () => {}),
    leave: vi.fn(async () => {}),
    report: vi.fn(async () => {}),
    ...patch,
  };
}

async function setup(operations: PostDetailOperations) {
  render(
    <AuthProvider operations={auth}>
      <PostDetailScreen postId="p1" operations={operations} />
    </AuthProvider>,
  );
  await act(async () => {});
  await act(async () => {});
}

const members = () =>
  screen.getByRole("heading", { name: /함께하는 학생/ }).closest("section")!;

describe("상세 조회", () => {
  it("AC-DISC-004-01: 택시 정보·설명·작성자 포함 인원을 보여 주고 비참여자에게 명단·링크·개인정보를 숨긴다", async () => {
    await setup(ops());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "삼육대학교 정문",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "석계역 1번 출구",
    );
    expect(screen.getByText("정원").nextSibling).toHaveTextContent(
      "3 / 4명 · 작성자 포함",
    );
    expect(screen.getByText(/정문 앞에서 만나요/)).toBeVisible();
    expect(screen.getByText("모집 중")).toBeVisible();
    expect(within(members()).queryByText("이서연")).not.toBeInTheDocument();
    expect(
      within(members()).getByText(/작성자와 참여한 학생에게만/),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /소통 링크/ }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("secret@syuin.ac.kr");
    expect(document.body).not.toHaveTextContent("010-1234-5678");
    expect(screen.getByRole("button", { name: "참여하기" })).toBeVisible();
  });

  it("배달은 음식점·수령 장소·주문 마감·주문 안내를 구분한다", async () => {
    await setup(
      ops({
        load: vi.fn(async () =>
          post({
            type: "DELIVERY",
            departure: undefined,
            destination: undefined,
            restaurantName: "정문 김밥",
            pickupLocation: "학생회관 앞",
            orderGuide: "메뉴는 각자 골라요",
          }),
        ),
      }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "정문 김밥",
    );
    for (const term of ["음식점", "수령 장소", "주문 마감", "주문 안내"]) {
      expect(screen.getByText(term)).toBeVisible();
    }
    expect(screen.getByText("메뉴는 각자 골라요")).toBeVisible();
    expect(screen.queryByText("출발지")).not.toBeInTheDocument();
  });

  it("AC-DISC-004-02, AC-COORD-004-01: 참여 중이면 명단과 새 창 링크를 제공한다", async () => {
    await setup(ops({ load: vi.fn(async () => post({ relation: "JOINED" })) }));
    const list = within(members());
    expect(list.getByText("박지민")).toBeVisible();
    expect(list.getAllByText("작성자")).toHaveLength(1);
    expect(list.getByText("이서연")).toBeVisible();
    expect(list.getByText("빈자리")).toBeVisible();
    const link = screen.getByRole("link", { name: /소통 링크 열기/ });
    expect(link).toHaveAttribute("href", "https://open.kakao.com/o/abc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("AC-DISC-004-03: 참여를 취소한 학생에게는 인원만 보여 준다", async () => {
    await setup(
      ops({
        load: vi.fn(async () =>
          post({ relation: "CANCELLED", currentMemberCount: 2 }),
        ),
      }),
    );
    expect(within(members()).queryByText("이서연")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /소통 링크/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 참여하기" })).toBeVisible();
  });

  it("AC-DISC-004-04, AC-POST-008-01: 완료된 모집은 최종 명단만 보여 주고 링크·참여를 제공하지 않는다", async () => {
    const past = Date.now() - 3_600_000;
    await setup(
      ops({
        load: vi.fn(async () =>
          post({
            relation: "JOINED",
            status: "FINISHED",
            referenceTime: new Date(past).toISOString(),
          }),
        ),
      }),
    );
    expect(
      screen.getByText("기록으로만 볼 수 있어요.", { exact: false }),
    ).toBeVisible();
    expect(within(members()).getByText("이서연")).toBeVisible();
    expect(within(members()).queryByText("빈자리")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /소통 링크/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /참여/ }),
    ).not.toBeInTheDocument();
  });

  it("작성자가 취소한 모집은 이력으로 표시한다", async () => {
    await setup(
      ops({
        load: vi.fn(async () =>
          post({ relation: "JOINED", status: "CANCELLED" }),
        ),
      }),
    );
    expect(screen.getByText(/작성자가 취소한 모집이에요/)).toBeVisible();
    expect(within(members()).queryByText("이서연")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /소통 링크/ }),
    ).not.toBeInTheDocument();
  });

  it("AC-DISC-004-05: 삭제된 모집은 내용·참가자·링크를 보여 주지 않는다", async () => {
    await setup(
      ops({
        load: vi.fn(async () =>
          post({ status: "REMOVED", relation: "JOINED" }),
        ),
      }),
    );
    expect(
      screen.getByRole("heading", { name: "삭제된 모집이에요" }),
    ).toBeVisible();
    for (const text of [
      "정문에서 석계역까지",
      "삼육대학교 정문",
      "이서연",
      "박지민",
    ]) {
      expect(document.body).not.toHaveTextContent(text);
    }
    expect(
      screen.queryByRole("link", { name: /소통 링크/ }),
    ).not.toBeInTheDocument();
  });

  it("AC-DISC-004-06, AC-UI-NAV-05: 없는 모집은 안내와 목록 복귀를 제공한다", async () => {
    await setup(
      ops({ load: vi.fn(async () => Promise.reject(new ApiError(404, ""))) }),
    );
    expect(
      screen.getByRole("heading", { name: "모집을 찾을 수 없어요" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "모집글 목록으로" }),
    ).toHaveAttribute("href", "/posts");
  });

  it("403은 접근 권한 안내를 보여 준다", async () => {
    await setup(
      ops({ load: vi.fn(async () => Promise.reject(new ApiError(403, ""))) }),
    );
    expect(
      screen.getByRole("heading", { name: "접근 권한이 없어요" }),
    ).toBeVisible();
  });

  it("401은 로그인 만료 안내로 바꾼다", async () => {
    await setup(
      ops({ load: vi.fn(async () => Promise.reject(new ApiError(401, ""))) }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("로그인이 만료됐어요");
  });

  it.each([
    ["focus", new ApiError(401, "private")],
    ["focus", new ApiError(403, "private")],
    ["focus", new PostDetailError("forbidden")],
    ["focus", new ApiError(404, "private")],
    ["focus", new PostDetailError("notFound")],
    ["manual", new ApiError(401, "private")],
    ["manual", new ApiError(403, "private")],
    ["manual", new PostDetailError("forbidden")],
    ["manual", new ApiError(404, "private")],
    ["manual", new PostDetailError("notFound")],
  ] as const)(
    "%s 재조회 권한·삭제 오류 %s는 기존 명단과 소통 링크를 제거한다",
    async (trigger, error) => {
      const load = vi
        .fn<PostDetailOperations["load"]>()
        .mockResolvedValueOnce(post({ relation: "JOINED" }))
        .mockRejectedValue(error);
      if (trigger === "manual")
        load.mockRejectedValueOnce(new ApiError(500, "offline"));
      await setup(ops({ load }));
      expect(screen.getByText("이서연")).toBeVisible();
      expect(
        screen.getByRole("link", { name: /소통 링크 열기/ }),
      ).toBeVisible();
      await act(async () => window.dispatchEvent(new Event("focus")));
      if (trigger === "manual") {
        await act(async () => {
          fireEvent.click(
            screen.getByRole("button", { name: "최신 상태 다시 조회" }),
          );
        });
      }
      expect(document.body).not.toHaveTextContent("이서연");
      expect(
        screen.queryByRole("link", { name: /소통 링크/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", {
          name:
            error instanceof ApiError && error.status === 401
              ? "로그인이 만료됐어요"
              : (error instanceof ApiError && error.status === 404) ||
                  (error instanceof PostDetailError &&
                    error.kind === "notFound")
                ? "모집을 찾을 수 없어요"
                : "접근 권한이 없어요",
        }),
      ).toBeVisible();
      expect(document.body).not.toHaveTextContent("private");
    },
  );

  it("이전 사용자 상세의 늦은 401은 새 사용자를 로그아웃하지 않는다", async () => {
    let fail!: (error: unknown) => void;
    let user = { id: "1", displayName: "이전 사용자", role: "STUDENT" };
    const load = vi
      .fn<PostDetailOperations["load"]>()
      .mockResolvedValueOnce(post({ relation: "JOINED" }))
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
      )
      .mockResolvedValue(post({ relation: "JOINED" }));
    render(
      <AuthProvider operations={{ ...auth, me: async () => user }}>
        <PostDetailScreen postId="p1" operations={ops({ load })} />
      </AuthProvider>,
    );
    await act(async () => {});
    user = { id: "2", displayName: "새 사용자", role: "STUDENT" };
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.getByRole("button", { name: "새 사용자님" })).toBeVisible();
    await act(async () => fail(new ApiError(401, "old session")));
    expect(screen.getByRole("button", { name: "새 사용자님" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "로그인이 만료됐어요" }),
    ).not.toBeInTheDocument();
  });
  it("AC-UI-ERROR-01: 조회 실패는 다시 불러오기를 제공한다", async () => {
    const load = vi
      .fn<PostDetailOperations["load"]>()
      .mockRejectedValueOnce(new ApiError(500, "stack"))
      .mockResolvedValue(post());
    await setup(ops({ load }));
    expect(screen.getByRole("alert")).toHaveTextContent("불러오지 못했어요");
    expect(document.body).not.toHaveTextContent("stack");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    });
    await act(async () => {});
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "삼육대학교 정문",
    );
  });

  it("잘못된 상세 응답은 화면에 쓰지 않는다", async () => {
    await setup(ops({ load: vi.fn(async () => post({ capacity: 9 })) }));
    expect(screen.getByRole("alert")).toHaveTextContent("불러오지 못했어요");
  });
});

describe("작성자 관리", () => {
  const author = (patch: Record<string, unknown> = {}) =>
    ops({ load: vi.fn(async () => post({ relation: "AUTHOR", ...patch })) });

  it("AC-POST-007-01, AUTH-004: 수정·마감·취소만 제공하고 참여·신고·삭제는 없다", async () => {
    await setup(author());
    expect(
      screen.getByRole("heading", { name: "내 모집글 관리" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "모집글 수정" })).toHaveAttribute(
      "href",
      "/posts/p1/edit",
    );
    expect(screen.getByRole("button", { name: "모집 마감하기" })).toBeVisible();
    expect(screen.getByRole("button", { name: "모집 취소하기" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "참여하기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "이 모집글 신고하기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /삭제/ }),
    ).not.toBeInTheDocument();
  });

  it("AC-POST-005-09, AC-POST-005-07: 마감 확인창을 열고 돌아가면 요청하지 않고 포커스를 돌린다", async () => {
    const operations = author();
    await setup(operations);
    const trigger = screen.getByRole("button", { name: "모집 마감하기" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "모집을 마감할까요?" });
    expect(
      within(dialog).getByRole("button", { name: "돌아가기" }),
    ).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    expect(operations.close).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("AC-POST-005-01, AC-POST-005-02: 마감을 확정하면 요청하고 최신 상태와 완료 안내를 보여 준다", async () => {
    const load = vi
      .fn<PostDetailOperations["load"]>()
      .mockResolvedValueOnce(
        post({ relation: "AUTHOR", status: "FULL", currentMemberCount: 4 }),
      )
      .mockResolvedValue(
        post({ relation: "AUTHOR", status: "CLOSED", currentMemberCount: 3 }),
      );
    const operations = ops({ load });
    await setup(operations);
    fireEvent.click(screen.getByRole("button", { name: "모집 마감하기" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "모집 마감" }));
    });
    await act(async () => {});
    expect(operations.close).toHaveBeenCalledWith("p1");
    expect(screen.getByRole("status")).toHaveTextContent("모집을 마감했어요");
    // Closed stays closed even after a member leaves.
    expect(
      document.querySelector("article header [data-history]"),
    ).toHaveTextContent("모집 마감");
    expect(
      screen.queryByRole("button", { name: "모집 마감하기" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모집 취소하기" })).toBeVisible();
  });

  it("AC-POST-005-08: 마감 요청 중에는 다시 누를 수 없고 실패를 성공으로 표시하지 않는다", async () => {
    let fail!: (error: unknown) => void;
    const close = vi.fn(
      () => new Promise<void>((_, reject) => (fail = reject)),
    );
    await setup({ ...author(), close });
    fireEvent.click(screen.getByRole("button", { name: "모집 마감하기" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "모집 마감" }));
    });
    expect(screen.getByRole("button", { name: "마감하는 중…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "모집 취소하기" }),
    ).toBeDisabled();
    await act(async () => fail(new TypeError("Failed to fetch")));
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "마감 결과를 확인하지 못했어요",
    );
    expect(screen.queryByText(/모집을 마감했어요/)).not.toBeInTheDocument();
  });

  it("상태가 바뀌어 거절되면 최신 정보로 다시 불러와 안내한다", async () => {
    const load = vi
      .fn<PostDetailOperations["load"]>()
      .mockResolvedValueOnce(post({ relation: "AUTHOR" }))
      .mockResolvedValue(post({ relation: "AUTHOR", status: "CANCELLED" }));
    await setup(
      ops({
        load,
        close: vi.fn(async () =>
          Promise.reject(new PostDetailError("conflict")),
        ),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "모집 마감하기" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "모집 마감" }));
    });
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toHaveTextContent("모집 상태가 바뀌어");
  });

  it("AC-POST-006-08, AC-POST-006-01: 모집 취소는 확인 후 요청하고 취소 결과를 반영한다", async () => {
    const load = vi
      .fn<PostDetailOperations["load"]>()
      .mockResolvedValueOnce(post({ relation: "AUTHOR", status: "CLOSED" }))
      .mockResolvedValue(post({ relation: "AUTHOR", status: "CANCELLED" }));
    const operations = ops({ load });
    await setup(operations);
    expect(
      screen.queryByRole("button", { name: "모집 마감하기" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "모집 취소하기" }));
    const dialog = screen.getByRole("dialog", { name: "모집을 취소할까요?" });
    expect(dialog).toHaveTextContent("참여한 학생의 참여도 함께 취소");
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "모집 취소" }),
      );
    });
    await act(async () => {});
    expect(operations.cancel).toHaveBeenCalledWith("p1");
    expect(screen.getByRole("status")).toHaveTextContent("모집을 취소했어요");
    expect(screen.getByText(/작성자가 취소한 모집이에요/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "모집 취소하기" }),
    ).not.toBeInTheDocument();
  });

  it("AC-POST-006-04: 기준시각이 지나면 마감·취소를 제공하지 않는다", async () => {
    await setup(
      author({ referenceTime: new Date(Date.now() - 60_000).toISOString() }),
    );
    expect(
      screen.queryByRole("button", { name: "모집 마감하기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "모집 취소하기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "모집글 수정" }),
    ).not.toBeInTheDocument();
  });
});

describe("신고", () => {
  async function openReport(operations = ops()) {
    await setup(operations);
    fireEvent.click(screen.getByRole("button", { name: "이 모집글 신고하기" }));
    return screen.getByRole("dialog", { name: "모집글 신고" });
  }

  it("AC-REPORT-001-05: 다섯 가지 사유와 선택 상세 내용을 제공한다", async () => {
    const dialog = await openReport();
    for (const label of [
      "부적절한 내용",
      "광고·홍보",
      "욕설·비방",
      "허위 모집",
      "기타",
    ]) {
      expect(within(dialog).getByLabelText(label)).toBeVisible();
    }
    expect(within(dialog).getByLabelText("상세 내용 (선택)")).toBeVisible();
    expect(within(dialog).getByLabelText("부적절한 내용")).toHaveFocus();
  });

  it("AC-REPORT-001-06: 사유 없이 또는 501자로 제출하면 요청하지 않는다", async () => {
    const operations = ops();
    const dialog = await openReport(operations);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "신고하기" }));
    });
    expect(
      within(dialog).getByText("신고 사유를 선택해 주세요."),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByLabelText("기타"));
    fireEvent.change(within(dialog).getByLabelText("상세 내용 (선택)"), {
      target: { value: "a".repeat(501) },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "신고하기" }));
    });
    expect(operations.report).not.toHaveBeenCalled();
    expect(
      within(dialog).getByLabelText("상세 내용 (선택)"),
    ).toHaveAccessibleDescription(/500자 이하/);
  });

  it("AC-REPORT-001-02, AC-REPORT-001-07: 기타는 상세 없이 접수되고 모집은 그대로 보인다", async () => {
    const operations = ops();
    const dialog = await openReport(operations);
    fireEvent.click(within(dialog).getByLabelText("기타"));
    fireEvent.change(within(dialog).getByLabelText("상세 내용 (선택)"), {
      target: { value: "   " },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "신고하기" }));
    });
    expect(operations.report).toHaveBeenCalledWith("p1", {
      reason: "OTHER",
      detail: null,
    });
    expect(screen.getByRole("status")).toHaveTextContent("신고가 접수됐어요");
    expect(
      screen.queryByRole("button", { name: "이 모집글 신고하기" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "삼육대학교 정문",
    );
  });

  it("AC-REPORT-001-08: 요청 중 반복 제출은 한 번만 보낸다", async () => {
    let finish!: () => void;
    const report = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const dialog = await openReport(ops({ report }));
    fireEvent.click(within(dialog).getByLabelText("허위 모집"));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "신고하기" }));
    });
    const button = within(dialog).getByRole("button", { name: "보내는 중…" });
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(report).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("AC-REPORT-001-09: 실패하면 입력을 유지하고 다시 제출할 수 있다", async () => {
    const report = vi
      .fn<PostDetailOperations["report"]>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(undefined);
    const dialog = await openReport(ops({ report }));
    fireEvent.click(within(dialog).getByLabelText("광고·홍보"));
    fireEvent.change(within(dialog).getByLabelText("상세 내용 (선택)"), {
      target: { value: "홍보 링크가 있어요" },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "신고하기" }));
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "다시 시도해 주세요",
    );
    expect(within(dialog).getByLabelText("광고·홍보")).toBeChecked();
    expect(within(dialog).getByLabelText("상세 내용 (선택)")).toHaveValue(
      "홍보 링크가 있어요",
    );
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "신고하기" }));
    });
    expect(report).toHaveBeenLastCalledWith("p1", {
      reason: "AD_PROMOTION",
      detail: "홍보 링크가 있어요",
    });
    expect(screen.getByRole("status")).toHaveTextContent("신고가 접수됐어요");
  });

  it("AC-REPORT-002-04: 중복 신고 응답은 이미 신고했다고 안내한다", async () => {
    const dialog = await openReport(
      ops({
        report: vi.fn(async () =>
          Promise.reject(new PostDetailError("duplicateReport")),
        ),
      }),
    );
    fireEvent.click(within(dialog).getByLabelText("욕설·비방"));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "신고하기" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "이미 신고한 모집이에요",
    );
    expect(
      screen.queryByText("신고가 접수됐어요", { exact: false }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["ownPost", "본인이 작성한 모집은"],
    ["notFound", "삭제되었거나 없는 모집"],
    ["invalid", "신고 사유와 상세 내용을 확인"],
  ] as const)(
    "AC-REPORT-001-03~04: %s 거절을 구분해 안내한다",
    async (kind, message) => {
      const dialog = await openReport(
        ops({
          report: vi.fn(async () => Promise.reject(new PostDetailError(kind))),
        }),
      );
      fireEvent.click(within(dialog).getByLabelText("부적절한 내용"));
      await act(async () => {
        fireEvent.click(
          within(dialog).getByRole("button", { name: "신고하기" }),
        );
      });
      expect(within(dialog).getByRole("alert")).toHaveTextContent(message);
    },
  );

  it("AC-REPORT-002-01: 이미 신고한 모집은 신고 진입을 제공하지 않는다", async () => {
    await setup(ops({ load: vi.fn(async () => post({ reported: true })) }));
    expect(
      screen.queryByRole("button", { name: "이 모집글 신고하기" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("이미 신고한 모집이에요.")).toBeVisible();
  });
});
