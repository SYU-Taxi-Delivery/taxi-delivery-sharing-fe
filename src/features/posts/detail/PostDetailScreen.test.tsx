import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "@/features/auth/AuthProvider";
import {
  CommentsError,
  type CommentsOperations,
} from "@/features/comments/comments";
import { rememberListOrigin } from "../listOrigin";
import { postQueryHref } from "../posts";
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

afterEach(() => vi.useRealTimers());

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

async function setup(
  operations: PostDetailOperations,
  commentOperations?: CommentsOperations,
) {
  render(
    <AuthProvider operations={auth}>
      <PostDetailScreen
        postId="p1"
        operations={operations}
        commentOperations={commentOperations}
      />
    </AuthProvider>,
  );
  await act(async () => {});
  await act(async () => {});
}

const members = () =>
  screen.getByRole("heading", { name: /함께하는 학생/ }).closest("section")!;

describe("상세 댓글 영역", () => {
  const comments = (
    patch: Partial<CommentsOperations> = {},
  ): CommentsOperations => ({
    list: vi.fn(async () => ({
      content: [
        {
          id: "c1",
          authorName: "학생",
          content: "댓글 내용 표시 확인",
          createdAt: new Date().toISOString(),
          isMine: false,
        },
      ],
    })),
    create: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    ...patch,
  });

  it("기본 화면은 가짜 댓글 대신 연동 준비를 안내한다", async () => {
    await setup(ops());
    expect(await screen.findByText(/댓글 연동을 준비/)).toBeVisible();
    expect(screen.queryByLabelText("댓글 내용")).toBeNull();
  });

  it("비참여자도 같은 모집의 공개 댓글을 조회하고 작성할 수 있다", async () => {
    const operations = comments();
    await setup(ops(), operations);
    expect(await screen.findByText("댓글 내용 표시 확인")).toBeVisible();
    expect(operations.list).toHaveBeenCalledWith("p1");
    expect(screen.getByLabelText("댓글 내용")).toBeVisible();
    expect(screen.getByRole("button", { name: "참여하기" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "내 댓글 삭제" })).toBeNull();
  });

  it("삭제된 모집에서는 댓글을 조회하지 않는다", async () => {
    const operations = comments();
    await setup(
      ops({ load: vi.fn(async () => post({ status: "REMOVED" })) }),
      operations,
    );
    expect(operations.list).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "모집 문의" })).toBeNull();
    expect(screen.queryByText("댓글 내용 표시 확인")).toBeNull();
  });

  it("댓글 조회 중 모집이 사라지면 상세도 재확인하고 이전 콘텐츠를 지운다", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(post())
      .mockRejectedValue(new ApiError(404, ""));
    await setup(
      ops({ load }),
      comments({
        list: vi.fn(async () => {
          throw new CommentsError("notFound");
        }),
      }),
    );
    expect(await screen.findByText("모집을 찾을 수 없어요")).toBeVisible();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText("댓글 내용")).toBeNull();
  });
});

describe("상세 조회", () => {
  it("AC-DISC-004-01: 택시 정보·설명·작성자 포함 인원을 보여 주고 비참여자에게 명단·링크·개인정보를 숨긴다", async () => {
    await setup(ops());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "삼육대학교 정문",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "석계역 1번 출구",
    );
    expect(
      screen.getByRole("region", { name: "1자리 남았어요" }),
    ).toHaveTextContent("현재 3 / 4명 · 작성자 포함");
    // The summary names both times: the schedule and the join/cancel cutoff.
    const facts = screen
      .getByRole("article")
      .querySelector("header dl")! as HTMLElement;
    expect(within(facts).getByText("출발")).toBeVisible();
    expect(within(facts).getByText("신청·취소 마감")).toBeVisible();
    expect(within(facts).getByText("1시간 50분 남음")).toBeVisible();
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
    expect(screen.getByText("수령 장소 · 학생회관 앞")).toBeVisible();
    for (const term of ["주문 마감", "참여·취소 마감", "주문 안내"]) {
      expect(screen.getByText(term)).toBeVisible();
    }
    expect(screen.getByText("메뉴는 각자 골라요")).toBeVisible();
    expect(screen.queryByText("출발지")).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "참여 마감에 도달하면 재조회 없이 상세 상단도 마감 표시로 바뀐다 (서버 기한: %s)",
    async (serverDeadline) => {
      vi.useFakeTimers();
      const now = Date.now();
      const operations = ops({
        load: vi.fn(async () =>
          post({
            referenceTime: new Date(
              now + (serverDeadline ? 3_600_000 : 601_000),
            ).toISOString(),
            serverTime: new Date(now).toISOString(),
            ...(serverDeadline
              ? { participationDeadline: new Date(now + 1_000).toISOString() }
              : {}),
          }),
        ),
      });
      await setup(operations);
      const article = screen.getByRole("article");
      const status = article.querySelector("header [data-history]");

      await act(async () => vi.advanceTimersByTime(999));
      expect(article).toHaveAttribute("data-closed", "false");
      expect(status).toHaveTextContent("모집 중");
      expect(screen.getByRole("button", { name: "참여하기" })).toBeEnabled();

      await act(async () => vi.advanceTimersByTime(1));
      expect(article).toHaveAttribute("data-closed", "true");
      expect(status).toHaveTextContent("신청 마감");
      expect(screen.getByRole("button", { name: "참여하기" })).toBeDisabled();
      expect(operations.load).toHaveBeenCalledTimes(1);
    },
  );

  it("AC-DISC-004-02, AC-COORD-004-01: 참여 중이면 명단과 새 창 링크를 제공한다", async () => {
    await setup(ops({ load: vi.fn(async () => post({ relation: "JOINED" })) }));
    const list = within(members());
    expect(list.getByText("박지민")).toBeVisible();
    expect(list.getAllByText("작성자")).toHaveLength(1);
    expect(list.getByText("이서연")).toBeVisible();
    expect(list.getByText("빈자리")).toBeVisible();
    const link = screen.getByRole("link", { name: /오픈채팅 열기/ });
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

  it("목록에서 연 상세의 모집글 목록은 연 목록 주소(유형·조건·쪽)로 돌아간다", async () => {
    const listHref = "/posts?type=TAXI&destination=%EC%84%9D%EA%B3%84&page=2";
    rememberListOrigin("p1", listHref);
    await setup(ops());
    expect(screen.getByRole("link", { name: /모집글 목록/ })).toHaveAttribute(
      "href",
      listHref,
    );
    sessionStorage.clear();
  });

  it("공유 링크처럼 바로 연 상세나 다른 글을 열던 기록이면 기본 목록으로 간다", async () => {
    await setup(ops());
    expect(screen.getByRole("link", { name: /모집글 목록/ })).toHaveAttribute(
      "href",
      "/posts",
    );
    cleanup();
    rememberListOrigin("other", "/posts?type=DELIVERY");
    await setup(ops());
    expect(screen.getByRole("link", { name: /모집글 목록/ })).toHaveAttribute(
      "href",
      "/posts",
    );
    cleanup();
    rememberListOrigin("p1", "//evil.example/posts");
    await setup(ops());
    expect(screen.getByRole("link", { name: /모집글 목록/ })).toHaveAttribute(
      "href",
      "/posts",
    );
    sessionStorage.clear();
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
      expect(screen.getByRole("link", { name: /오픈채팅 열기/ })).toBeVisible();
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

  it("다른 모집으로 이동하면 이전 상세와 명단·링크를 지우고 새 상세를 표시한다", async () => {
    let resolveNext!: (value: unknown) => void;
    const operations = ops({
      load: vi
        .fn<PostDetailOperations["load"]>()
        .mockResolvedValueOnce(post({ relation: "JOINED" }))
        .mockImplementationOnce(
          () => new Promise((resolve) => (resolveNext = resolve)),
        )
        .mockResolvedValue(
          post({ id: "p2", departure: "새 출발지", relation: "JOINED" }),
        ),
    });
    const view = (postId: string) => (
      <AuthProvider operations={auth}>
        <PostDetailScreen postId={postId} operations={operations} />
      </AuthProvider>
    );
    const { rerender } = render(view("p1"));
    await act(async () => {});
    expect(screen.getByRole("link", { name: /오픈채팅 열기/ })).toBeVisible();

    rerender(view("p2"));
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("불러오고 있어요");
    await act(async () =>
      resolveNext(post({ id: "p2", departure: "새 출발지" })),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "새 출발지",
    );
    expect(screen.queryByRole("link", { name: /오픈채팅 열기/ })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
    });
    expect(operations.join).toHaveBeenCalledWith("p2");
  });
});

describe("상세 요약·참여자 안내·더보기", () => {
  const load = (patch: Record<string, unknown>) =>
    ops({ load: vi.fn(async () => post(patch)) });

  it("참여 중이면 상태 옆에 참여 중을 표시하고 만나는 곳을 요약 바로 아래에 둔다", async () => {
    await setup(load({ relation: "JOINED" }));
    const header = screen.getByRole("article").querySelector("header")!;
    expect(within(header).getByText("모집 중")).toBeVisible();
    expect(within(header).getByText("참여 중")).toBeVisible();
    const info = screen.getByRole("region", { name: "참여자 안내" });
    expect(info).toHaveTextContent("만나는 곳삼육대학교 정문");
    // Right after the summary, before the participation panel.
    expect(header.nextElementSibling).toBe(info);
  });

  it("정원 마감에 참여 중이면 모집 상태와 참여 중을 함께 보여 준다", async () => {
    await setup(
      load({
        relation: "JOINED",
        status: "FULL",
        currentMemberCount: 4,
        joinable: false,
      }),
    );
    const header = screen.getByRole("article").querySelector("header")!;
    expect(within(header).getByText("정원 마감")).toBeVisible();
    expect(within(header).getByText("참여 중")).toBeVisible();
  });

  it("비참여자에게는 참여자 안내를 보여 주지 않는다", async () => {
    await setup(ops());
    expect(
      screen.queryByRole("region", { name: "참여자 안내" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("참여 중")).not.toBeInTheDocument();
  });

  it("정원 마감이면 같은 유형의 참여 가능한 모집 목록으로 안내한다", async () => {
    await setup(
      load({ status: "FULL", currentMemberCount: 4, joinable: false }),
    );
    expect(
      screen.getByRole("article").querySelector("header [data-history]"),
    ).toHaveTextContent("정원 마감");
    expect(
      screen.getByRole("link", { name: "비슷한 택시 모집 보기" }),
    ).toHaveAttribute(
      "href",
      postQueryHref("/posts", { type: "TAXI", joinableOnly: true, page: 0 }),
    );
  });

  it("모집 중이거나 이미 참여 중이면 비슷한 모집 링크를 두지 않는다", async () => {
    await setup(load({ relation: "JOINED", status: "FULL", joinable: false }));
    expect(
      screen.queryByRole("link", { name: /비슷한 .* 모집 보기/ }),
    ).not.toBeInTheDocument();
  });

  it("모집 취소·일정 종료를 구분해 표시한다", async () => {
    await setup(load({ status: "CANCELLED" }));
    expect(
      screen.getByRole("article").querySelector("header [data-history]"),
    ).toHaveTextContent("모집 취소");
  });

  it("더보기 메뉴는 Escape로 닫히고 버튼으로 포커스를 돌린다", async () => {
    await setup(ops());
    const more = screen.getByRole("button", { name: "더보기" });
    expect(more).toHaveAttribute("aria-haspopup", "menu");
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "링크 복사" }),
    ).toHaveFocus();
    expect(
      within(menu).getByRole("menuitem", { name: "신고하기" }),
    ).toBeEnabled();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it("더보기의 신고하기는 기존 신고 창을 열고 닫으면 더보기로 포커스를 돌린다", async () => {
    await setup(ops());
    const more = screen.getByRole("button", { name: "더보기" });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("menuitem", { name: "신고하기" }));
    const dialog = screen.getByRole("dialog", { name: "모집글 신고" });
    expect(within(dialog).getByLabelText("부적절한 내용")).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(more).toHaveFocus();
  });

  it("링크 복사는 현재 주소를 복사하고 결과를 알린다", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await setup(ops());
    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "링크 복사" }));
    });
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByRole("status")).toHaveTextContent("링크를 복사했어요");
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("작성자 메뉴에는 신고하기가 없고, 이미 신고한 모집은 비활성화한다", async () => {
    await setup(load({ relation: "AUTHOR" }));
    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect(
      screen.queryByRole("menuitem", { name: /신고/ }),
    ).not.toBeInTheDocument();
  });

  it("이미 신고한 모집은 메뉴의 신고 항목을 비활성화한다", async () => {
    await setup(load({ reported: true }));
    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect(screen.getByRole("menuitem", { name: "신고 완료" })).toBeDisabled();
  });

  it("공개 댓글은 모집 문의로 표시한다", async () => {
    await setup(ops());
    const heading = screen.getByRole("heading", { name: "모집 문의" });
    expect(heading.parentElement).toHaveTextContent("모집 문의공개");
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
    // Each action names its result before the confirmation.
    const panel = screen.getByRole("region", { name: "내 모집글 관리" });
    expect(panel).toHaveTextContent(
      "지금 3명으로 확정하고 새 참여를 막아요. 일정과 소통 링크는 그대로예요.",
    );
    expect(panel).toHaveTextContent(
      "모임이 없어지고 참여자에게는 '모집 취소'로 보여요. 되돌릴 수 없어요.",
    );
    expect(panel).toHaveTextContent("현재 3 / 4명 · 작성자 포함");
  });

  it("서버에 마감·취소 API가 없으면 버튼을 비활성화하고 준비 중으로 안내한다", async () => {
    await setup({
      ...author(),
      close: undefined,
      cancel: undefined,
    });
    const close = screen.getByRole("button", { name: "모집 마감하기" });
    const cancel = screen.getByRole("button", { name: "모집 취소하기" });
    expect(close).toBeDisabled();
    expect(cancel).toBeDisabled();
    expect(screen.getByText(/모집 마감 기능은 준비 중/)).toBeVisible();
    expect(screen.getByText("모집 취소 기능은 준비 중이에요.")).toBeVisible();
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "모집글 수정" }),
    ).toBeInTheDocument();
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
    ).toHaveTextContent("작성자 마감");
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

describe("작성자 확인창 시간 경계", () => {
  it.each([
    ["close", "모집 마감하기", "모집을 마감할까요?", "모집 마감"],
    ["cancel", "모집 취소하기", "모집을 취소할까요?", "모집 취소"],
  ] as const)(
    "%s 확인 중 기준시각에 도달하면 요청을 막고 닫은 뒤 관리 영역으로 포커스를 돌린다",
    async (action, triggerName, title, confirmName) => {
      vi.useFakeTimers();
      const now = Date.now();
      const operations = ops({
        load: vi.fn(async () =>
          post({
            relation: "AUTHOR",
            referenceTime: new Date(now + 1_000).toISOString(),
            serverTime: new Date(now).toISOString(),
          }),
        ),
      });
      await setup(operations);
      const trigger = screen.getByRole("button", { name: triggerName });
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = screen.getByRole("dialog", { name: title });
      await act(async () => vi.advanceTimersByTime(1_000));
      const confirm = within(dialog).getByRole("button", { name: confirmName });
      expect(confirm).toBeDisabled();
      expect(dialog).toHaveTextContent(
        "기준시각이 지나 더 이상 처리할 수 없어요",
      );
      fireEvent.click(confirm);
      expect(operations[action]).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole("button", { name: "돌아가기" }));
      expect(
        screen.getByRole("region", { name: "내 모집글 관리" }),
      ).toHaveFocus();
    },
  );
});

describe("신고", () => {
  async function openReport(operations = ops()) {
    await setup(operations);
    fireEvent.click(screen.getByRole("button", { name: "이 모집글 신고하기" }));
    return screen.getByRole("dialog", { name: "모집글 신고" });
  }

  it("서버에 신고 API가 없으면 신고 버튼 대신 준비 중으로 안내한다", async () => {
    await setup({ ...ops(), report: undefined });
    expect(
      screen.queryByRole("button", { name: "이 모집글 신고하기" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("신고 기능은 준비 중이에요.")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

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
      .fn<NonNullable<PostDetailOperations["report"]>>()
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

describe("상세 하단 고정 바·참여자 안내", () => {
  const load = (patch: Record<string, unknown>) =>
    ops({ load: vi.fn(async () => post(patch)) });
  const bar = () =>
    document.querySelector<HTMLElement>('[data-bottom-action="true"]');

  it("자정 무렵에는 출발·마감 모두 내일로 표시하고, 참여 전 바는 남은 자리와 신청 마감을 안내한다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T23:30:00+09:00"));
    await setup(
      load({
        referenceTime: "2026-11-14T01:18:00+09:00",
        participationDeadline: "2026-11-14T01:08:00+09:00",
        serverTime: "2026-11-13T23:30:00+09:00",
      }),
    );
    const header = screen.getByRole("article").querySelector("header")!;
    expect(header).toHaveTextContent("출발내일 01:18");
    expect(header).toHaveTextContent("신청·취소 마감내일 01:08");
    const action = bar()!;
    expect(
      within(action).getByRole("button", { name: "참여하기" }),
    ).toBeEnabled();
    expect(action).toHaveTextContent("1자리 남음");
    expect(action).toHaveTextContent("내일 01:08까지 신청");
  });

  it("배달은 참여·취소 마감과 주문 마감에 오늘·내일을 붙인다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T23:30:00+09:00"));
    await setup(
      load({
        type: "DELIVERY",
        departure: undefined,
        destination: undefined,
        restaurantName: "정문 김밥",
        pickupLocation: "정문",
        referenceTime: "2026-11-14T00:04:00+09:00",
        participationDeadline: "2026-11-13T23:49:00+09:00",
        serverTime: "2026-11-13T23:30:00+09:00",
      }),
    );
    const header = screen.getByRole("article").querySelector("header")!;
    expect(header).toHaveTextContent("주문 마감내일 00:04");
    expect(header).toHaveTextContent("참여·취소 마감오늘 23:49");
    expect(document.body).not.toHaveTextContent("메뉴 제출");
  });

  it("참여 중이고 소통 링크가 있으면 바의 주 버튼은 새 창 오픈채팅이다", async () => {
    await setup(load({ relation: "JOINED" }));
    const action = bar()!;
    const link = within(action).getByRole("link", { name: /오픈채팅 열기/ });
    expect(link).toHaveAttribute("href", "https://open.kakao.com/o/abc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(
      within(action).queryByRole("button", { name: "참여 취소" }),
    ).toBeNull();
  });

  it("참여 중인데 소통 링크가 없으면 모임 장소 보기가 참여자 안내로 포커스를 옮긴다", async () => {
    await setup(load({ relation: "JOINED", communicationUrl: undefined }));
    const action = bar()!;
    fireEvent.click(
      within(action).getByRole("button", { name: "모임 장소 보기" }),
    );
    expect(screen.getByRole("region", { name: "참여자 안내" })).toHaveFocus();
  });

  it("참여 취소는 참여자 안내 안에 취소 마감과 함께 있고 확인창을 거친다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T23:30:00+09:00"));
    const operations = load({
      relation: "JOINED",
      referenceTime: "2026-11-14T01:18:00+09:00",
      participationDeadline: "2026-11-14T01:08:00+09:00",
      serverTime: "2026-11-13T23:30:00+09:00",
    });
    await setup(operations);
    const info = screen.getByRole("region", { name: "참여자 안내" });
    const cancel = within(info).getByRole("button", { name: "참여 취소" });
    expect(cancel).toHaveAccessibleDescription("내일 01:08까지 가능");
    fireEvent.click(cancel);
    const dialog = screen.getByRole("dialog", {
      name: "내 참여를 취소할까요?",
    });
    expect(operations.leave).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    expect(cancel).toHaveFocus();
  });

  it.each([
    ["작성자 마감", { status: "CLOSED", joinable: false }],
    ["모집 취소", { status: "CANCELLED", joinable: false }],
  ])(
    "%s이면 하단 바 없이 상태 설명 아래 다른 모집 보기를 둔다",
    async (_, patch) => {
      await setup(load(patch));
      expect(bar()).toBeNull();
      expect(
        screen.getByRole("link", { name: "다른 모집 보기" }),
      ).toHaveAttribute(
        "href",
        postQueryHref("/posts", { type: "TAXI", joinableOnly: true, page: 0 }),
      );
    },
  );

  it("일정이 끝난 모집에는 하단 바가 없다", async () => {
    await setup(
      load({
        status: "FINISHED",
        joinable: false,
        referenceTime: new Date(Date.now() - 3_600_000).toISOString(),
      }),
    );
    expect(bar()).toBeNull();
    expect(
      screen.queryByRole("button", { name: /참여하기|참여 취소/ }),
    ).toBeNull();
  });
});
