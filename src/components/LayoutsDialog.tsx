import { create } from "zustand";
import { Modal } from "./Modal";
import { ImportPanel } from "./ImportPanel";

const useLayoutsDialog = create<{ open: boolean }>(() => ({ open: false }));
export const openLayouts = () => useLayoutsDialog.setState({ open: true });
const close = () => useLayoutsDialog.setState({ open: false });

/** House menu, Layouts: load, copy, update or remove As listed and Proposed. */
export function LayoutsDialog() {
  const open = useLayoutsDialog((s) => s.open);
  if (!open) return null;
  return (
    <Modal title="Layouts" onClose={close} width={760}>
      <div className="layouts-grid">
        <ImportPanel variant="current" />
        <ImportPanel variant="proposed" />
      </div>
    </Modal>
  );
}
