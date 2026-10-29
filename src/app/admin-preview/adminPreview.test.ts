// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  toRemovalResult,
  toReportDetail,
  toReportList,
} from "@/features/admin/admin";
import { toMyHistory } from "@/features/my/myHistory";
import { toPostDetail } from "@/features/posts/detail/postDetail";
import { toPostPage } from "@/features/posts/posts";
import { createAdminPreview } from "./previewModel";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T17:00:00+09:00"));
});
afterEach(() => vi.useRealTimers());

async function finish<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([
    promise,
    vi.advanceTimersByTimeAsync(200),
  ]);
  return result;
}
const query = { type: "ALL", page: 0, joinableOnly: false } as const;

describe("관리자와 일반 화면이 공유하는 모의 상태", () => {
  it("신고 해결은 서버 메타데이터를 바꾸며 모집을 자동으로 숨기지 않는다", async () => {
    const model = createAdminPreview("normal");
    const processed = toReportDetail(
      await finish(model.admin.process("r1", "RESOLVED")),
    );
    expect(processed).toMatchObject({
      id: "r1",
      status: "RESOLVED",
      processedBy: "preview-admin",
      postStatus: "OPEN",
    });
    expect(processed.processedAt).toBeTruthy();
    expect(toReportDetail(await finish(model.admin.load("r1")))).toEqual(
      processed,
    );
    expect(
      toPostPage(await finish(model.posts.list(query))).content.map(
        (post) => post.id,
      ),
    ).toEqual(["p1", "p2"]);
    expect(toPostDetail(await finish(model.detail.load("p1"))).status).toBe(
      "OPEN",
    );
  });

  it("진행 중 모집 숨김은 목록·상세를 차단하고 작성자/참가자 이력을 최소 정보로 바꾼다", async () => {
    const model = createAdminPreview("normal");
    const result = toRemovalResult(await finish(model.admin.removePost("p1")));
    expect(result).toMatchObject({
      postId: "p1",
      participationEffect: "CANCELLED_ACTIVE",
    });
    expect(
      toPostPage(await finish(model.posts.list(query))).content.map(
        (post) => post.id,
      ),
    ).toEqual(["p2"]);
    await expect(finish(model.detail.load("p1"))).rejects.toMatchObject({
      kind: "notFound",
    });
    const created = toMyHistory(
      await finish(model.history.list("created")),
      "created",
    );
    const participated = toMyHistory(
      await finish(model.history.list("participated")),
      "participated",
    );
    expect(created.content.find((item) => item.id === "p1")).toEqual({
      id: "p1",
      status: "REMOVED",
      relation: "AUTHOR",
    });
    expect(participated.content.find((item) => item.id === "p1")).toEqual({
      id: "p1",
      status: "REMOVED",
      relation: "CANCELLED",
    });
    for (const id of ["r1", "r2"]) {
      expect(toReportDetail(await finish(model.admin.load(id)))).toMatchObject({
        postStatus: "REMOVED",
        postTitle: null,
        postContent: null,
        referenceTime: null,
      });
    }
    expect(toReportDetail(await finish(model.admin.load("r1"))).status).toBe(
      "PENDING",
    );
  });

  it("완료된 모집 숨김은 최종 참가 관계를 유지한다", async () => {
    const model = createAdminPreview("normal");
    expect(
      toRemovalResult(await finish(model.admin.removePost("p2")))
        .participationEffect,
    ).toBe("PRESERVED_HISTORY");
    const history = toMyHistory(
      await finish(model.history.list("participated")),
      "participated",
    );
    expect(history.content.find((item) => item.id === "p2")).toEqual({
      id: "p2",
      status: "REMOVED",
      relation: "JOINED",
    });
    await expect(finish(model.detail.load("p2"))).rejects.toMatchObject({
      kind: "notFound",
    });
  });

  it.each(["unknownOutcome", "malformedSuccess"] as const)(
    "%s에서는 저장된 처리 결과를 GET으로 확인하며 재처리하지 않는다",
    async (scenario) => {
      const model = createAdminPreview(scenario);
      if (scenario === "unknownOutcome") {
        await expect(
          finish(model.admin.process("r1", "RESOLVED")),
        ).rejects.toMatchObject({ kind: "unknownOutcome" });
      } else {
        const raw = await finish(model.admin.process("r1", "RESOLVED"));
        expect(() => toReportDetail(raw)).toThrow();
      }
      const stored = toReportDetail(await finish(model.admin.load("r1")));
      expect(stored).toMatchObject({
        status: "RESOLVED",
        processedBy: "preview-admin",
      });
      expect(
        toReportList(await finish(model.admin.list())).filter(
          (report) => report.id === "r1",
        ),
      ).toHaveLength(1);
      await expect(
        finish(model.admin.process("r1", "REJECTED")),
      ).rejects.toMatchObject({ kind: "conflict" });
      expect(toReportDetail(await finish(model.admin.load("r1")))).toEqual(
        stored,
      );
      expect(
        toPostPage(await finish(model.posts.list(query))).content,
      ).toHaveLength(2);
    },
  );

  it("알려진 처리·숨김 거절은 상태를 유지하며 사용자가 재시도할 수 있다", async () => {
    const process = createAdminPreview("processFailure");
    await expect(
      finish(process.admin.process("r1", "RESOLVED")),
    ).rejects.toMatchObject({ kind: "invalid" });
    expect(toReportDetail(await finish(process.admin.load("r1"))).status).toBe(
      "PENDING",
    );
    expect(
      toReportDetail(await finish(process.admin.process("r1", "RESOLVED")))
        .status,
    ).toBe("RESOLVED");
    const remove = createAdminPreview("removeFailure");
    await expect(finish(remove.admin.removePost("p1"))).rejects.toMatchObject({
      kind: "invalid",
    });
    expect(toPostDetail(await finish(remove.detail.load("p1"))).status).toBe(
      "OPEN",
    );
    expect(
      toRemovalResult(await finish(remove.admin.removePost("p1"))).status,
    ).toBe("REMOVED");
  });

  it("작성자·참가자·일반 조회자를 별도 모의 사용자로 구분한다", async () => {
    const model = createAdminPreview("normal");
    const actors = await Promise.all([
      model.auth.me(),
      model.studentAuth.me(),
      model.authorAuth.me(),
      model.participantAuth.me(),
    ]);
    expect(
      new Set(actors.map((actor) => (actor as { id: string }).id)).size,
    ).toBe(4);
    expect(toPostDetail(await finish(model.detail.load("p1"))).relation).toBe(
      "NONE",
    );
  });

  it("빈 목록·조회 실패·없는 상세·이미 숨긴 상태를 재현한다", async () => {
    expect(
      toReportList(await finish(createAdminPreview("empty").admin.list())),
    ).toEqual([]);
    const failed = createAdminPreview("listFailure");
    await expect(finish(failed.admin.list())).rejects.toThrow(
      "preview list failure",
    );
    expect(toReportList(await finish(failed.admin.list()))).toHaveLength(3);
    await expect(
      finish(createAdminPreview("missing").admin.load("r1")),
    ).rejects.toMatchObject({ kind: "notFound" });
    const removed = createAdminPreview("removed");
    expect(
      toReportDetail(await finish(removed.admin.load("r1"))).postTitle,
    ).toBeNull();
    await expect(finish(removed.detail.load("p1"))).rejects.toMatchObject({
      kind: "notFound",
    });
  });

  it("만료·권한 거절은 모의 신고 정보를 반환하지 않는다", async () => {
    const expired = createAdminPreview("expired");
    expect(await expired.auth.me()).toMatchObject({ role: "ADMIN" });
    await expect(finish(expired.admin.list())).rejects.toMatchObject({
      status: 401,
    });
    expect(await expired.auth.me()).toBeNull();
    for (const scenario of ["student", "forbidden"] as const) {
      await expect(
        finish(createAdminPreview(scenario).admin.list()),
      ).rejects.toMatchObject({ kind: "forbidden" });
    }
    await expect(
      finish(createAdminPreview("anonymous").admin.list()),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("신고 경합을 재조회로 확인하고 나머지 일반 변경은 미연동 상태로 둔다", async () => {
    const model = createAdminPreview("conflict");
    await expect(
      finish(model.admin.process("r1", "RESOLVED")),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(toReportDetail(await finish(model.admin.load("r1")))).toMatchObject({
      status: "REJECTED",
      processedBy: "preview-other-admin",
    });
    await expect(model.detail.join("p1")).rejects.toMatchObject({
      name: "PostDetailNotConnectedError",
    });
    await expect(model.history.leave("p1")).rejects.toMatchObject({
      name: "PostDetailNotConnectedError",
    });
  });
});
