import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TYPING_RELEASE_MS, useTypingFlag } from "./useTypingFlag";

function Probe() {
  const typing = useTypingFlag();
  return (
    <div data-testid="shell" data-typing={typing || undefined}>
      <input aria-label="제목" />
      <input type="checkbox" aria-label="참여 가능한 글만 보기" />
      <textarea aria-label="설명" />
      <button type="button">등록하기</button>
    </div>
  );
}

describe("useTypingFlag (bottom area steps aside while typing)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("turns on for text fields only", () => {
    render(<Probe />);
    const shell = screen.getByTestId("shell");
    act(() => screen.getByLabelText("참여 가능한 글만 보기").focus());
    expect(shell).not.toHaveAttribute("data-typing");
    act(() => screen.getByLabelText("제목").focus());
    expect(shell).toHaveAttribute("data-typing", "true");
  });

  it("stays on across field-to-field moves and turns off after a short delay", () => {
    render(<Probe />);
    const shell = screen.getByTestId("shell");
    act(() => screen.getByLabelText("제목").focus());
    act(() => screen.getByLabelText("설명").focus());
    act(() => vi.advanceTimersByTime(TYPING_RELEASE_MS + 10));
    expect(shell).toHaveAttribute("data-typing", "true");

    act(() => screen.getByRole("button", { name: "등록하기" }).focus());
    // The tapped button stays where it was while the tap finishes.
    expect(shell).toHaveAttribute("data-typing", "true");
    act(() => vi.advanceTimersByTime(TYPING_RELEASE_MS + 10));
    expect(shell).not.toHaveAttribute("data-typing");
  });
});
