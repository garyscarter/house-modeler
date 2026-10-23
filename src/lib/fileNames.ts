/** Today's date as yyyy-mm-dd, for file names. */
export const fileDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A file name made safe for every platform: "Floor 1 (Proposed)" -> "floor-1-proposed". */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";
