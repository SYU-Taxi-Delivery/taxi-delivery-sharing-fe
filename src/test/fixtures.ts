import type { CurrentUser } from "@/features/auth/auth";
import type { PostDetail } from "@/features/posts/detail/postDetail";

export const FIXED_SERVER_TIME = "2026-10-05T17:30:00+09:00";
export const REFERENCE_TIME = "2026-10-05T18:00:00+09:00";

export const users: { student: CurrentUser; admin: CurrentUser } = {
  student: { id: "test-student", displayName: "학생 테스트", role: "STUDENT" },
  admin: { id: "test-admin", displayName: "관리자 테스트", role: "ADMIN" },
};

/** Fresh values keep a mutation in one test from changing the next fixture. */
export function postFixture(patch: Partial<PostDetail> = {}): PostDetail {
  const base = {
    id: "test-post",
    title: "테스트 모집",
    description: "테스트용 안내",
    status: "OPEN" as const,
    referenceTime: REFERENCE_TIME,
    serverTime: FIXED_SERVER_TIME,
    createdAt: "2026-10-05T17:00:00+09:00",
    capacity: 4,
    currentMemberCount: 1,
    joinable: true,
    relation: "NONE" as const,
    authorName: "모집 작성자",
    participantNames: ["모집 작성자"],
    reported: false,
  };
  if (patch.type === "DELIVERY") {
    return {
      ...base,
      restaurantName: "테스트 음식점",
      pickupLocation: "정문",
      ...patch,
      type: "DELIVERY",
    };
  }
  return {
    ...base,
    departure: "정문",
    destination: "석계역",
    ...patch,
    type: "TAXI",
  };
}
