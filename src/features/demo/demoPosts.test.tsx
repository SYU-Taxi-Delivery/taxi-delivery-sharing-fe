import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toMyHistory, type MyHistoryOperations } from "@/features/my/myHistory";
import {
  toPostDetail,
  type PostDetailOperations,
} from "@/features/posts/detail/postDetail";
import {
  toPostPage,
  type PostListOperations,
  type PostSummary,
} from "@/features/posts/posts";
import { PostsPreview } from "@/app/posts-preview/PostsPreview";
import { PostDetailPreview } from "@/app/post-detail-preview/PostDetailPreview";
import { MyPreview } from "@/app/my-preview/MyPreview";
import {
  demoPosts,
  findDemoPost,
  generateDemoPost,
  listDemoPosts,
  resetDemoPosts,
} from "./demoPosts";

const captured = vi.hoisted(() => ({
  list: null as unknown,
  detail: null as unknown,
  my: null as unknown,
}));
vi.mock("@/features/posts/PostListScreen", () => ({
  PostListScreen: (props: { operations: unknown }) => {
    captured.list = props.operations;
    return null;
  },
}));
vi.mock("@/features/posts/detail/PostDetailScreen", () => ({
  PostDetailScreen: (props: { operations: unknown }) => {
    captured.detail = props.operations;
    return null;
  },
}));
vi.mock("@/features/my/MyHistoryScreen", () => ({
  MyHistoryScreen: (props: { operations: unknown }) => {
    captured.my = props.operations;
    return null;
  },
}));

// The bug report's moment: preview-6 then left at 23:52, preview-5 at 23:40.
const NOW = Date.parse("2026-11-13T23:17:00+09:00");

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  sessionStorage.clear();
  resetDemoPosts(NOW);
});
afterEach(() => vi.useRealTimers());

async function settle<T>(promise: Promise<T>): Promise<T> {
  const [value] = await Promise.all([
    promise,
    vi.advanceTimersByTimeAsync(400),
  ]);
  return value;
}

async function screens(postId: string) {
  await act(async () => {
    render(
      <PostsPreview query={{ type: "ALL", joinableOnly: false, page: 0 }} />,
    );
    render(<PostDetailPreview postId={postId} />);
    render(<MyPreview tab="participated" />);
  });
  return {
    list: captured.list as PostListOperations,
    detail: captured.detail as PostDetailOperations,
    my: captured.my as MyHistoryOperations,
  };
}

async function listCard(list: PostListOperations, id: string) {
  for (let page = 0; ; page += 1) {
    const result = toPostPage(
      await settle(list.list({ type: "ALL", joinableOnly: false, page })),
    );
    const card = result.content.find((post) => post.id === id);
    if (card) return card;
    if (page + 1 >= result.totalPages) throw new Error(`${id} not listed`);
  }
}

/** What every screen shows for a post: time, places, author and seats. */
const shown = (post: PostSummary) => ({
  type: post.type,
  referenceTime: post.referenceTime,
  places:
    post.type === "TAXI"
      ? [post.departure, post.destination]
      : [post.restaurantName, post.pickupLocation],
  authorName: post.authorName,
  capacity: post.capacity,
  currentMemberCount: post.currentMemberCount,
});

const seoulTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(Date.parse(iso));

describe("공유 데모 모집글", () => {
  it("같은 ID는 언제 만들어도 같은 기록이다", () => {
    expect(generateDemoPost(5, NOW)).toEqual(generateDemoPost(5, NOW));
    expect(demoPosts().map((post) => post.id)).toContain("preview-121");
  });

  it.each([
    ["preview-6", "TAXI", "11. 13. 23:52", 3, 4, "한지우"],
    ["preview-5", "DELIVERY", "11. 13. 23:40", 5, 6, "이도윤"],
  ] as const)(
    "%s는 목록·상세·내 활동에서 시간·장소·작성자·정원·인원이 같다",
    async (id, type, time, count, capacity, author) => {
      const { list, detail, my } = await screens(id);

      const card = await listCard(list, id);
      const page = toPostDetail(await settle(detail.load(id)));
      expect(card.type).toBe(type);
      expect(seoulTime(card.referenceTime)).toBe(time);
      expect(shown(card)).toMatchObject({
        capacity,
        currentMemberCount: count,
        authorName: author,
      });
      expect(shown(page)).toEqual(shown(card));

      // Joining on the detail page changes the shared record.
      await settle(detail.join(id));
      const afterJoin = toPostDetail(await settle(detail.load(id)));
      expect(afterJoin.relation).toBe("JOINED");
      expect(afterJoin.currentMemberCount).toBe(count + 1);

      const listed = await listCard(list, id);
      expect(listed.currentMemberCount).toBe(count + 1);

      const history = toMyHistory(
        await settle(my.list("participated")),
        "participated",
      );
      const mine = history.content.find((item) => item.id === id);
      if (!mine || mine.status === "REMOVED") throw new Error("not in 내 활동");
      expect(mine.relation).toBe("JOINED");
      expect(shown(mine)).toEqual(shown(listed));
      expect(shown(mine)).toEqual(shown(afterJoin));
    },
  );

  it("내 활동에서 참여를 취소하면 목록과 상세 인원도 줄어든다", async () => {
    const { list, detail, my } = await screens("preview-6");
    await settle(detail.join("preview-6"));
    await settle(my.leave("preview-6"));
    expect((await listCard(list, "preview-6")).currentMemberCount).toBe(3);
    const page = toPostDetail(await settle(detail.load("preview-6")));
    expect(page.relation).toBe("CANCELLED");
    expect(page.currentMemberCount).toBe(3);
  });

  it("작성자 마감·취소는 목록에서 빠지고 내 활동 상태가 바뀐다", async () => {
    const { list, detail } = await screens("preview-9");
    expect(findDemoPost("preview-9")?.relation).toBe("AUTHOR");
    await settle(detail.close!("preview-9"));
    await expect(listCard(list, "preview-9")).rejects.toThrow("not listed");
    expect(toPostDetail(await settle(detail.load("preview-9"))).status).toBe(
      "CLOSED",
    );
    await settle(detail.cancel!("preview-9"));
    expect(toPostDetail(await settle(detail.load("preview-9")))).toMatchObject({
      status: "CANCELLED",
      currentMemberCount: 1,
    });
  });

  it("데모 목록도 서버와 같은 검색 규칙(장소·방향·시간·정렬)을 쓴다", () => {
    const query = { type: "TAXI" as const, joinableOnly: false, page: 0 };
    const fromStation = listDemoPosts({ ...query, departure: "석계 역" }, NOW);
    expect(fromStation.length).toBeGreaterThan(0);
    expect(
      fromStation.every((post) => post.departure === "석계역 1번 출구"),
    ).toBe(true);
    const toSchool = listDemoPosts({ ...query, direction: "TO_SCHOOL" }, NOW);
    expect(toSchool.every((post) => post.destination?.includes("삼육대"))).toBe(
      true,
    );
    const hour = listDemoPosts({ ...query, time: "hour" }, NOW);
    expect(
      hour.every((post) => {
        const at = Date.parse(post.referenceTime);
        return at >= NOW && at < NOW + 3_600_000;
      }),
    ).toBe(true);
    expect(hour.map((post) => post.id)).toContain("preview-6");
    const recent = listDemoPosts({ ...query, sort: "RECENT" }, NOW);
    const created = recent.map((post) => Date.parse(post.createdAt));
    expect(created).toEqual([...created].sort((a, b) => b - a));
    // 참여 가능 = joinable only, as the server's joinable=true.
    expect(
      listDemoPosts({ ...query, joinableOnly: true }, NOW).every(
        (post) => post.joinable,
      ),
    ).toBe(true);
  });

  it("알 수 없는 ID는 상세에서 찾을 수 없음으로 끝난다", async () => {
    const { detail } = await screens("preview-detail");
    await expect(settle(detail.load("preview-detail"))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("같은 탭에서 주소를 다시 열면 바뀐 기록을 이어 쓰고, 새로고침은 처음부터다", async () => {
    const { detail } = await screens("preview-6");
    await settle(detail.join("preview-6"));
    const saved = JSON.parse(sessionStorage.getItem("doyupot:demo-posts")!);
    expect(
      saved.posts.find((post: { id: string }) => post.id === "preview-6")
        .relation,
    ).toBe("JOINED");

    vi.resetModules();
    const reopened = await import("./demoPosts");
    expect(reopened.findDemoPost("preview-6")?.relation).toBe("JOINED");

    vi.resetModules();
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { type: "reload" } as PerformanceNavigationTiming,
    ]);
    const reloaded = await import("./demoPosts");
    expect(reloaded.findDemoPost("preview-6")?.relation).toBe("NONE");
  });
});
