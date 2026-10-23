import { describe, expect, it } from "vitest";
import { conflictAction, decideResume, conflictMessage, decideSync, formatSavedAt, isJsonReply, isProjectEmpty, parseProject, statusText, type Revision } from "./syncLogic";

const r = (revision: number, savedAt = "2026-03-01T14:02:00Z"): Revision => ({ revision, savedAt });
const model = { floors: [] };

describe("decideSync", () => {
  it("uploads a never-synced project when the server has nothing", () => {
    expect(decideSync({ local: null, server: null, dirty: false, localEmpty: false })).toBe("upload");
  });
  it("does nothing for an empty browser and an empty server", () => {
    expect(decideSync({ local: null, server: null, dirty: false, localEmpty: true })).toBe("none");
  });
  it("puts the project back when the server's copy was lost", () => {
    expect(decideSync({ local: r(4), server: null, dirty: false, localEmpty: false })).toBe("upload");
  });
  it("loads the server copy into an empty, never-synced browser", () => {
    expect(decideSync({ local: null, server: r(3), dirty: false, localEmpty: true })).toBe("load");
  });
  it("asks when a never-synced browser holding a project meets a server copy", () => {
    expect(decideSync({ local: null, server: r(3), dirty: false, localEmpty: false })).toBe("conflict");
  });
  it("loads a newer server copy when this browser has no unsynced changes", () => {
    expect(decideSync({ local: r(2), server: r(3), dirty: false, localEmpty: false })).toBe("load");
  });
  it("asks when both sides changed", () => {
    expect(decideSync({ local: r(2), server: r(3), dirty: true, localEmpty: false })).toBe("conflict");
  });
  it("does nothing when in step, and uploads local changes made since", () => {
    expect(decideSync({ local: r(3), server: r(3), dirty: false, localEmpty: false })).toBe("none");
    expect(decideSync({ local: r(3), server: r(3), dirty: true, localEmpty: false })).toBe("upload");
  });
  it("notices a rebuilt server copy that reuses a revision number", () => {
    expect(decideSync({ local: r(1, "2026-03-01T10:00:00Z"), server: r(1, "2026-03-02T10:00:00Z"), dirty: false, localEmpty: false })).toBe("load");
  });
});

describe("decideResume", () => {
  const base = { now: 100_000, lastResume: 0, saving: false, paused: false, noServer: false, enabled: true, dirty: false };
  it("checks the server when nothing is unsaved", () => {
    expect(decideResume(base)).toBe("check");
  });
  it("sends unsaved changes first", () => {
    expect(decideResume({ ...base, dirty: true })).toBe("flush");
  });
  it("checks rather than flushes before sync has found a server", () => {
    expect(decideResume({ ...base, enabled: false, dirty: true })).toBe("check");
  });
  it("is throttled to once every 10 seconds", () => {
    expect(decideResume({ ...base, lastResume: 95_000 })).toBe("skip");
    expect(decideResume({ ...base, lastResume: 90_000 })).toBe("check");
  });
  it("skips while saving, after Cancel, and where there is no server", () => {
    expect(decideResume({ ...base, saving: true })).toBe("skip");
    expect(decideResume({ ...base, paused: true })).toBe("skip");
    expect(decideResume({ ...base, noServer: true })).toBe("skip");
  });
});

describe("conflict dialog", () => {
  it("maps the three buttons, and a dismissal, to actions", () => {
    expect(conflictAction(0)).toBe("load");
    expect(conflictAction(1)).toBe("overwrite");
    expect(conflictAction(2)).toBe("cancel");
    expect(conflictAction(null)).toBe("cancel");
  });
  it("says when the other version was saved", () => {
    expect(conflictMessage("2026-03-01T14:02:00Z", new Date("2026-03-01T20:00:00Z"))).toMatch(/changed on another device \(saved .*\d.*\)\.$/);
    expect(conflictMessage(null)).toBe("This project was changed on another device.");
  });
});

describe("status line", () => {
  it("is empty when sync is off and describes the other states", () => {
    expect(statusText({ kind: "off" })).toBe("");
    expect(statusText({ kind: "saving" })).toBe("Saving…");
    expect(statusText({ kind: "offline" })).toBe("Couldn't reach the server, will retry");
    expect(statusText({ kind: "synced", savedAt: new Date().toISOString(), persistent: true })).toMatch(/^Synced with the server · saved \d/);
  });
  it("warns when the server copy is not permanent", () => {
    expect(statusText({ kind: "synced", savedAt: null, persistent: false })).toBe("Synced with the server · Server copy isn't permanent");
  });
  it("copes with a bad date", () => {
    expect(formatSavedAt("nonsense")).toBe("earlier");
  });
});

describe("replies and projects", () => {
  it("tells our server's JSON from a static host's page", () => {
    expect(isJsonReply("application/json; charset=utf-8")).toBe(true);
    expect(isJsonReply("text/html; charset=utf-8")).toBe(false);
    expect(isJsonReply(null)).toBe(false);
  });
  it("parses the export shape, and refuses anything that is not a project", () => {
    const p = parseProject({ variants: { current: model }, photos: [{ id: "p" }], costRates: { a: 1 } }, { z: 2 });
    expect(p?.variants).toEqual({ current: model });
    expect(p?.photos).toHaveLength(1);
    expect(p?.costRates).toEqual({ a: 1 });
    expect(parseProject({ variants: {} }, {})).toBeNull();
    expect(parseProject("nope", {})).toBeNull();
    expect(parseProject(null, {})).toBeNull();
  });
  it("accepts an emptied project only from the server", () => {
    expect(parseProject({ variants: {} }, { z: 2 }, { allowEmpty: true })).toEqual({ variants: {}, photos: [], sites: {}, costRates: { z: 2 } });
    expect(parseProject({ variants: {} }, { z: 2 })).toBeNull();
    expect(parseProject({}, {}, { allowEmpty: true })).toBeNull();
  });
  it("says when the project is too large to sync", () => {
    expect(statusText({ kind: "tooLarge" })).toContain("Too large to sync (over 50 MB)");
  });
  it("keeps the current cost rates when the file has none, and treats missing photos as none", () => {
    const p = parseProject({ variants: { proposed: model } }, { z: 2 });
    expect(p?.costRates).toEqual({ z: 2 });
    expect(p?.photos).toEqual([]);
  });
  it("reads the owner's pieces, ignoring junk, and leaves them undefined for older copies", () => {
    const p = parseProject({ variants: { current: model }, pieces: [{ id: "a", name: "Sofa", kind: "sofa-3", w: 2, d: 1, h: 1 }, 7] }, {});
    expect(p?.pieces).toHaveLength(1);
    expect(parseProject({ variants: { current: model } }, {})?.pieces).toBeUndefined();
    expect(parseProject({ variants: {}, pieces: [] }, {}, { allowEmpty: true })?.pieces).toEqual([]);
  });
  it("knows an empty project", () => {
    expect(isProjectEmpty({ variants: {}, photos: [] })).toBe(true);
    expect(isProjectEmpty({ variants: {}, photos: [{ id: "p" } as never] })).toBe(false);
  });
});
