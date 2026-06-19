import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the model-backed editor shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Page 100" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /100\.00 Index/i })).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "40 by 25 teletext grid" })).toBeInTheDocument();

    const rowOne = screen.getByTestId("teletext-row-1");
    expect(within(rowOne).getAllByRole("gridcell")).toHaveLength(40);

    expect(screen.getByRole("button", { name: "Blank page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weather page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subtitle newsflash" })).toBeInTheDocument();

    expect(screen.getByText("0 validation issues")).toBeInTheDocument();
    expect(screen.getByText("25 packet preview records")).toBeInTheDocument();
  });
});
