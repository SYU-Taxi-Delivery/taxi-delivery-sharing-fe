import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "@/app/page";

test("시작 화면의 제목과 서비스 준비 상태를 표시한다", () => {
  render(<Home />);

  expect(
    screen.getByRole("heading", { level: 1, name: "SYU 택시·배달 공유" }),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("서비스 준비 중");
});
