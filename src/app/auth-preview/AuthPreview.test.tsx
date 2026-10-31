import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AuthPreview } from "./AuthPreview";

const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/auth-preview",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-font" }),
}));

it("데모 로그인 성공 시 폼이 사라져도 데모 모집 목록으로 이동한다", async () => {
  render(<AuthPreview />);
  fireEvent.change(screen.getByLabelText("학교 이메일"), {
    target: { value: "student@syuin.ac.kr" },
  });
  fireEvent.change(screen.getByLabelText("비밀번호"), {
    target: { value: "preview-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith("/posts-preview"),
  );
});
