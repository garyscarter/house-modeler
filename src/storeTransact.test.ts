import { beforeEach, describe, expect, it } from "vitest";
import { clearHistory, transact, useStore } from "./store";
import { applyProject } from "./lib/sync";
import { listing91770873 } from "./lib/houses/listing91770873";

const st = () => useStore.getState();

describe("store: transact and clearHistory", () => {
  beforeEach(() => {
    useStore.setState({ variants: {}, sites: {}, photos: [], pieces: [], past: [], future: [] });
  });

  it("makes several changes one undo step, even right after another edit", () => {
    st().setVariant("current", listing91770873(""));
    st().setVariant("proposed", listing91770873(""));
    const before = st().past.length;
    transact(() => {
      st().setVariant("current", undefined);
      st().setVariant("proposed", undefined);
      st().addPhotos([]);
    });
    expect(st().past.length).toBe(before + 1);
    expect(st().variants.current).toBeUndefined();
    st().undo();
    expect(st().variants.current).toBeDefined();
    expect(st().variants.proposed).toBeDefined();
  });

  it("clearHistory empties undo and redo", () => {
    st().setVariant("current", listing91770873(""));
    st().undo();
    clearHistory();
    expect(st().past).toEqual([]);
    expect(st().future).toEqual([]);
  });

  it("leaves no history after a load from the server, but one step after an import", () => {
    st().setVariant("current", listing91770873(""));
    expect(applyProject({ variants: { proposed: listing91770873("") } }, true)).toBe(true);
    expect(st().past).toEqual([]);
    expect(st().future).toEqual([]);
    expect(applyProject({ variants: { current: listing91770873("") } })).toBe(true);
    expect(st().past.length).toBe(1);
  });
});
