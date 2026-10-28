// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getParticipationAvailability } from "@/features/participation/participation";
import { postDetailOperations } from "@/features/posts/detail/postDetailApi";
import {
  InvalidMyHistoryData,
  parseMyTab,
  toMyHistory,
  toMySnapshot,
  type MyTab,
} from "./myHistory";
import {
  MyHistoryNotConnectedError,
  myHistoryOperations,
} from "./myHistoryApi";

const serverTime = "2026-10-20T17:30:00+09:00";
const taxi = {
  id: 1,
  type: "TAXI",
  status: "OPEN",
  referenceTime: "2026-10-20T18:00:00+09:00",
  capacity: 4,
  currentMemberCount: 3,
  joinable: true,
  departure: "삼육대학교 정문",
  destination: "석계역",
  relation: "JOINED",
};
const history = (content: unknown[], time: unknown = serverTime) => ({
  content,
  serverTime: time,
});

describe("toMyHistory", () => {
  it("작성과 참여 이력의 현재 관계 및 모집 상태를 각각 보존한다", () => {
    expect(toMyHistory(history([taxi]), "participated").content).toEqual([
      { ...taxi, id: "1" },
    ]);
    expect(
      toMyHistory(history([{ ...taxi, relation: "AUTHOR" }]), "created")
        .content[0],
    ).toMatchObject({ status: "OPEN", relation: "AUTHOR" });
    expect(
      toMyHistory(
        history([{ ...taxi, status: "FULL", relation: "CANCELLED" }]),
        "participated",
      ).content[0],
    ).toMatchObject({ status: "FULL", relation: "CANCELLED" });
  });

  it("알 수 없는 필드와 명단·소통 링크·개인정보를 버린다", () => {
    const result = toMyHistory(
      {
        ...history([
          {
            ...taxi,
            participantNames: ["비공개 참가자"],
            communicationUrl: "https://example.com/private",
            email: "private@example.com",
            phone: "010-0000-0000",
          },
        ]),
        userId: "another-user",
      },
      "participated",
    );
    expect(result).toEqual(history([{ ...taxi, id: "1" }]));
  });

  it("삭제 이력은 일반 필드 없이 읽고 원문을 모두 제거한다", () => {
    const removed = { id: 7, status: "REMOVED", relation: "CANCELLED" };
    const expected = { id: "7", status: "REMOVED", relation: "CANCELLED" };
    expect(toMyHistory(history([removed]), "participated").content).toEqual([
      expected,
    ]);
    expect(
      toMyHistory(
        history([
          {
            ...taxi,
            ...removed,
            title: "삭제된 제목",
            participantNames: ["이름"],
            communicationUrl: "https://example.com/chat",
          },
        ]),
        "participated",
      ).content,
    ).toEqual([expected]);
    expect(
      toMyHistory(history([{ ...removed, relation: "AUTHOR" }]), "created")
        .content,
    ).toEqual([{ ...expected, relation: "AUTHOR" }]);
  });

  it.each([
    ["participated", "AUTHOR"],
    ["created", "JOINED"],
    ["created", "CANCELLED"],
    ["participated", "NONE"],
    ["participated", "GUEST"],
    ["created", undefined],
  ] as const)("%s 탭에 %s 관계를 표시하지 않는다", (tab, relation) => {
    for (const status of ["OPEN", "REMOVED"]) {
      expect(() =>
        toMyHistory(history([{ ...taxi, status, relation }]), tab),
      ).toThrow(InvalidMyHistoryData);
    }
  });

  it("중복 id는 관계·상태와 무관하게 거절하고 최신 이벤트를 추측하지 않는다", () => {
    expect(() =>
      toMyHistory(
        history([taxi, { ...taxi, id: "1", relation: "CANCELLED" }]),
        "participated",
      ),
    ).toThrow(InvalidMyHistoryData);
    expect(() =>
      toMyHistory(
        history([taxi, { id: " 1 ", status: "REMOVED", relation: "JOINED" }]),
        "participated",
      ),
    ).toThrow(InvalidMyHistoryData);
  });

  it.each([undefined, "invalid", "2026-10-20T17:30:00", "Oct 20 2026 17:30Z"])(
    "서버 관찰 시각 %j를 거절한다",
    (time) => {
      expect(() =>
        toMyHistory({ ...history([taxi]), serverTime: time }, "participated"),
      ).toThrow(InvalidMyHistoryData);
    },
  );

  it("빈 이력과 UTC 서버 시각을 읽고 서버 순서를 유지한다", () => {
    const utc = "2026-10-20T08:30:00Z";
    expect(toMyHistory(history([], utc), "created")).toEqual(history([], utc));
    expect(
      toMyHistory(
        history([{ ...taxi, id: 2 }, taxi]),
        "participated",
      ).content.map((item) => item.id),
    ).toEqual(["2", "1"]);
  });

  it.each([
    null,
    {},
    { content: null, serverTime },
    history([null]),
    history([{ ...taxi, capacity: 5 }]),
    history([{ ...taxi, departure: " " }]),
    history([{ ...taxi, status: "UNKNOWN" }]),
    history([{ id: " ", status: "REMOVED", relation: "JOINED" }]),
  ])("잘못된 이력 %j를 일관된 오류로 거절한다", (value) => {
    expect(() => toMyHistory(value, "participated")).toThrow(
      InvalidMyHistoryData,
    );
  });
});

describe("parseMyTab", () => {
  it.each([
    [undefined, "participated"],
    ["unknown", "participated"],
    ["participated", "participated"],
    ["created", "created"],
    [["created", "participated"], "created"],
    [[], "participated"],
  ] satisfies [string | string[] | undefined, MyTab][])(
    "%j를 %s 탭으로 읽는다",
    (value, expected) => expect(parseMyTab(value)).toBe(expected),
  );
});

describe("toMySnapshot", () => {
  it.each(["TAXI", "DELIVERY"] as const)(
    "%s 카드를 기존 T−10 참여 정책에 보호 필드 없이 연결한다",
    (type) => {
      const [item] = toMyHistory(
        history([
          {
            ...taxi,
            type,
            restaurantName: "정문 김밥",
            pickupLocation: "학생회관 앞",
          },
        ]),
        "participated",
      ).content;
      if (item.status === "REMOVED") throw new Error("Expected live history");
      const snapshot = toMySnapshot(item, serverTime);
      expect(snapshot).toEqual({
        postId: "1",
        type,
        title: type === "TAXI" ? "삼육대학교 정문 → 석계역" : "정문 김밥",
        status: "OPEN",
        referenceTime: taxi.referenceTime,
        serverTime,
        currentMemberCount: 3,
        capacity: 4,
        viewerRelation: "JOINED",
        joinable: true,
      });
      const deadline = Date.parse(taxi.referenceTime) - 600_000;
      expect(getParticipationAvailability(snapshot, deadline - 1).action).toBe(
        "cancel",
      );
      expect(
        getParticipationAvailability(snapshot, deadline).action,
      ).toBeNull();
    },
  );
});

it("작성 이력은 API가 없어 가장하지 않고, 참여 취소 adapter를 재사용한다", async () => {
  expect(myHistoryOperations.leave).toBe(postDetailOperations.leave);
  await expect(myHistoryOperations.list("created")).rejects.toBeInstanceOf(
    MyHistoryNotConnectedError,
  );
});
