/** Ask the plan to open its Add furniture picker. The plan may not be mounted yet (3D's Add button switches tabs first), so the request is parked too. */
export const OPEN_ADD_EVENT = "house:open-add";
let pending = false;

export function requestAddPicker() {
  pending = true;
  window.dispatchEvent(new Event(OPEN_ADD_EVENT));
}

/** True once if a request is parked; the picker calls this on mount. */
export function takePendingAdd(): boolean {
  const p = pending;
  pending = false;
  return p;
}
