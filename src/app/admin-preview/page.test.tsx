import { describe, expect, it, vi } from "vitest";
import AdminPreviewPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("preview not found");
  },
}));
vi.mock("./AdminPreview", () => ({ AdminPreview: () => null }));

describe("관리자 미리보기 경로", () => {
  it("운영·테스트에서는 404로 차단하고 개발 환경만 허용한다", () => {
    for (const environment of ["production", "test"] as const) {
      vi.stubEnv("NODE_ENV", environment);
      expect(() => AdminPreviewPage()).toThrow("preview not found");
    }
    vi.stubEnv("NODE_ENV", "development");
    expect(() => AdminPreviewPage()).not.toThrow();
  });
});
