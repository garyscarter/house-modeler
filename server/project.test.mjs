import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProjectStore, createProjectStores, originMatchesHost, parsePutBody, projectFileName } from "./project.mjs";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hm-project-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const data = (name) => ({ variants: { current: { floors: [], name } }, photos: [], sites: {}, costRates: {} });

describe("project store", () => {
  it("starts empty and saves revision 1 from base 0", () => {
    const s = createProjectStore(path.join(dir, "nested"));
    expect(s.meta()).toBeNull();
    const r = s.save(0, data("a"), new Date("2026-01-01T10:00:00Z"));
    expect(r).toEqual({ ok: true, revision: 1, savedAt: "2026-01-01T10:00:00.000Z" });
    expect(JSON.parse(s.readRaw())).toEqual({ revision: 1, savedAt: "2026-01-01T10:00:00.000Z", data: data("a") });
  });

  it("increments the revision and refuses a stale base without overwriting", () => {
    const s = createProjectStore(dir);
    s.save(0, data("a"));
    expect(s.save(1, data("b")).revision).toBe(2);
    const stale = s.save(1, data("c"));
    expect(stale.ok).toBe(false);
    expect(stale.revision).toBe(2);
    expect(JSON.parse(s.readRaw()).data).toEqual(data("b"));
    expect(s.save(0, data("d")).ok).toBe(false);
  });

  it("survives a restart and leaves no temp files", () => {
    createProjectStore(dir).save(0, data("a"));
    const again = createProjectStore(dir);
    expect(again.meta()?.revision).toBe(1);
    expect(again.save(1, data("b")).ok).toBe(true);
    expect(fs.readdirSync(dir)).toEqual(["project.json"]);
  });

  it("treats a corrupt file as nothing saved", () => {
    fs.writeFileSync(path.join(dir, "project.json"), "{not json");
    const s = createProjectStore(dir);
    expect(s.meta()).toBeNull();
    expect(s.save(0, data("a")).ok).toBe(true);
  });
});

describe("originMatchesHost", () => {
  it("accepts only the server's own host", () => {
    expect(originMatchesHost("https://app.example.com", "app.example.com")).toBe(true);
    expect(originMatchesHost("http://localhost:5235", "localhost:5235")).toBe(true);
    expect(originMatchesHost("https://evil.example.com", "app.example.com")).toBe(false);
    expect(originMatchesHost("https://app.example.com.evil.com", "app.example.com")).toBe(false);
    expect(originMatchesHost(undefined, "app.example.com")).toBe(false);
    expect(originMatchesHost("null", "app.example.com")).toBe(false);
  });
});

describe("parsePutBody", () => {
  it("accepts a revision and a project", () => {
    expect(parsePutBody(JSON.stringify({ baseRevision: 0, data: data("a") }))?.baseRevision).toBe(0);
  });
  it("rejects anything else", () => {
    expect(parsePutBody("nope")).toBeNull();
    expect(parsePutBody(JSON.stringify({ data: data("a") }))).toBeNull();
    expect(parsePutBody(JSON.stringify({ baseRevision: "1", data: data("a") }))).toBeNull();
    expect(parsePutBody(JSON.stringify({ baseRevision: -1, data: data("a") }))).toBeNull();
    expect(parsePutBody(JSON.stringify({ baseRevision: 1, data: {} }))).toBeNull();
    expect(parsePutBody(JSON.stringify({ baseRevision: 1, data: [] }))).toBeNull();
  });
});

describe("per-house project stores", () => {
  it("keeps the default house in project.json and every other house in its own file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hm-houses-"));
    expect(projectFileName("home-a", "home-a")).toBe("project.json");
    expect(projectFileName("_template", "home-a")).toBe("project-_template.json");
    const stores = createProjectStores(dir, ["home-a", "_template"], "home-a");
    expect(stores.get("home-a").save(0, { a: 1 }).ok).toBe(true);
    expect(stores.get("_template").meta()).toBeNull();
    expect(stores.get("_template").save(0, { t: 1 }).ok).toBe(true);
    expect(fs.readdirSync(dir).sort()).toEqual(["project-_template.json", "project.json"]);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf8")).data).toEqual({ a: 1 });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
