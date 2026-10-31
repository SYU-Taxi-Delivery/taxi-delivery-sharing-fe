import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoPrompt } from "./DemoPrompt";

beforeEach(() => {
  sessionStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      if (!this.open) return;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    }),
  });
});

describe("DemoPrompt", () => {
  it("첫 방문에 데모 진입과 닫기를 제공하며 닫기에 포커스를 둔다", () => {
    render(<DemoPrompt />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "혹시 데모를 보러 오셨나요?",
    );
    expect(screen.getByRole("link", { name: "보러가기" })).toHaveAttribute(
      "href",
      "/posts-preview",
    );
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
  });

  it("닫으면 같은 탭에서 다시 열리지 않는다", () => {
    render(<DemoPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    render(<DemoPrompt />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
