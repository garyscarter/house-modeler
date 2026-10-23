import { describe, expect, it } from "vitest";
import { roomColor } from "./roomColor";
import type { Room } from "../types";

const room = (name: string, color?: string) => ({ id: "r", name, points: [], color }) as unknown as Room;

describe("roomColor", () => {
  it("keeps a room's own colour", () => expect(roomColor(room("Kitchen", "#123456"))).toBe("#123456"));
  it("picks a colour from the name", () => expect(roomColor(room("Master Bedroom"))).toBe("#e3d5e6"));
  it("falls back to a neutral", () => expect(roomColor(room("Boot room"))).toBe("#e4e1d8"));
});
