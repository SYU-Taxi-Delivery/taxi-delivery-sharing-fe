import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArtPreviewPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("preview not found");
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("아이콘 세트 미리보기 경로", () => {
  it("운영 빌드에서는 열리지 않는다", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => ArtPreviewPage()).toThrow("preview not found");
  });

  it("개발 환경에서는 택시·배달·두유콩을 나란히 보여 준다", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<ArtPreviewPage />);
    expect(
      screen.getByRole("heading", { name: "두유팟 아이콘 세트" }),
    ).toBeVisible();
    for (const kind of ["taxi", "bag", "bean"])
      expect(document.querySelector(`svg[data-art="${kind}"]`)).not.toBeNull();
  });
});
