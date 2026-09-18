import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/app/(app)/trainers/actions", () => ({ recordTrainerSearch: vi.fn() }));

import { DirectoryFilters } from "./directory-filters";

describe("country-aware directory controls", () => {
  test("switching country clears an incompatible location and updates units", () => {
    render(<DirectoryFilters country="US" zip="37203" radiusMiles={25} specialties={[]} />);
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "CA" } });
    expect(screen.getByLabelText("Near postal code")).toHaveValue("");
    expect(screen.getByLabelText("Near postal code")).toHaveAttribute("maxlength", "7");
    expect(screen.getByRole("option", { name: "40 km" })).toHaveValue("25");
    fireEvent.change(screen.getByLabelText("Near postal code"), { target: { value: "M5V 3A8" } });
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "GB" } });
    expect(screen.getByLabelText("Near postcode")).toHaveValue("");
    expect(screen.getByRole("option", { name: "25 miles" })).toHaveValue("25");
  });

  test("a canonical navigation discards unsearched country and location drafts", () => {
    const { rerender } = render(<DirectoryFilters key="first" country="CA" zip="M5V" radiusMiles={25} specialties={["puppy"]} />);
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "GB" } });
    fireEvent.change(screen.getByLabelText("Near postcode"), { target: { value: "SW1A" } });
    rerender(<DirectoryFilters key="second" country="CA" zip="M5V" radiusMiles={50} specialties={[]} />);
    expect(screen.getByLabelText("Country")).toHaveValue("CA");
    expect(screen.getByLabelText("Near postal code")).toHaveValue("M5V");
    expect(screen.getByLabelText("Within")).toHaveValue("50");
    expect(screen.getByRole("checkbox", { name: "Puppy" })).not.toBeChecked();
  });
});
