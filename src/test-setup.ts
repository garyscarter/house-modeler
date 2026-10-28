import { DEFAULT_HOUSE_ID } from "./houses";
import { loadHouse } from "./lib/house";

// Tests run against the default house, as the app does when it is the only one built.
await loadHouse(DEFAULT_HOUSE_ID);
