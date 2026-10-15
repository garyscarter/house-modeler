import { describe, expect, it } from "vitest";
import { renamePhotos } from "./modelOps";

describe("renamePhotos", () => {
  const photos = [
    { id: "1", name: "a", dataUrl: "", floorName: "Ground", roomName: "Kitchen" },
    { id: "2", name: "b", dataUrl: "", floorName: "First", roomName: "Kitchen" },
  ];
  it("follows a renamed room on its own floor only", () => {
    const out = renamePhotos(photos, "Ground", { room: "Kitchen" }, { room: "Kitchen/Diner" });
    expect(out[0].roomName).toBe("Kitchen/Diner");
    expect(out[1].roomName).toBe("Kitchen");
  });
  it("follows a renamed floor", () => {
    const out = renamePhotos(photos, "First", { floor: "First" }, { floor: "First Floor" });
    expect(out[1].floorName).toBe("First Floor");
  });
  it("returns the same array when nothing changes", () => {
    expect(renamePhotos(photos, "Ground", { room: "Lounge" }, { room: "Living" })).toBe(photos);
  });
});
