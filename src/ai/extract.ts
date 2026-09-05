import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { makeClient } from "./client";
import { imageSize, makeGriddedImage, splitDataUrl } from "../lib/image";
import { estimatePxPerM, snapRooms, bbox } from "../lib/geometry";
import type { Floor, HouseModel, Opening, Room } from "../types";
import { uid } from "../types";

const Pt = z.object({ x: z.number(), y: z.number() });

const RoomSchema = z.object({
  name: z.string().describe("Room label as printed, e.g. 'Kitchen', 'Bedroom 2'. Use 'Hall' or 'Landing' for circulation."),
  polygon: z
    .array(Pt)
    .describe("Outline of the room's interior, in grid coordinates (0-1000 on each axis). Clockwise, corners only, usually 4 for a rectangle, 6 for an L-shape."),
  width_m: z.number().nullable().describe("First printed dimension in metres, or null if none is printed."),
  depth_m: z.number().nullable().describe("Second printed dimension in metres, or null if none is printed."),
});

const OpeningSchema = z.object({
  kind: z.enum(["door", "window"]),
  x: z.number().describe("Grid x of the opening's centre"),
  y: z.number().describe("Grid y of the opening's centre"),
  orientation: z
    .enum(["horizontal", "vertical"])
    .describe("'horizontal' if the wall containing it runs left-right on the page, 'vertical' if the wall runs up-down."),
  width_m: z.number().nullable().describe("Approximate width in metres. Typical door 0.8, patio/bifold doors 2-4, window 1-2."),
});

const FloorSchema = z.object({
  name: z.string().describe("e.g. 'Ground Floor', 'First Floor'"),
  level: z.number().int().describe("0 for ground, 1 for first, 2 for second, -1 for basement"),
  rooms: z.array(RoomSchema),
  openings: z.array(OpeningSchema),
  stairs: Pt.nullable().describe("Centre of the staircase on this floor if drawn, else null."),
});

export const ExtractionSchema = z.object({
  floors: z.array(FloorSchema),
  notes: z.string().nullable().describe("Anything ambiguous or that you had to guess."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const SYSTEM = `You convert UK estate-agent floorplan images into structured geometry.

The image has a red coordinate grid overlaid: labels along the top are x (0 at left, 1000 at right) and labels down the left are y (0 at top, 1000 at bottom). Lines are every 50 units. Report every coordinate on this grid, reading positions against the nearest labelled lines. Precision matters: neighbouring rooms share walls, so their polygons must share edges exactly.

Rules:
- One entry per floor drawn on the image. If the image shows several floors side by side, each is its own floor with its own rooms.
- Every enclosed space is a room, including halls, landings, bathrooms, WCs, utility rooms and built-in storage. Skip the garden and anything outside the external walls. Include a garage or conservatory if it is drawn attached.
- Polygons trace the inside face of the walls. Corners only; do not add points along straight edges.
- Printed dimensions like "4.20m x 3.50m" or "13'9\\" x 11'6\\"" belong to the room they are inside; convert feet and inches to metres. Ignore "max" or "into bay" qualifiers.
- Doors are the arc symbols; windows are the thin double or triple lines in external walls. Give each its centre and orientation. Include external doors (front door, patio doors).
- If stairs are drawn, give their centre.`;

export interface ExtractProgress {
  (msg: string): void;
}

export async function extractFloorplan(
  apiKey: string,
  model: string,
  imageDataUrl: string,
  onProgress: ExtractProgress = () => {},
): Promise<{ extraction: Extraction; house: HouseModel }> {
  onProgress("Preparing image");
  const gridded = await makeGriddedImage(imageDataUrl);
  const { mediaType, data } = splitDataUrl(gridded);
  const size = await imageSize(imageDataUrl);

  onProgress(`Asking ${model} to read the plan`);
  const client = makeClient(apiKey);
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          {
            type: "text",
            text: "Extract every floor, room, door and window from this floorplan using the grid coordinates.",
          },
        ],
      },
    ],
    output_config: { format: betaZodOutputFormat(ExtractionSchema), effort: "high" },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this image.");
  }
  const extraction = response.parsed_output;
  if (!extraction) throw new Error("The model returned no structured output. Try again.");

  onProgress("Building model");
  return { extraction, house: extractionToModel(extraction, imageDataUrl, size) };
}

/** Convert grid-coordinate output into a HouseModel in image pixel space. */
export function extractionToModel(
  ex: Extraction,
  imageDataUrl: string,
  size: { w: number; h: number },
): HouseModel {
  const sx = size.w / 1000;
  const sy = size.h / 1000;
  const snapTol = Math.max(size.w, size.h) * 0.012;

  const floors: Floor[] = ex.floors
    .filter((f) => f.rooms.length)
    .map((f) => {
      let rooms: Room[] = f.rooms
        .filter((r) => r.polygon.length >= 3)
        .map((r) => ({
          id: uid(),
          name: r.name,
          polygon: r.polygon.map((p) => ({ x: p.x * sx, y: p.y * sy })),
          dims: r.width_m && r.depth_m ? { w: r.width_m, h: r.depth_m } : undefined,
        }));
      rooms = snapRooms(rooms, snapTol);

      const openings: Opening[] = f.openings.map((o) => ({
        id: uid(),
        kind: o.kind,
        x: o.x * sx,
        y: o.y * sy,
        orientation: o.orientation === "horizontal" ? "h" : "v",
        widthM: o.width_m ?? (o.kind === "door" ? 0.85 : 1.2),
      }));

      const all = rooms.flatMap((r) => r.polygon);
      const b = bbox(all);
      return {
        id: uid(),
        name: f.name,
        level: f.level,
        image: imageDataUrl,
        imageW: size.w,
        imageH: size.h,
        pxPerM: 0, // filled below
        origin: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 },
        offset: { x: 0, y: 0 },
        rooms,
        openings,
        stairs: f.stairs ? { x: f.stairs.x * sx, y: f.stairs.y * sy } : undefined,
      };
    });

  // One scale per floor from printed dimensions; fall back to any floor's
  // estimate, then to a guess that makes the widest floor about 9 m.
  const estimates = floors.map((f) => estimatePxPerM(f.rooms));
  const global = estimates.find((e) => e !== undefined);
  for (let i = 0; i < floors.length; i++) {
    const f = floors[i];
    const b = bbox(f.rooms.flatMap((r) => r.polygon));
    f.pxPerM = estimates[i] ?? global ?? b.w / 9;
  }

  floors.sort((a, b) => a.level - b.level);
  return { floors, ceilingHeight: 2.4, slabThickness: 0.25 };
}
