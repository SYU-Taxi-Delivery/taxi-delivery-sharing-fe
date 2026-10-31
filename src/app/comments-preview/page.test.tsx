import { describe, expect, it, vi } from "vitest";
import CommentsPreviewPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("preview not found");
  },
}));
vi.mock("./CommentsPreview", () => ({ CommentsPreview: () => null }));

describe("댓글 미리보기 경로", () => {
  it("운영·테스트 환경에서도 모의 화면을 제공한다", () => {
    for (const environment of ["production", "test"] as const) {
      vi.stubEnv("NODE_ENV", environment);
      expect(() => CommentsPreviewPage()).not.toThrow();
    }
    vi.stubEnv("NODE_ENV", "development");
    expect(() => CommentsPreviewPage()).not.toThrow();
  });
});
