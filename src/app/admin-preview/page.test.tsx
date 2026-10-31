import { describe, expect, it, vi } from "vitest";
import AdminPreviewPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("preview not found");
  },
}));
vi.mock("./AdminPreview", () => ({ AdminPreview: () => null }));

describe("관리자 미리보기 경로", () => {
  it("운영·테스트에서도 모의 관리자 화면을 제공한다", () => {
    for (const environment of ["production", "test"] as const) {
      vi.stubEnv("NODE_ENV", environment);
      expect(() => AdminPreviewPage()).not.toThrow();
    }
    vi.stubEnv("NODE_ENV", "development");
    expect(() => AdminPreviewPage()).not.toThrow();
  });
});
