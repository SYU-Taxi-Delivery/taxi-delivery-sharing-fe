import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "@/features/auth/AuthProvider";
import {
  emptyDraft,
  PostFormError,
  type EditablePost,
  type PostFormOperations,
} from "./postDraft";
import { PostFormScreen } from "./PostFormScreen";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/posts/new",
}));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-noto-sans-kr" }),
}));

const NOW = new Date("2026-10-05T17:30:00+09:00");

beforeEach(() => {
  router.push.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
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

function ops(patch: Partial<PostFormOperations> = {}): PostFormOperations {
  return {
    findSimilar: vi.fn(async () => []),
    create: vi.fn(async () => "new-1"),
    load: vi.fn(),
    update: vi.fn(async () => {}),
    ...patch,
  };
}

async function setup(
  operations: PostFormOperations,
  props: Partial<Parameters<typeof PostFormScreen>[0]> = {},
) {
  render(
    <AuthProvider operations={auth}>
      <PostFormScreen mode="create" operations={operations} {...props} />
    </AuthProvider>,
  );
  await act(async () => {});
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function pickTime(label: string, hour: string, minute: string) {
  fireEvent.click(screen.getByLabelText(label));
  const picker = screen.getByRole("dialog", { name: `${label} 선택` });
  fireEvent.click(within(picker).getByRole("option", { name: `${hour}시` }));
  fireEvent.click(within(picker).getByRole("option", { name: `${minute}분` }));
}

function fillTaxi() {
  type("제목", "정문에서 석계역까지");
  type("출발지", "삼육대학교 정문");
  type("도착지", "석계역 1번 출구");
  pickTime("출발 시간", "18", "00");
  type("함께할 학생에게 전할 말", "정문 앞에서 만나요");
}

const submit = () =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "등록하기" }));
  });

describe("작성 폼", () => {
  it("AC-POST-001-01: 택시는 출발지·도착지·출발 날짜/시간·2~4명 정원을 받는다", async () => {
    await setup(ops());
    expect(
      screen.getByRole("heading", { level: 1, name: "택시 모집글 작성" }),
    ).toBeVisible();
    expect(screen.getByLabelText("택시")).toBeChecked();
    for (const label of [
      "제목",
      "출발지",
      "도착지",
      "출발 날짜",
      "출발 시간",
    ]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
    expect(
      screen.getByText(/작성자 포함 전체 정원 2~4명 · 등록 시 1 \/ 4명/),
    ).toBeVisible();
    expect(screen.queryByLabelText(/음식 종류/)).not.toBeInTheDocument();
  });

  it("AC-POST-001-02, AC-UI-FORM-05: 배달은 음식점·수령 장소·주문 마감·2~10명·주문 안내를 받고 음식 종류는 없다", async () => {
    await setup(ops(), { initialType: "DELIVERY" });
    for (const label of [
      "음식점명",
      "수령 장소",
      "주문 마감 날짜",
      "주문 마감 시간",
      "주문 안내 (선택)",
    ]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
    expect(screen.getByText(/2~10명/)).toBeVisible();
    expect(screen.queryByText(/한식|중식|음식 종류/)).not.toBeInTheDocument();
  });

  it("AC-UI-FORM-01: 유형을 바꿔도 공통값과 유형별 초안·정원을 따로 보관한다", async () => {
    await setup(ops());
    type("제목", "공통 제목");
    type("출발지", "석계역");
    fireEvent.click(screen.getByLabelText("배달"));
    for (let i = 0; i < 6; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "정원 1명 늘리기" }));
    }
    expect(screen.getByText("10명")).toBeVisible();
    expect(screen.getByLabelText("제목")).toHaveValue("공통 제목");
    fireEvent.click(screen.getByLabelText("택시"));
    expect(screen.getByLabelText("출발지")).toHaveValue("석계역");
    expect(screen.getByText("4명")).toBeVisible();
    fireEvent.click(screen.getByLabelText("배달"));
    expect(screen.getByText("10명")).toBeVisible();
  });

  it("AC-UI-FORM-03~04: 정원 버튼은 범위 끝에서 비활성이다", async () => {
    await setup(ops());
    const less = screen.getByRole("button", { name: "정원 1명 줄이기" });
    const more = screen.getByRole("button", { name: "정원 1명 늘리기" });
    expect(more).toBeDisabled();
    fireEvent.click(less);
    fireEvent.click(less);
    expect(screen.getByText("2명")).toBeVisible();
    expect(less).toBeDisabled();
    expect(screen.getByText(/등록 시 1 \/ 2명/)).toBeVisible();
  });

  it("AC-NFR-SEC-02-01: 입력 중 길이 초과를 바로 알리고 글자 수를 보여 준다", async () => {
    await setup(ops());
    type("제목", "가".repeat(61));
    fireEvent.blur(screen.getByLabelText("제목"));
    const title = screen.getByLabelText("제목");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription(/60자 이하로 입력해 주세요/);
    expect(screen.getByText("61/60자")).toHaveAttribute("data-over", "true");
  });

  it("AC-COORD-004-05: http 링크는 등록 요청 없이 안내한다", async () => {
    const operations = ops();
    await setup(operations);
    fillTaxi();
    type("외부 소통 링크 (선택)", "http://example.com");
    await submit();
    expect(operations.findSimilar).not.toHaveBeenCalled();
    expect(operations.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("외부 소통 링크 (선택)")).toHaveFocus();
  });

  it("빈 폼 제출은 요청 없이 첫 오류 칸으로 포커스를 옮긴다", async () => {
    const operations = ops();
    await setup(operations);
    await submit();
    expect(operations.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("제목")).toHaveFocus();
    expect(screen.getByText("출발지를 입력해 주세요.")).toBeVisible();
    expect(screen.getByText("전할 말을 입력해 주세요.")).toBeVisible();
  });

  it("AC-POST-002-05: 오늘은 정확히 10분 뒤까지의 시각을 고를 수 없다", async () => {
    await setup(ops());
    fireEvent.click(screen.getByLabelText("출발 시간"));
    const picker = screen.getByRole("dialog", { name: "출발 시간 선택" });
    expect(
      within(picker).getByRole("option", { name: "16시" }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(within(picker).getByRole("option", { name: "17시" }));
    expect(
      within(picker).getByRole("option", { name: "40분" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(picker).getByRole("option", { name: "45분" }),
    ).not.toHaveAttribute("aria-disabled");
    fireEvent.click(within(picker).getByRole("option", { name: "40분" }));
    expect(screen.getByLabelText("출발 시간")).toHaveTextContent("시간 선택");
    fireEvent.click(within(picker).getByRole("option", { name: "45분" }));
    expect(screen.getByLabelText("출발 시간")).toHaveTextContent("17:45");
  });

  it("다른 날짜를 고르면 그날의 모든 시각을 고를 수 있다", async () => {
    await setup(ops());
    fireEvent.click(screen.getByLabelText("출발 날짜"));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "출발 날짜 선택" })).getByRole(
        "button",
        { name: /10월 6일/ },
      ),
    );
    pickTime("출발 시간", "00", "05");
    expect(screen.getByLabelText("출발 시간")).toHaveTextContent("00:05");
  });

  it("AC-POST-002-01, AC-DISC-005-12: 유사 모집이 없으면 등록 후 생성된 상세로 이동한다", async () => {
    const operations = ops();
    await setup(operations);
    fillTaxi();
    await submit();
    expect(operations.findSimilar).toHaveBeenCalledTimes(1);
    expect(operations.create).toHaveBeenCalledWith({
      type: "TAXI",
      title: "정문에서 석계역까지",
      description: "정문 앞에서 만나요",
      communicationUrl: null,
      departure: "삼육대학교 정문",
      destination: "석계역 1번 출구",
      referenceTime: "2026-10-05T18:00:00+09:00",
      capacity: 4,
    });
    expect(router.push).toHaveBeenCalledWith("/posts/new-1");
  });

  it("AC-UI-FORM-02: 달력에서 고른 날짜와 시간으로 기준시각을 만든다", async () => {
    const operations = ops();
    await setup(operations);
    fillTaxi();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("출발 날짜"));
    });
    await act(async () => {
      fireEvent.click(
        within(
          screen.getByRole("dialog", { name: "출발 날짜 선택" }),
        ).getByRole("button", { name: /10월 7일 수요일/ }),
      );
    });
    expect(screen.getByLabelText("출발 날짜")).toHaveTextContent(
      "2026. 10. 7. (수)",
    );
    await submit();
    expect(operations.create).toHaveBeenCalledWith(
      expect.objectContaining({ referenceTime: "2026-10-07T18:00:00+09:00" }),
    );
  });

  it("AC-DISC-005-01, AC-DISC-005-10~11: 유사 모집을 보여 주고 상세 이동 또는 새로 작성을 고르게 한다", async () => {
    const operations = ops({
      findSimilar: vi.fn(async () => [
        {
          id: "s1",
          type: "TAXI",
          status: "OPEN",
          referenceTime: "2026-10-05T18:10:00+09:00",
          capacity: 4,
          currentMemberCount: 2,
          joinable: true,
          departure: "삼육대학교 정문",
          destination: "석계역 1번 출구",
        },
      ]),
    });
    await setup(operations);
    fillTaxi();
    await submit();
    const panel = screen.getByRole("region", {
      name: "비슷한 모집이 1개 있어요",
    });
    expect(within(panel).getByRole("link")).toHaveAttribute(
      "href",
      "/posts/s1",
    );
    expect(operations.create).not.toHaveBeenCalled();
    expect(within(panel).getByRole("heading")).toHaveFocus();
    await act(async () => {
      fireEvent.click(
        within(panel).getByRole("button", { name: "그래도 새로 작성" }),
      );
    });
    expect(operations.create).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/posts/new-1");
  });

  it("값을 바꾸면 이전 유사 모집 결과를 지운다", async () => {
    const operations = ops({
      findSimilar: vi.fn(async () => [
        {
          id: "s1",
          type: "TAXI",
          status: "OPEN",
          referenceTime: "2026-10-05T18:10:00+09:00",
          capacity: 4,
          currentMemberCount: 2,
          joinable: true,
          departure: "a",
          destination: "b",
        },
      ]),
    });
    await setup(operations);
    fillTaxi();
    await submit();
    type("도착지", "화랑대역");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("AC-DISC-005-13: 유사 조회 실패는 다시 확인 또는 확인 없이 등록을 제공한다", async () => {
    const findSimilar = vi
      .fn<PostFormOperations["findSimilar"]>()
      .mockRejectedValueOnce(new ApiError(500, ""))
      .mockResolvedValue([]);
    const operations = ops({ findSimilar });
    await setup(operations);
    fillTaxi();
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent("확인하지 못했어요");
    expect(operations.create).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    });
    expect(findSimilar).toHaveBeenCalledTimes(2);
    expect(operations.create).toHaveBeenCalledTimes(1);
  });

  it("AC-POST-003-01, AC-DISC-005-15: 같은 시각 중복은 입력을 유지하고 시간 칸에 안내한다", async () => {
    const operations = ops({
      create: vi.fn(async () => Promise.reject(new PostFormError("duplicate"))),
    });
    await setup(operations);
    fillTaxi();
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "같은 시각에 작성한 모집",
    );
    expect(screen.getByLabelText("출발 시간")).toHaveFocus();
    expect(screen.getByLabelText("출발 시간")).toHaveAccessibleDescription(
      /같은 시각\(분\)/,
    );
    expect(screen.getByLabelText("제목")).toHaveValue("정문에서 석계역까지");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("서버 시각 기준 거절은 시간 원인으로 안내한다", async () => {
    await setup(
      ops({
        create: vi.fn(async () => Promise.reject(new PostFormError("time"))),
      }),
    );
    fillTaxi();
    await submit();
    expect(screen.getByLabelText("출발 시간")).toHaveAccessibleDescription(
      /서버 시각 기준/,
    );
  });

  it("서버 필드 오류를 해당 칸에 표시하고 고치면 지운다", async () => {
    await setup(
      ops({
        create: vi.fn(async () =>
          Promise.reject(
            new PostFormError("invalid", {
              title: "사용할 수 없는 제목이에요.",
            }),
          ),
        ),
      }),
    );
    fillTaxi();
    await submit();
    expect(screen.getByLabelText("제목")).toHaveAccessibleDescription(
      /사용할 수 없는 제목/,
    );
    type("제목", "다른 제목");
    expect(
      screen.queryByText("사용할 수 없는 제목이에요."),
    ).not.toBeInTheDocument();
  });

  it("AC-POST-002-10~11: 응답 유실은 자동 재전송 없이 내 모집 확인을 안내한다", async () => {
    const operations = ops({
      create: vi.fn(async () =>
        Promise.reject(new TypeError("Failed to fetch")),
      ),
    });
    await setup(operations);
    fillTaxi();
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "등록 결과를 확인하지 못했어요",
    );
    expect(
      screen.getByRole("link", { name: "내 참여 · 모집 확인" }),
    ).toHaveAttribute("href", "/my");
    expect(operations.create).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("출발지")).toHaveValue("삼육대학교 정문");
  });

  it("AC-POST-002-09: 응답 대기 중 추가 제출을 막는다", async () => {
    let finish!: (id: string) => void;
    const create = vi.fn(() => new Promise<string>((r) => (finish = r)));
    await setup(ops({ create }));
    fillTaxi();
    await submit();
    const button = screen.getByRole("button", { name: "등록 중…" });
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => finish("new-1"));
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("AC-UI-FORM-06~08: 입력이 있으면 취소 전에 확인하고 돌아가기는 입력을 유지한다", async () => {
    await setup(ops());
    type("제목", "작성 중");
    const cancel = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancel);
    const dialog = screen.getByRole("dialog", {
      name: "작성 중인 내용을 버릴까요?",
    });
    expect(
      within(dialog).getByRole("button", { name: "돌아가기" }),
    ).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    expect(cancel).toHaveFocus();
    expect(screen.getByLabelText("제목")).toHaveValue("작성 중");
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    fireEvent.click(screen.getByRole("button", { name: "입력 폐기" }));
    expect(router.push).toHaveBeenCalledWith("/posts");
  });

  it("입력이 없으면 확인 없이 목록으로 돌아간다", async () => {
    await setup(ops());
    fireEvent.click(screen.getByRole("link", { name: /모집글 목록/ }));
    expect(router.push).toHaveBeenCalledWith("/posts");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("AC-POST-002-12: 작성 중 401이면 로그인 만료 안내로 바꾼다", async () => {
    await setup(
      ops({
        findSimilar: vi.fn(async () => Promise.reject(new ApiError(401, ""))),
      }),
    );
    fillTaxi();
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent("로그인이 만료됐어요");
  });
});

describe("수정 폼", () => {
  const post = (patch: Partial<EditablePost> = {}): EditablePost => {
    const draft = emptyDraft(NOW.getTime(), "TAXI");
    return {
      id: "p1",
      status: "OPEN",
      isAuthor: true,
      otherJoinedCount: 0,
      currentMemberCount: 1,
      draft: {
        ...draft,
        common: {
          title: "기존 제목",
          description: "기존 설명",
          communicationUrl: "",
        },
        taxi: {
          departure: "석계역",
          destination: "삼육대학교",
          date: "2026-10-05",
          time: "18:00",
          capacity: 4,
        },
      },
      ...patch,
    };
  };

  async function edit(operations: PostFormOperations) {
    await setup(operations, { mode: "edit", postId: "p1" });
  }

  it("AC-POST-001-03: 유형은 바꿀 수 없다", async () => {
    await edit(ops({ load: vi.fn(async () => post()) }));
    expect(
      screen.getByRole("heading", { level: 1, name: "모집글 수정" }),
    ).toBeVisible();
    expect(screen.getByLabelText("택시")).toBeDisabled();
    expect(screen.getByLabelText("배달")).toBeDisabled();
  });

  it("AC-POST-004-01: 참여자가 없으면 핵심 필드를 고쳐 저장하고 상세로 이동한다", async () => {
    const operations = ops({ load: vi.fn(async () => post()) });
    await edit(operations);
    type("출발지", "화랑대역");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장하기" }));
    });
    expect(operations.findSimilar).not.toHaveBeenCalled();
    expect(operations.update).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ departure: "화랑대역", capacity: 4 }),
    );
    expect(router.push).toHaveBeenCalledWith("/posts/p1");
  });

  it("AC-POST-004-02~03: 다른 참여자가 있으면 장소·시각·정원을 잠그고 비핵심만 보낸다", async () => {
    const operations = ops({
      load: vi.fn(async () =>
        post({ otherJoinedCount: 1, currentMemberCount: 2 }),
      ),
    });
    await edit(operations);
    expect(screen.getByText(/참여한 학생이 있어/)).toBeVisible();
    expect(screen.getByLabelText("출발지")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("출발 시간")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "정원 1명 줄이기" }),
    ).toBeDisabled();
    expect(screen.getByText(/현재 2 \/ 4명/)).toBeVisible();
    type("제목", "바뀐 제목");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장하기" }));
    });
    expect(operations.update).toHaveBeenCalledWith("p1", {
      title: "바뀐 제목",
      description: "기존 설명",
      communicationUrl: null,
    });
  });

  it("AC-POST-004-07: 지난 기준시각이어도 바꾸지 않았다면 비핵심 수정은 막지 않는다", async () => {
    vi.setSystemTime(new Date("2026-10-05T17:55:00+09:00"));
    const operations = ops({ load: vi.fn(async () => post()) });
    await edit(operations);
    type("제목", "바뀐 제목");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장하기" }));
    });
    expect(operations.update).toHaveBeenCalledTimes(1);
  });

  it.each(["CANCELLED", "FINISHED", "REMOVED"] as const)(
    "AC-POST-004-06: %s는 수정 폼을 열지 않는다",
    async (status) => {
      await edit(ops({ load: vi.fn(async () => post({ status })) }));
      expect(
        screen.queryByRole("button", { name: "저장하기" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("수정할 수 없어요");
    },
  );

  it("AC-POST-004-09: 저장 중 다른 학생이 참여하면 최신 잠금으로 다시 불러온다", async () => {
    const load = vi
      .fn<PostFormOperations["load"]>()
      .mockResolvedValueOnce(post())
      .mockResolvedValue(post({ otherJoinedCount: 1, currentMemberCount: 2 }));
    const operations = ops({
      load,
      update: vi.fn(async () => Promise.reject(new PostFormError("conflict"))),
    });
    await edit(operations);
    type("출발지", "화랑대역");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장하기" }));
    });
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toHaveTextContent("모집 상태가 바뀌어");
    expect(screen.getByLabelText("출발지")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("출발지")).toHaveValue("석계역");
  });

  it("불러오기 실패는 다시 불러오기를 제공한다", async () => {
    const load = vi
      .fn<PostFormOperations["load"]>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(post());
    await edit(ops({ load }));
    expect(screen.getByRole("alert")).toHaveTextContent("불러오지 못했어요");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    });
    expect(screen.getByLabelText("제목")).toHaveValue("기존 제목");
  });
});
