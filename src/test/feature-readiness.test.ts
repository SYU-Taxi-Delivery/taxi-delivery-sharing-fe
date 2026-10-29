// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toCurrentUser } from "@/features/auth/auth";
import { canWriteComment } from "@/features/comments/comments";
import { toMyHistory } from "@/features/my/myHistory";
import { getParticipationAvailability } from "@/features/participation/participation";
import {
  effectiveStatus,
  toPostDetail,
  toSnapshot,
  visibleDetails,
} from "@/features/posts/detail/postDetail";
import {
  emptyDraft,
  toReferenceTime,
  toSeoulParts,
  validateDraft,
} from "@/features/posts/form/postDraft";
import {
  FIXED_SERVER_TIME,
  REFERENCE_TIME,
  postFixture,
  users,
} from "./fixtures";

const reference = Date.parse(REFERENCE_TIME);

describe("공통 fixture로 확인하는 기능 간 경계", () => {
  it("STUDENT/ADMIN을 구분하고 모집·배열 변경을 다른 fixture에 남기지 않는다", () => {
    expect(toCurrentUser(users.student)?.role).toBe("STUDENT");
    expect(toCurrentUser(users.admin)?.role).toBe("ADMIN");
    const first = postFixture();
    first.title = "변경한 제목";
    first.participantNames?.push("임시 참가자");
    expect(postFixture().title).toBe("테스트 모집");
    expect(postFixture().participantNames).toEqual(["모집 작성자"]);
  });

  it.each(["TAXI", "DELIVERY"] as const)(
    "%s: AC-JOIN-005-01~02/AC-COORD-001-01 정책의 FE 부분에서 참여 T-10과 댓글 T를 구분한다",
    (type) => {
      const detail = toPostDetail(postFixture({ type }));
      const snapshot = toSnapshot(detail);
      const beforeDeadline = reference - 601_000;
      const deadline = reference - 600_000;
      expect(
        getParticipationAvailability(snapshot, beforeDeadline).action,
      ).toBe("join");
      expect(
        getParticipationAvailability(snapshot, deadline).action,
      ).toBeNull();
      expect(
        getParticipationAvailability(
          { ...snapshot, viewerRelation: "JOINED", currentMemberCount: 2 },
          beforeDeadline,
        ).action,
      ).toBe("cancel");
      expect(
        getParticipationAvailability(
          { ...snapshot, viewerRelation: "JOINED", currentMemberCount: 2 },
          deadline,
        ).action,
      ).toBeNull();
      expect(
        canWriteComment(detail.status, detail.referenceTime, deadline),
      ).toBe(true);
      expect(
        canWriteComment(detail.status, detail.referenceTime, reference - 1),
      ).toBe(true);
      expect(
        canWriteComment(detail.status, detail.referenceTime, reference),
      ).toBe(false);
      expect(effectiveStatus(detail, reference)).toBe("FINISHED");
    },
  );

  it.each(["TAXI", "DELIVERY"] as const)(
    "%s: AC-UI-FORM-02/AC-POST-002-05의 서울 시각과 T+10 등록 경계를 고정한다",
    (type) => {
      const detail = postFixture({ type });
      const parts = toSeoulParts(Date.parse(detail.referenceTime));
      expect(parts).toEqual({ date: "2026-10-05", time: "18:00" });
      expect(toReferenceTime(parts.date, parts.time)).toBe(REFERENCE_TIME);
      const draft = emptyDraft(Date.parse(FIXED_SERVER_TIME), type);
      draft.common = {
        title: detail.title,
        description: detail.description,
        communicationUrl: "",
      };
      draft.taxi = {
        departure: "정문",
        destination: "석계역",
        ...parts,
        capacity: 4,
      };
      draft.delivery = {
        restaurantName: "테스트 음식점",
        pickupLocation: "정문",
        ...parts,
        capacity: 4,
        orderGuide: "",
      };
      expect(
        validateDraft(draft, { nowMs: reference - 601_000 }).time,
      ).toBeUndefined();
      expect(
        validateDraft(draft, { nowMs: reference - 600_000 }).time,
      ).toBeDefined();
    },
  );

  it("AC-MY-001-04/AC-MY-002-03 대응 FE: 삭제 결과는 관계를 보존하는 최소 tombstone만 남긴다", () => {
    const removed = {
      ...postFixture({ relation: "JOINED", currentMemberCount: 2 }),
      status: "REMOVED",
      communicationUrl: "https://example.com/private",
      participantNames: ["모집 작성자", "다른 참가자"],
      email: "private@example.invalid",
    };
    const history = toMyHistory(
      { content: [removed], serverTime: FIXED_SERVER_TIME },
      "participated",
    );
    expect(history.content).toEqual([
      { id: "test-post", status: "REMOVED", relation: "JOINED" },
    ]);
    expect(
      visibleDetails(toPostDetail(removed), Date.parse(FIXED_SERVER_TIME)),
    ).toEqual({});
  });
});
