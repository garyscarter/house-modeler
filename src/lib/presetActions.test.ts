import { afterEach, describe, expect, it } from "vitest";
import { currentHouse, useHouse } from "./house";
import { isListingDesign, latestListing } from "./presetActions";

describe("isListingDesign", () => {
  const real = currentHouse();
  afterEach(() => useHouse.setState({ house: real }));

  it("offers updates to a copied Proposed in a house with no Proposed preset", () => {
    useHouse.setState({ house: { ...real, proposed: undefined } });
    const copy = structuredClone(latestListing().model);
    delete copy.preset;
    copy.basedOn = { id: real.main, version: 1 };
    expect(isListingDesign(copy)).toBe(true);
  });
});
