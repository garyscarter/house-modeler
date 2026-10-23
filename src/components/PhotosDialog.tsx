import { create } from "zustand";
import { Modal } from "./Modal";
import { PhotosPanel } from "./PhotosPanel";

const usePhotosDialog = create<{ open: boolean }>(() => ({ open: false }));
export const openPhotos = () => usePhotosDialog.setState({ open: true });
const close = () => usePhotosDialog.setState({ open: false });

/** House menu, Photos: the listing photos and your own, each assigned to a room or a side of the house. */
export function PhotosDialog() {
  const open = usePhotosDialog((s) => s.open);
  if (!open) return null;
  return (
    <Modal title="Photos" onClose={close} width="min(1100px, 92vw)" className="modal-photos">
      <PhotosPanel />
    </Modal>
  );
}
