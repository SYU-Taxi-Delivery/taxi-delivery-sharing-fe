import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TimePicker } from "./TimePicker";

function setup({
  value = "",
  readOnly = false,
  isDisabled = () => false,
}: {
  value?: string;
  readOnly?: boolean;
  isDisabled?: (time: string) => boolean;
} = {}) {
  const onChange = vi.fn();
  const onBlur = vi.fn();
  function Host() {
    const [current, setCurrent] = useState(value);
    return (
      <>
        <label htmlFor="time">출발 시간</label>
        <TimePicker
          id="time"
          name="time"
          label="출발 시간"
          value={current}
          readOnly={readOnly}
          isDisabled={isDisabled}
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
  return { onChange, onBlur, field: screen.getByLabelText("출발 시간") };
}

const open = (field: HTMLElement) =>
  act(async () => {
    fireEvent.click(field);
  });
const picker = () => screen.getByRole("dialog", { name: "출발 시간 선택" });
const list = (name: "시" | "분") =>
  within(picker()).getByRole("listbox", { name });
const key = (code: string) =>
  act(async () => {
    fireEvent.keyDown(document.activeElement!, { key: code });
  });

describe("TimePicker", () => {
  it("값이 없으면 안내 문구, 있으면 HH:mm을 보여 준다", () => {
    expect(setup().field).toHaveTextContent("시간 선택");
  });

  it("분은 5분 단위 12개만 제공한다", async () => {
    const { field } = setup();
    await open(field);
    const minutes = within(list("분"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(minutes).toEqual([
      "00분",
      "05분",
      "10분",
      "15분",
      "20분",
      "25분",
      "30분",
      "35분",
      "40분",
      "45분",
      "50분",
      "55분",
    ]);
    expect(within(list("시")).getAllByRole("option")).toHaveLength(24);
  });

  it("시를 고른 뒤 분을 고르면 값이 들어가고 닫힌 뒤 칸으로 포커스가 돌아온다", async () => {
    const { field, onChange, onBlur } = setup();
    await open(field);
    expect(list("시")).toHaveFocus();
    await act(async () => {
      fireEvent.click(within(list("시")).getByRole("option", { name: "18시" }));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(list("분")).toHaveFocus();
    await act(async () => {
      fireEvent.click(within(list("분")).getByRole("option", { name: "35분" }));
    });
    expect(onChange).toHaveBeenCalledWith("18:35");
    expect(onBlur).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(field).toHaveTextContent("18:35");
    expect(field).toHaveFocus();
  });

  it("값이 있으면 시만 바꿔도 같은 분으로 바로 반영한다", async () => {
    const { field, onChange } = setup({ value: "18:30" });
    await open(field);
    expect(
      within(list("시")).getByRole("option", { name: "18시" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(list("분")).getByRole("option", { name: "30분" }),
    ).toHaveAttribute("aria-selected", "true");
    await act(async () => {
      fireEvent.click(within(list("시")).getByRole("option", { name: "20시" }));
    });
    expect(onChange).toHaveBeenCalledWith("20:30");
  });

  it("방향키로 옮기고 Enter로 고르며 좌우 키로 열을 바꾼다", async () => {
    const { field, onChange } = setup({ value: "09:00" });
    await open(field);
    await key("ArrowDown");
    expect(list("시")).toHaveAttribute(
      "aria-activedescendant",
      within(list("시")).getByRole("option", { name: "10시" }).id,
    );
    await key("Enter");
    expect(list("분")).toHaveFocus();
    await key("ArrowLeft");
    expect(list("시")).toHaveFocus();
    await key("ArrowRight");
    await key("End");
    expect(list("분")).toHaveAttribute(
      "aria-activedescendant",
      within(list("분")).getByRole("option", { name: "55분" }).id,
    );
    await key("Home");
    await key("ArrowDown");
    await key("Enter");
    expect(onChange).toHaveBeenLastCalledWith("10:05");
  });

  it("고를 수 없는 시각은 표시만 하고 선택되지 않는다", async () => {
    const isDisabled = (time: string) => time <= "17:40";
    const { field, onChange } = setup({ isDisabled });
    await open(field);
    expect(
      within(list("시")).getByRole("option", { name: "16시" }),
    ).toHaveAttribute("aria-disabled", "true");
    // Opens on the first hour that still has choices.
    expect(
      within(list("시")).getByRole("option", { name: "17시" }),
    ).toHaveAttribute("aria-selected", "true");
    await act(async () => {
      fireEvent.click(within(list("분")).getByRole("option", { name: "40분" }));
    });
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(list("분")).getByRole("option", { name: "45분" }));
    });
    expect(onChange).toHaveBeenCalledWith("17:45");
  });

  it("Escape는 값을 바꾸지 않고 닫는다", async () => {
    const { field, onChange } = setup({ value: "18:30" });
    await open(field);
    await key("ArrowDown");
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

  it("잠긴 칸은 열리지 않는다", async () => {
    const { field } = setup({ value: "18:30", readOnly: true });
    expect(field).toHaveAttribute("aria-disabled", "true");
    await open(field);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
