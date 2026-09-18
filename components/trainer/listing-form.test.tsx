import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ListingForm } from "./listing-form";

test("moving countries clears the old postal area and updates timezone and currency guidance", async () => {
  const user = userEvent.setup();
  render(<ListingForm action={async () => null} submitLabel="Save changes" pendingLabel="Saving" zipOptional
    initial={{ country: "US", postalArea: "37203", bio: "My saved training experience.", timezone: "America/Chicago", specialties: ["barn_hunt"], serviceRadiusMiles: 25 }} />);
  await user.selectOptions(screen.getByLabelText("Country"), "CA");
  expect(screen.getByLabelText("Postal code")).toHaveValue("");
  expect(screen.getByLabelText("Postal code")).toBeRequired();
  expect(screen.getByLabelText("Your timezone")).toHaveValue("America/Toronto");
  expect(screen.getByText(/New services use CAD/)).toBeInTheDocument();
  expect(screen.getByLabelText("About you")).toHaveValue("My saved training experience.");
  expect(screen.getByLabelText("Barn Hunt")).toBeChecked();
  await user.selectOptions(screen.getByLabelText("Country"), "GB");
  expect(screen.getByLabelText("Postcode")).toHaveValue("");
  expect(screen.getByLabelText("Your timezone")).toHaveValue("Europe/London");
  expect(screen.getByText(/New services use GBP/)).toBeInTheDocument();
});

test("returning to a country preserves its selected timezone", async () => {
  const user = userEvent.setup();
  render(<ListingForm action={async () => null} submitLabel="Save changes" pendingLabel="Saving" zipOptional
    initial={{ country: "CA", postalArea: "V6B", timezone: "America/Vancouver" }} />);
  await user.selectOptions(screen.getByLabelText("Country"), "GB");
  await user.selectOptions(screen.getByLabelText("Country"), "CA");
  expect(screen.getByLabelText("Your timezone")).toHaveValue("America/Vancouver");
  await user.selectOptions(screen.getByLabelText("Your timezone"), "America/Edmonton");
  await user.selectOptions(screen.getByLabelText("Country"), "US");
  await user.selectOptions(screen.getByLabelText("Your timezone"), "America/Los_Angeles");
  await user.selectOptions(screen.getByLabelText("Country"), "CA");
  expect(screen.getByLabelText("Your timezone")).toHaveValue("America/Edmonton");
  await user.selectOptions(screen.getByLabelText("Country"), "US");
  expect(screen.getByLabelText("Your timezone")).toHaveValue("America/Los_Angeles");
});
