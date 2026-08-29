import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ModelOption } from "@/shared/types/providerModels";
import { ModelPicker } from "./index";

const OPTIONS: ModelOption[] = [
  { id: "openai/gpt-oss-120b", label: "openai/gpt-oss-120b", family: "openai" },
  { id: "meta-llama/llama-3.1-8b-instant", label: "meta-llama/llama-3.1-8b-instant", family: "meta-llama" },
  { id: "qwen/qwen3.6-27b", label: "qwen/qwen3.6-27b", family: "qwen" },
];

function renderPicker(value = "openai/gpt-oss-120b", onChange = () => {}) {
  return render(
    <ModelPicker ariaLabel="Model" options={OPTIONS} value={value} onChange={onChange} />,
  );
}

describe("ModelPicker", () => {
  it("shows the current value on the trigger", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("openai/gpt-oss-120b");
  });

  it("shows the placeholder when value is empty", () => {
    render(<ModelPicker ariaLabel="Model" options={OPTIONS} value="" onChange={() => {}} placeholder="Select a model…" />);
    expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Select a model…");
  });

  it("opens on click and filters the list as you type", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: "Model" }));
    const search = screen.getByRole("textbox");
    expect(search).toHaveFocus();
    await user.type(search, "qwen");
    expect(screen.getByRole("option", { name: "qwen/qwen3.6-27b" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "openai/gpt-oss-120b" })).not.toBeInTheDocument();
  });

  it("selects with ArrowDown + Enter and calls onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker("", onChange);
    await user.click(screen.getByRole("button", { name: "Model" }));
    // Click-open resets the highlight to the first option; one ArrowDown moves
    // the highlight to the second option, which Enter then commits.
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("meta-llama/llama-3.1-8b-instant");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("closes on Escape without changing the value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker("openai/gpt-oss-120b", onChange);
    await user.click(screen.getByRole("button", { name: "Model" }));
    const search = screen.getByRole("textbox");
    await user.type(search, "qwen");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on outside click", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: "Model" }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("pins a current value that is not in the options as a selectable (current) row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModelPicker ariaLabel="Model" options={OPTIONS} value="weird-id" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Model" }));
    expect(screen.getByRole("option", { name: "weird-id (current)" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "weird-id (current)" }));
    expect(onChange).toHaveBeenCalledWith("weird-id");
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    render(<ModelPicker ariaLabel="Model" options={OPTIONS} value="" onChange={() => {}} disabled />);
    await user.click(screen.getByRole("button", { name: "Model" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});