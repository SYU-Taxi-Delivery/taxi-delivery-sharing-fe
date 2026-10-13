// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getParticipationAvailability,
  hideUnavailableDetails,
  type ParticipationSnapshot,
  type ParticipationStatus,
  type ViewerRelation,
} from "./participation";

const beforeDeadline = Date.parse("2026-10-13T17:49:59.999+09:00");
const deadline = Date.parse("2026-10-13T17:50:00.000+09:00");
const statuses: ParticipationStatus[] = [
  "OPEN",
  "FULL",
  "CLOSED",
  "CANCELLED",
  "FINISHED",
  "REMOVED",
];
const relations: ViewerRelation[] = [
  "GUEST",
  "AUTHOR",
  "NONE",
  "JOINED",
  "CANCELLED",
];

function makeSnapshot(
  overrides: Partial<ParticipationSnapshot> = {},
): ParticipationSnapshot {
  return {
    postId: "test-post",
    type: "TAXI",
    title: "테스트 모집",
    status: "OPEN",
    referenceTime: "2026-10-13T18:00:00+09:00",
    serverTime: "2026-10-13T17:30:00+09:00",
    currentMemberCount: 1,
    capacity: 4,
    viewerRelation: "NONE",
    joinable: true,
    ...overrides,
  };
}

describe.each(["TAXI", "DELIVERY"] as const)("%s 참여 정책", (type) => {
  const snapshot = (overrides: Partial<ParticipationSnapshot> = {}) =>
    makeSnapshot({ type, ...overrides });

  it("AC-JOIN-001-01: 미참여 사용자는 마감 전 참여할 수 있다", () => {
    expect(getParticipationAvailability(snapshot(), beforeDeadline)).toEqual({
      action: "join",
      reason: null,
      deadline,
    });
  });

  it("AC-JOIN-003-02: 참여 취소 이력이 있으면 동일 조건에서 재참여할 수 있다", () => {
    expect(
      getParticipationAvailability(
        snapshot({ viewerRelation: "CANCELLED" }),
        beforeDeadline,
      ).action,
    ).toBe("rejoin");
  });

  it.each(["NONE", "CANCELLED"] as const)(
    "AC-JOIN-005-04: 서버 joinable=false이면 %s 참여를 허용하지 않는다",
    (viewerRelation) => {
      expect(
        getParticipationAvailability(
          snapshot({ viewerRelation, joinable: false }),
          beforeDeadline,
        ),
      ).toMatchObject({ action: null, reason: expect.any(String) });
    },
  );

  it.each(["OPEN", "FULL", "CLOSED"] as const)(
    "AC-JOIN-006-04: JOINED의 %s 취소는 신규 참여 가능 여부와 독립이다",
    (status) => {
      expect(
        getParticipationAvailability(
          snapshot({
            status,
            currentMemberCount: status === "FULL" ? 4 : 2,
            viewerRelation: "JOINED",
            joinable: false,
          }),
          beforeDeadline,
        ).action,
      ).toBe("cancel");
    },
  );

  it.each(["NONE", "CANCELLED", "JOINED"] as const)(
    "AC-JOIN-005-01/02, AC-JOIN-006-04/05: %s는 정확한 T−10 경계부터 차단된다",
    (viewerRelation) => {
      const input = snapshot({
        viewerRelation,
        currentMemberCount: viewerRelation === "JOINED" ? 2 : 1,
      });
      expect(getParticipationAvailability(input, beforeDeadline).action).toBe(
        viewerRelation === "JOINED"
          ? "cancel"
          : viewerRelation === "CANCELLED"
            ? "rejoin"
            : "join",
      );
      expect(getParticipationAvailability(input, deadline)).toMatchObject({
        action: null,
        reason: expect.stringContaining("10분"),
      });
      expect(
        getParticipationAvailability(input, deadline + 1).action,
      ).toBeNull();
    },
  );

  it.each(["FULL", "CLOSED", "CANCELLED", "FINISHED", "REMOVED"] as const)(
    "AC-JOIN-001-03, AC-JOIN-003-03: %s에서는 신규 참여와 재참여를 차단한다",
    (status) => {
      for (const viewerRelation of ["NONE", "CANCELLED"] as const) {
        expect(
          getParticipationAvailability(
            snapshot({
              status,
              viewerRelation,
              currentMemberCount: status === "FULL" ? 4 : 1,
            }),
            beforeDeadline,
          ),
        ).toMatchObject({ action: null, reason: expect.any(String) });
      }
    },
  );

  it.each(["CANCELLED", "FINISHED", "REMOVED"] as const)(
    "AC-JOIN-006-06: %s에서는 JOINED 이력이 있어도 취소할 수 없다",
    (status) => {
      expect(
        getParticipationAvailability(
          snapshot({ status, viewerRelation: "JOINED", currentMemberCount: 2 }),
          beforeDeadline,
        ).action,
      ).toBeNull();
    },
  );

  it.each(["GUEST", "AUTHOR"] as const)(
    "AC-JOIN-001-04, AC-JOIN-004-01: %s에게 참여 동작을 제공하지 않는다",
    (viewerRelation) => {
      expect(
        getParticipationAvailability(
          snapshot({ viewerRelation }),
          beforeDeadline,
        ),
      ).toMatchObject({ action: null, reason: expect.any(String) });
    },
  );

  it("AC-JOIN-002-04: 작성자를 포함한 인원이 정원에 도달하면 참여할 수 없다", () => {
    expect(
      getParticipationAvailability(
        snapshot({ currentMemberCount: 4 }),
        beforeDeadline,
      ).action,
    ).toBeNull();
  });

  it("AC-FLOW-OPEN-01: 시간 경계가 지나도 서버 OPEN 상태와 인원을 임의 변경하지 않는다", () => {
    const input = snapshot();
    const original = { ...input };
    expect(getParticipationAvailability(input, deadline).action).toBeNull();
    expect(
      getParticipationAvailability(input, Date.parse(input.referenceTime))
        .action,
    ).toBeNull();
    expect(
      getParticipationAvailability(input, Date.parse(input.referenceTime))
        .reason,
    ).toBe("완료된 모집입니다.");
    expect(input).toEqual(original);
    expect(hideUnavailableDetails(input).status).toBe("OPEN");
  });

  it.each([
    { status: "CANCELLED", reason: "취소된 모집입니다." },
    { status: "REMOVED", reason: "삭제된 모집입니다." },
  ] as const)(
    "AC-JOIN-006-06: T 이후에도 $status의 사유를 완료로 바꾸지 않는다",
    ({ status, reason }) => {
      const input = snapshot({
        status,
        viewerRelation: "JOINED",
        currentMemberCount: 2,
      });
      expect(
        getParticipationAvailability(
          input,
          Date.parse(input.referenceTime) + 1,
        ),
      ).toMatchObject({ action: null, reason });
    },
  );
});

describe("유효하지 않은 모집 정보", () => {
  it.each([
    { referenceTime: "invalid" },
    { referenceTime: "2026-10-13T18:00:00" },
    { serverTime: "invalid" },
    { serverTime: "2026-10-13T17:30:00" },
    { currentMemberCount: 0 },
    { currentMemberCount: 5 },
    { currentMemberCount: 1.5 },
    { currentMemberCount: Number.NaN },
    { capacity: 1 },
    { capacity: 5 },
    { capacity: 2.5 },
    { capacity: Number.POSITIVE_INFINITY },
    { viewerRelation: "JOINED", currentMemberCount: 1 },
  ] satisfies Partial<ParticipationSnapshot>[])(
    "잘못된 시간/정원/관계 입력 %j는 참여를 차단한다",
    (overrides) => {
      expect(
        getParticipationAvailability(makeSnapshot(overrides), beforeDeadline),
      ).toMatchObject({ action: null, reason: expect.any(String) });
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "잘못된 현재시각 %s를 차단한다",
    (nowMs) => {
      expect(
        getParticipationAvailability(makeSnapshot(), nowMs).action,
      ).toBeNull();
    },
  );

  it("DELIVERY 정원 10명은 유효하고 11명은 차단한다", () => {
    expect(
      getParticipationAvailability(
        makeSnapshot({ type: "DELIVERY", capacity: 10 }),
        beforeDeadline,
      ).action,
    ).toBe("join");
    expect(
      getParticipationAvailability(
        makeSnapshot({ type: "DELIVERY", capacity: 11 }),
        beforeDeadline,
      ).action,
    ).toBeNull();
  });

  it("같은 instant를 나타내는 UTC 타임스탬프도 같은 경계로 판정한다", () => {
    expect(
      getParticipationAvailability(
        makeSnapshot({
          referenceTime: "2026-10-13T09:00:00Z",
          serverTime: "2026-10-13T08:30:00Z",
        }),
        beforeDeadline,
      ),
    ).toEqual({ action: "join", reason: null, deadline });
  });
});

describe.each(relations)("%s의 보호 정보", (viewerRelation) => {
  it.each(statuses)(
    "AC-COORD-004-01/02, AC-FLOW-MAIN-16: %s에서 허용된 명단·링크만 남긴다",
    (status) => {
      const input = makeSnapshot({
        status,
        viewerRelation,
        participantNames: ["작성자", "참가자"],
        communicationUrl: "https://example.com/coordination",
      });
      const original = { ...input };
      const result = hideUnavailableDetails(input);
      const hasAccess =
        viewerRelation === "AUTHOR" || viewerRelation === "JOINED";
      const isActive =
        status === "OPEN" || status === "FULL" || status === "CLOSED";

      expect(Object.hasOwn(result, "participantNames")).toBe(
        hasAccess && (isActive || status === "FINISHED"),
      );
      expect(Object.hasOwn(result, "communicationUrl")).toBe(
        hasAccess && isActive,
      );
      expect(result.status).toBe(status);
      expect(result === input).toBe(false);
      expect(input).toEqual(original);
    },
  );
});

describe.each(["AUTHOR", "JOINED"] as const)(
  "%s의 기준시각 경계 보호 정보",
  (viewerRelation) => {
    it.each(["OPEN", "FULL", "CLOSED"] as const)(
      "AC-FLOW-MAIN-16: %s enum이 남아 있어도 정확한 T부터 URL만 제거한다",
      (status) => {
        const input = makeSnapshot({
          status,
          viewerRelation,
          currentMemberCount: status === "FULL" ? 4 : 2,
          participantNames: ["작성자", "참가자"],
          communicationUrl: "https://example.com/coordination",
        });
        const referenceMs = Date.parse(input.referenceTime);
        expect(
          hideUnavailableDetails(input, referenceMs - 1).communicationUrl,
        ).toBe(input.communicationUrl);
        const finished = hideUnavailableDetails(input, referenceMs);
        expect(Object.hasOwn(finished, "communicationUrl")).toBe(false);
        expect(finished.participantNames).toEqual(input.participantNames);
        expect(finished.status).toBe(status);
        expect(
          Object.hasOwn(
            hideUnavailableDetails({
              ...input,
              serverTime: "2026-10-13T18:00:00.001+09:00",
            }),
            "communicationUrl",
          ),
        ).toBe(false);
        expect(input.communicationUrl).toBe("https://example.com/coordination");
      },
    );
  },
);

it("AC-COORD-004-07: 취소 관계로 바뀌면 명단·링크 프로퍼티 자체를 제거한다", () => {
  const joined = makeSnapshot({
    viewerRelation: "JOINED",
    currentMemberCount: 2,
    participantNames: ["작성자", "참가자"],
    communicationUrl: "https://example.com/coordination",
  });
  const cancelled = hideUnavailableDetails({
    ...joined,
    viewerRelation: "CANCELLED",
    currentMemberCount: 1,
  });
  expect(Object.hasOwn(cancelled, "participantNames")).toBe(false);
  expect(Object.hasOwn(cancelled, "communicationUrl")).toBe(false);
});
