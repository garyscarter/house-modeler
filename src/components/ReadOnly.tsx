import { createContext, useContext, type ReactNode } from "react";
import { useCanEdit } from "./useChassis";

/** True inside a read-only panel body (see ReadOnlyBody); Section reads it so its headers still open and close. */
export const ReadOnlyContext = createContext(false);
export const useReadOnly = (): boolean => useContext(ReadOnlyContext);

/**
 * The body of an inspector or mode panel. Where the current mode cannot edit (a phone in Build, Electrics, Garden or Plot;
 * lib/chassis.ts canEdit) its fields are disabled and drawn as plain text; elsewhere it renders its children untouched.
 * `skip` leaves a body live for a panel that sets read-only up itself (the Electrics panel, whose wiring guide still downloads).
 */
export function ReadOnlyBody({ skip, children }: { skip?: boolean; children: ReactNode }) {
  const editable = useCanEdit();
  if (editable || skip) return <>{children}</>;
  return (
    <ReadOnlyContext.Provider value={true}>
      <fieldset className="ro-body" disabled>
        {children}
      </fieldset>
    </ReadOnlyContext.Provider>
  );
}
