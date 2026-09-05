import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { makeClient } from "./client";
import { resizeDataUrl, splitDataUrl } from "../lib/image";
import type { HouseModel, Photo } from "../types";

const AssignmentSchema = z.object({
  assignments: z.array(
    z.object({
      photo_index: z.number().int(),
      floor_name: z.string().nullable().describe("Exactly one of the floor names given, or null if the photo is exterior or unplaceable."),
      room_name: z.string().nullable().describe("Exactly one of the room names on that floor, or null."),
      confidence: z.number().min(0).max(1),
      description: z.string().describe("One short sentence: what the photo shows and the finishes visible (floor, walls, kitchen units)."),
    }),
  ),
});

export async function assignPhotos(
  apiKey: string,
  model: string,
  house: HouseModel,
  photos: Photo[],
  onProgress: (m: string) => void = () => {},
): Promise<Map<string, { floorName?: string; roomName?: string; confidence: number; description: string }>> {
  const client = makeClient(apiKey);
  const roomList = house.floors
    .map((f) => `${f.name}: ${f.rooms.map((r) => r.name).join(", ")}`)
    .join("\n");

  const results = new Map<string, { floorName?: string; roomName?: string; confidence: number; description: string }>();
  const BATCH = 8;
  for (let i = 0; i < photos.length; i += BATCH) {
    const batch = photos.slice(i, i + BATCH);
    onProgress(`Matching photos ${i + 1}-${i + batch.length} of ${photos.length}`);
    const content: Array<
      | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } }
      | { type: "text"; text: string }
    > = [];
    for (let j = 0; j < batch.length; j++) {
      const small = await resizeDataUrl(batch[j].dataUrl, 800, 0.85);
      const { mediaType, data } = splitDataUrl(small);
      content.push({ type: "text", text: `Photo ${i + j}:` });
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
    }
    content.push({
      type: "text",
      text: `These are estate-agent listing photos of one house. The floorplan has these floors and rooms:\n${roomList}\n\nFor each photo (indexes ${i} to ${i + batch.length - 1}), say which room it shows. Use the floor and room names exactly as given. Photos of the outside, garden or street get null for both. If two bedrooms look alike, use size, window count and features to choose, and lower the confidence.`,
    });

    const response = await client.beta.messages.parse({
      model,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      messages: [{ role: "user", content }],
      output_config: { format: betaZodOutputFormat(AssignmentSchema), effort: "medium" },
    });
    if (response.stop_reason === "refusal") throw new Error("The model declined to process these photos.");
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("No structured output for photo matching.");
    for (const a of parsed.assignments) {
      const p = photos[a.photo_index];
      if (!p) continue;
      const floor = house.floors.find((f) => f.name.toLowerCase() === (a.floor_name ?? "").toLowerCase());
      const room = floor?.rooms.find((r) => r.name.toLowerCase() === (a.room_name ?? "").toLowerCase());
      results.set(p.id, {
        floorName: floor?.name,
        roomName: room?.name,
        confidence: a.confidence,
        description: a.description,
      });
    }
  }
  return results;
}
