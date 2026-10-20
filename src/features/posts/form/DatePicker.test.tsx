import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DatePicker } from "./DatePicker";

function setup({
  value = "2026-10-18",
  min = "2026-10-18",
  readOnly = false,
}: { value?: string; min?: string; readOnly?: boolean } = {}) {
  const onChange = vi.fn();
  const onBlur = vi.fn();
  function Host() {
    const [current, setCurrent] = useState(value);
    return (
      <>
        <label htmlFor="date">출발 날짜</label>
        <DatePicker
          id="date"
          name="date"
          label="출발 날짜"
          value={current}
          min={min}
          readOnly={readOnly}
          onChange={(next) => {
            onChange(next);
            setCurrent(next);
          }}
          onBlur={onBlur}
        />
        <button type="button">바깥</button>
      </>
    );
  }
  render(<Host />);
  return { onChange, onBlur, field: screen.getByLabelText("출발 날짜") };
}

const open = (field: HTMLElement) =>
  act(async () => {
    fireEvent.click(field);
  });

const calendar = () => screen.getByRole("dialog", { name: "출발 날짜 선택" });
const key = (code: string) =>
  act(async () => {
    fireEvent.keyDown(document.activeElement!, { key: code });
  });

describe("DatePicker", () => {
  it("AC-UI-FORM-02: 날짜를 요일과 함께 보여 주고 레이블로 찾을 수 있다", () => {
    const { field } = setup();
    expect(field).toHaveTextContent("2026. 10. 18. (일)");
    expect(field).toHaveAttribute("aria-haspopup", "dialog");
    expect(field).toHaveAttribute("aria-expanded", "false");
  });

  it("열면 해당 달과 선택한 날에 포커스를 둔다", async () => {
    const { field } = setup();
    await open(field);
    expect(field).toHaveAttribute("aria-expanded", "true");
    expect(within(calendar()).getByText("2026년 10월")).toBeVisible();
    const selected = within(calendar()).getByRole("button", {
      name: "2026년 10월 18일 일요일 (오늘)",
    });
    expect(selected).toHaveFocus();
    expect(selected.closest("[role=gridcell]")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("오늘 이전 날짜와 이전 달 이동을 막는다", async () => {
    const { field } = setup();
    await open(field);
    expect(
      within(calendar()).getByRole("button", { name: /10월 17일/ }),
    ).toBeDisabled();
    expect(
      within(calendar()).getByRole("button", { name: "이전 달" }),
    ).toBeDisabled();
  });

  it("날짜를 누르면 값을 바꾸고 닫힌 뒤 날짜 칸으로 포커스가 돌아온다", async () => {
    const { field, onChange, onBlur } = setup();
    await open(field);
    await act(async () => {
      fireEvent.click(
        within(calendar()).getByRole("button", { name: /10월 21일 수요일/ }),
      );
    });
    expect(onChange).toHaveBeenCalledWith("2026-10-21");
    expect(onBlur).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(field).toHaveTextContent("2026. 10. 21. (수)");
    expect(field).toHaveFocus();
  });

  it("방향키·Home·End·PageUp/Down으로 날짜를 옮기고 Enter로 고른다", async () => {
    const { field, onChange } = setup({ value: "2026-10-21" });
    await open(field);
    await key("ArrowRight");
    expect(document.activeElement).toHaveAccessibleName(/10월 22일/);
    await key("ArrowDown");
    expect(document.activeElement).toHaveAccessibleName(/10월 29일/);
    await key("Home");
    expect(document.activeElement).toHaveAccessibleName(/10월 25일 일요일/);
    await key("End");
    expect(document.activeElement).toHaveAccessibleName(/10월 31일 토요일/);
    await key("PageDown");
    expect(within(calendar()).getByText("2026년 11월")).toBeVisible();
    expect(document.activeElement).toHaveAccessibleName(/11월 30일/);
    await key("PageUp");
    expect(document.activeElement).toHaveAccessibleName(/10월 30일/);
    fireEvent.click(document.activeElement!);
    expect(onChange).toHaveBeenCalledWith("2026-10-30");
  });

  it("최소 날짜보다 앞으로는 키보드로도 가지 않는다", async () => {
    const { field } = setup();
    await open(field);
    await key("ArrowLeft");
    await key("ArrowUp");
    expect(document.activeElement).toHaveAccessibleName(/10월 18일/);
  });

  it("달의 마지막 날을 넘기지 않는다", async () => {
    const { field } = setup({ value: "2027-01-31", min: "2026-10-18" });
    await open(field);
    await key("PageDown");
    expect(within(calendar()).getByText("2027년 2월")).toBeVisible();
    expect(document.activeElement).toHaveAccessibleName(/2월 28일/);
  });

  it("Escape는 값을 바꾸지 않고 닫은 뒤 날짜 칸으로 포커스를 돌린다", async () => {
    const { field, onChange } = setup();
    await open(field);
    await key("ArrowRight");
    await key("Escape");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveFocus();
  });

  it("바깥을 누르면 닫힌다", async () => {
    const { field } = setup();
    await open(field);
    await act(async () => {
      fireEvent.pointerDown(screen.getByRole("button", { name: "바깥" }));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("오늘 버튼은 최소 날짜를 고른다", async () => {
    const { field, onChange } = setup({ value: "2026-11-02" });
    await open(field);
    fireEvent.click(within(calendar()).getByRole("button", { name: "오늘" }));
    expect(onChange).toHaveBeenCalledWith("2026-10-18");
  });

  it("값이 없으면 안내 문구를 보여 주고 최소 날짜 달을 연다", async () => {
    const { field } = setup({ value: "" });
    expect(field).toHaveTextContent("날짜 선택");
    await open(field);
    expect(document.activeElement).toHaveAccessibleName(/10월 18일/);
  });

  it("잠긴 칸은 열리지 않는다", async () => {
    const { field } = setup({ readOnly: true });
    expect(field).toHaveAttribute("aria-disabled", "true");
    await open(field);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
