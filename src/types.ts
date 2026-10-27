/** A point in floorplan image pixel coordinates. */
export interface Pt {
  x: number;
  y: number;
}

export interface Room {
  id: string;
  name: string;
  /** Polygon in image pixel coordinates. */
  polygon: Pt[];
  /** Selects but can't be moved, resized or reshaped on the plan. */
  locked?: boolean;
  /** Printed dimensions from the plan, in metres, if any. */
  dims?: { w: number; h: number };
  /** Photo used as the floor texture, if any. */
  floorPhotoId?: string;
  color?: string;
  /** Colour of this room's external walls (e.g. brick vs render). */
  exteriorColor?: string;
  /** Rooms sharing a roofGroup get their own gable when the extension roof is "separate". */
  roofGroup?: string;
  /** Free-text notes (snags, ideas, quotes) shown in the inspector and the report. */
  notes?: string;
  /** Floor finish drawn in 3D. Undefined = plain colour. */
  floorFinish?: FloorFinish;
  /** Direction of the floor's pattern (boards, herringbone rows, tiles), degrees turned on the plan. Undefined = 0, along the plan's x axis. */
  floorAngle?: number;
  /** Grout colour of a tiled floor. Undefined = the finish's own. */
  floorGrout?: string;
  /** Interior paint colour of this room's walls; under a covering, the wallpaper ground, tile or brick colour. */
  wallPaint?: string;
  /** What the inside walls are covered with. Undefined = paint. */
  wallCovering?: WallCovering;
  /** Pattern colour of the covering (stripes, flowers, motif, tile feature strip, mortar). Undefined = the covering's default. */
  wallAccent?: string;
  /** Covering of the wall above a half-height one (panelling, boards, splashback): paint or a wallpaper. Undefined = paint. Its ground colour is wallPaint. */
  upperCovering?: WallCovering;
  /** Pattern colour of the paper above the band. Undefined = the paper's default. */
  upperAccent?: string;
  /**
   * Feature walls: a finish of their own for some walls, keyed by polygon edge
   * (edge i runs from polygon[i] to the next corner). Adding or removing a
   * corner in the editor renumbers them (see lib/featureWalls.ts); keys for
   * edges that no longer exist are ignored.
   */
  wallFinishes?: Record<number, WallOverride>;
  /** Finish of this room's external walls; undefined = the house default (Exterior.wallFinish). */
  exteriorFinish?: WallFinish;
  /** Not heated (a garage or store): left out of the heated floor area. Undefined = guess from the name. */
  unheated?: boolean;
  /** Colour of the skirting boards in this room (dark stained wood, quarry tile…). Undefined = white-painted. */
  skirtingColor?: string;
  /** Floor style follows this room (id, any floor of the same variant): finish, direction, grout, colour and floor photo are copied from it whenever it changes. */
  floorFrom?: string;
  /** Wall style follows this room: covering, colours, the paper above a band and skirting. Feature walls stay the room's own. */
  wallsFrom?: string;
}

export type WallFinish = "render" | "brick" | "pebbledash" | "stone" | "cladding";
export const WALL_FINISH_LABEL: Record<WallFinish, string> = {
  render: "Smooth render",
  brick: "Brick",
  pebbledash: "Pebbledash",
  stone: "Stone",
  cladding: "Timber cladding",
};

export type WallCovering =
  | "paint"
  | "stripe"
  | "floral"
  | "rose"
  | "trail"
  | "sprig"
  | "tiles"
  | "squares"
  | "brick"
  | "panelling"
  | "panellingFull"
  | "batten"
  | "tongue"
  | "metro"
  | "metroSplash"
  | "zellige"
  | "limewash"
  | "deco"
  | "leaves"
  | "jungle"
  | "microcement";
export const WALL_COVERING_LABEL: Record<WallCovering, string> = {
  paint: "Paint",
  stripe: "Striped wallpaper",
  floral: "Floral wallpaper",
  rose: "Large-rose wallpaper",
  trail: "Trailing-leaf wallpaper",
  sprig: "Small-pattern wallpaper",
  tiles: "Wall tiles",
  squares: "Small square tiles",
  brick: "Exposed brick",
  panelling: "Shaker panelling (half height)",
  panellingFull: "Shaker panelling (full height)",
  batten: "Board and batten (full height)",
  tongue: "Tongue and groove (half height)",
  metro: "Metro tiles (full height)",
  metroSplash: "Metro tiles (splashback)",
  zellige: "Zellige tiles",
  limewash: "Limewash plaster",
  deco: "Geometric deco wallpaper",
  leaves: "Botanical leaf wallpaper",
  jungle: "Tropical parrot wallpaper",
  microcement: "Microcement",
};

/**
 * One wall's own finish. Fields left out follow the room; a covering other
 * than the room's starts from that covering's default colours.
 */
export interface WallOverride {
  covering?: WallCovering;
  /** Base colour: paint, wallpaper ground, tile or brick. */
  paint?: string;
  /** Pattern colour of the covering. */
  accent?: string;
  /** A second colour on one side of a line across the wall. Only applies while the wall's covering is paint. */
  split?: WallSplit;
  /** The same edge's outside face, if it is an outside wall: fields left out follow the room's outside finish. */
  outside?: OutsideOverride;
}

export type WallSplitKind = "diagonalUp" | "diagonalDown" | "horizontal" | "vertical";

export const WALL_SPLIT_LABEL: Record<WallSplitKind, string> = {
  diagonalUp: "Diagonal, rising",
  diagonalDown: "Diagonal, falling",
  horizontal: "Horizontal line",
  vertical: "Vertical line",
};

/** Left/right and rising/falling are as seen by someone in the room looking at the wall. The base paint stays below / left of the line. */
export interface WallSplit {
  kind: WallSplitKind;
  /** horizontal: height of the line (m, default 1.2); vertical: distance from the left end as seen from inside (m, default half the wall). */
  at?: number;
  /** The second colour: above the line (horizontal, diagonals) or right of it (vertical). */
  color: string;
}

/** One outside wall's own finish (for example a render panel in a brick room). */
export interface OutsideOverride {
  finish?: WallFinish;
  color?: string;
}

export type FloorFinish =
  | "plain"
  | "oak"
  | "laminate"
  | "tile"
  | "quarry"
  | "stone"
  | "carpet"
  | "vinyl"
  | "concrete"
  | "herringbone"
  | "chevron"
  | "wideoak"
  | "porcelain"
  | "microcement"
  | "terrazzo"
  | "encaustic"
  | "victorian"
  | "hexagon";
/** Labels, in the order the floor finish list shows them. */
export const FLOOR_FINISH_LABEL: Record<FloorFinish, string> = {
  plain: "Plain colour",
  oak: "Oak boards",
  wideoak: "Wide-plank oak",
  herringbone: "Herringbone wood or LVT",
  chevron: "Chevron wood",
  laminate: "Laminate",
  vinyl: "Vinyl",
  carpet: "Carpet",
  tile: "Ceramic tiles",
  porcelain: "Large porcelain tiles",
  hexagon: "Hexagon tiles",
  quarry: "Quarry tiles",
  victorian: "Victorian geometric tiles",
  encaustic: "Patterned encaustic tiles",
  stone: "Stone flags",
  terrazzo: "Terrazzo",
  concrete: "Concrete",
  microcement: "Polished concrete / microcement",
};

export interface Opening {
  id: string;
  /** "bay" projects outward; "garage" is a panelled up-and-over door; "gap" is a full-height opening with no lintel. */
  kind: OpeningKind;
  color?: string;
  /** Centre of the opening, image pixel coordinates. */
  x: number;
  y: number;
  /** "h" means the wall it sits in runs left-right on the plan. */
  orientation: "h" | "v";
  /** Width along the wall, in metres. */
  widthM: number;
  /** Doors: hinge at the other jamb. */
  flipHinge?: boolean;
  /** Doors: swing to the other side of the wall. */
  flipSwing?: boolean;
  /** Windows: sill height above the floor, metres (default 0.9). */
  sill?: number;
  /** Bays: how far the bay projects from the wall, metres (default 0.6). */
  depth?: number;
  /** Head (top) height above the floor, metres (default 2.1 windows, 2.05 doors). */
  head?: number;
  /** Doors, front doors and garage doors: how the leaf looks. Unset: the kind's usual look (see defaultStyle in lib/openings). */
  style?: OpeningStyle;
  /** Windows and bays: how the glazing is divided (default "grid"). */
  glazing?: GlazingPattern;
  /** Windows and bays: the sill outside (default "stone"). */
  sillStyle?: SillStyle;
  /** Windows: colour of the window board inside (default white). */
  boardColor?: string;
  /** Internal doors: colour of the lining and architraves (default white). */
  liningColor?: string;
  /**
   * Doors, front doors, bi-folds and archways: the leaf colour (archway: lining colour) on the back side when
   * it differs from `color`. The front side is the outside for an opening in an external wall, and the local
   * +z side (n = the wall direction turned anticlockwise on the plan) for an internal wall; the back side is the other.
   */
  backColor?: string;
  /** Internal doors and bi-folds: lining and architrave colour on the back side when it differs from `liningColor`. */
  backLiningColor?: string;
  /** Doors, bi-folds and archways: this side's leaf, and its lining unless one is set, take the wall colour of the room it faces (live). */
  matchFront?: boolean;
  matchBack?: boolean;
  /** Frame colour, instead of the house's window and door frame colour (e.g. a white garage-door frame). */
  frameColor?: string;
  /** Swing and French doors: how far the leaves are drawn open in 3D, degrees (default 75, French 80; 0 = shut). */
  openDeg?: number;
  /** Front doors: full-height side lights in the same frame, beside the leaf (unset: none). widthM covers the whole unit. */
  sidelight?: Sidelight;
}

/** Where a front door's full-height side light goes: by the handle, by the hinges, or one each side. */
export type Sidelight = "latch" | "hinge" | "both";
export const SIDELIGHT_LABEL: Record<Sidelight, string> = {
  latch: "Side light by the handle",
  hinge: "Side light by the hinges",
  both: "Side lights both sides",
};

/** Looks for door leaves (doors and front doors). */
export type DoorStyle =
  | "panel"
  | "flush"
  | "glazed"
  | "glazed-15"
  | "six-panel"
  | "half-glazed"
  | "half-glazed-2"
  | "ledged"
  | "front"
  | "strip"
  | "squares"
  | "grooved"
  | "cottage";
export const DOOR_STYLE_LABEL: Record<DoorStyle, string> = {
  panel: "Two shallow panels",
  flush: "Flush",
  glazed: "Fully glazed",
  "glazed-15": "Glazed, 15 panes (3 × 5)",
  "six-panel": "Six-panel",
  "half-glazed": "Half-glazed (obscure top, solid bottom)",
  "half-glazed-2": "Half-glazed, two panes over two panels",
  ledged: "Ledged planks",
  front: "Panelled with a glazed top light",
  strip: "Contemporary, tall glazed strip",
  squares: "Contemporary, three square lights",
  grooved: "Contemporary, horizontal grooves",
  cottage: "Cottage planks with a glazed top",
};
/** Looks for garage doors. */
export type GarageStyle = "panel-grid" | "up-over";
export const GARAGE_STYLE_LABEL: Record<GarageStyle, string> = {
  "panel-grid": "Panel grid (reads as a pair)",
  "up-over": "Up-and-over, raised panels (3 × 2)",
};
export type OpeningStyle = DoorStyle | GarageStyle;

/** How a window's glazing is divided. */
export type GlazingPattern = "grid" | "fixed" | "fixed-top" | "casement-fixed-casement";
export const GLAZING_LABEL: Record<GlazingPattern, string> = {
  grid: "Casements (top lights on tall windows)",
  fixed: "Single fixed pane",
  "fixed-top": "Fixed pane under top light(s)",
  "casement-fixed-casement": "Casement | fixed + top light | casement",
};
/** External window sill: a deep stone or concrete sill, a thin one in the frame colour (uPVC), or none. */
export type SillStyle = "stone" | "upvc" | "none";
export const SILL_STYLE_LABEL: Record<SillStyle, string> = {
  stone: "Stone / concrete",
  upvc: "Thin, frame colour (uPVC)",
  none: "None",
};

export type OpeningKind = "door" | "window" | "bay" | "garage" | "gap" | "patio" | "front" | "french" | "bifold" | "archway";
export const OPENING_KIND_LABEL: Record<OpeningKind, string> = {
  door: "Door (swing, open)",
  front: "Front door (closed, panelled)",
  window: "Window",
  bay: "Bay window",
  garage: "Garage door",
  gap: "Gap (open-plan)",
  patio: "Patio / sliding doors",
  french: "French doors",
  bifold: "Bi-fold doors",
  archway: "Archway (open, lined)",
};

/** A free-standing wall segment not derived from a room outline (nib, partition, garden wall). */
export interface Wall {
  id: string;
  a: Pt;
  b: Pt;
  /** Height in metres; defaults to the ceiling height. */
  height?: number;
  color?: string;
}

/** Fronts of fitted joinery: framed shaker doors, flat slab doors, glazed doors, or open (no doors). */
export type JoineryFront = "shaker" | "slab" | "glass" | "open";
export const JOINERY_FRONT_LABEL: Record<JoineryFront, string> = { shaker: "Shaker doors", slab: "Slab doors", glass: "Glazed doors", open: "Open (no doors)" };
/** Front of a window seat or banquette. */
export type SeatFront = "lid" | "drawers";
export const SEAT_FRONT_LABEL: Record<SeatFront, string> = { lid: "Lift-up lid, panelled front", drawers: "Drawers" };
/** How a built-in or window seat was last sized to the walls; "Refit" runs the same fit again. */
export type JoineryFit = "recess" | "window";

/**
 * Settings of fitted joinery (built-ins, wall boxes, floating-shelf stacks, window seats). All optional: unset
 * falls back to the catalogue item's `joinery`, then to joineryOf's defaults (lib/joinery.ts).
 */
export interface JoineryConfig {
  /** Vertical divisions across the width; unset = about one per 0.6 m (wall boxes: 1). */
  bays?: number;
  /** Built-ins: height of the base cupboards including plinth and top, m; 0 = no base. */
  baseH?: number;
  baseFront?: JoineryFront;
  /** Built-ins: a top (worktop or cap) on the base; its colour is Fixture.worktop. */
  top?: boolean;
  /** Recessed kickboard under built-ins and window seats. */
  plinth?: boolean;
  /** Built-ins: shelves in the upper section. Wall boxes: shelves inside. Floating shelves: boards in the stack. */
  shelves?: number;
  /** Built-ins: the upper section; "open" = open shelves, otherwise doors. */
  upperFront?: JoineryFront;
  /** Built-ins: depth of the upper section, m (unset = full depth). */
  upperD?: number;
  /** Built-ins: top-box height, m (0 or unset = none). */
  topBox?: number;
  /** Wall boxes: their front. */
  front?: JoineryFront;
  /** Carcass and inside colour (unset = the fixture colour). */
  carcass?: string;
  /** Shaker doors: colour of the raised bead round each panel; unset = a shade of the door colour. */
  trim?: string;
  /** Shaker doors: colour of the recessed panel inside the bead; unset = the door colour. */
  panel?: string;
  /** Shelf thickness, m. */
  shelfT?: number;
  seatFront?: SeatFront;
  /** Window seats: back cushions against the wall (a banquette). */
  backCushion?: boolean;
  /** Window seats: cushion colour. */
  cushion?: string;
  fit?: JoineryFit;
}

/** A piece of furniture or a fixture placed on the plan, by catalogue id. */
export interface Fixture {
  id: string;
  /** Catalogue item id (see lib/catalogue.ts). */
  type: string;
  /** Centre in image px. */
  x: number;
  y: number;
  /** Rotation in degrees, clockwise on the plan. Any value; the editor snaps to 15 degree steps. */
  rot: number;
  /** Size overrides in metres (default from the catalogue). */
  w?: number;
  d?: number;
  h?: number;
  /** Height of the base above the floor in metres, for wall-hung items (default from the catalogue). */
  mount?: number;
  /** Seat depth in metres of an L-shaped sofa (corner and chaise sofas): how deep the seating runs are. Default from the sofa's size. */
  seat?: number;
  /** Corner units: the face across the corner, a flat diagonal (default) or a curve. */
  front?: "flat" | "curved";
  /**
   * Corner units: a square end on the back leg (along the wall the back lies on) and on the side leg, metres: the
   * front then starts that far out from the wall instead of at it, so the unit can sit square against a chimney
   * breast or an alcove unit. Unset or 0: the front runs wall to wall.
   */
  endBack?: number;
  endSide?: number;
  /** Pictures: which sample print is in the frame (see lib/art.ts). */
  print?: string;
  /** Rugs: the pattern id (see lib/rugs.ts); unset = plain. */
  rug?: string;
  /** Pictures: the frame style. */
  frame?: "black" | "oak" | "white" | "none";
  color?: string;
  /** Worktop colour of kitchen base units, sink units, runs and islands (default dark grey). */
  worktop?: string;
  /** Optional label shown on the plan. */
  label?: string;
  /** Items sharing a groupId are selected, moved, turned and copied together on the plan (a dining table and its chairs). */
  groupId?: string;
  /** Id of the MyPiece this placement is; its size, colour and label follow the piece. */
  piece?: string;
  /** Selects but can't be moved, resized or reshaped on the plan. */
  locked?: boolean;
  /** Fitted joinery settings (built-ins, window seats, wall boxes, floating-shelf stacks); see lib/joinery.ts. */
  joinery?: JoineryConfig;
  /** Lights (lamps, lit mirrors, ceiling lights): switched on. Absent = on; the Lights master in the sun study still decides whether it is lit (see lib/lights.ts). */
  on?: boolean;
  /**
   * Light switches (Electrics): ids of the light fixtures this switch controls, on any floor of the same model.
   * A light is lit only when every switch that lists it is on (lib/lights.ts fixtureLit). Absent = none.
   * Ids that no longer name a light are pruned by lib/electrics.ts pruneLinks; never rely on them being valid.
   */
  controls?: string[];
  /**
   * Multi-gang switches: the second and later rockers on the plate, in order (gang 2 is index 0), each with the
   * light ids it controls and its own on/off. The first rocker is the fixture's own `controls` and `on`. Read them
   * through lib/electrics.ts `gangOf`, never directly.
   */
  extraGangs?: SwitchGang[];
  /** Ceiling lights: how far the top of the fitting hangs below the ceiling, metres (default from the catalogue; 0 for flush fittings). */
  drop?: number;
  /** Lights: colour temperature in kelvin, 2700 (warm), 3000 (soft) or 4000 (cool). Default from lib/lights.ts. */
  warmth?: LightWarmth;
  /** Lights: dimmer setting, 1-100 percent (absent = 100). */
  dim?: number;
  /** Downlight grids: spacing between downlights, metres (default from the catalogue). */
  pitch?: number;
  /** Downlight grids: downlights across and down, spread evenly over the grid (absent = as many as the spacing fits). */
  cols?: number;
  rows?: number;
}

export type CircuitKind = "lighting" | "ring" | "radial" | "cooker" | "shower" | "ev" | "other";

/**
 * An electrical circuit (Electrics mode): a named group of points. Grouping only; nothing is checked beyond
 * dropping ids that no longer name a fixture (lib/electrics.ts pruneCircuits).
 */
export interface Circuit {
  id: string;
  name: string;
  kind: CircuitKind;
  /** Fixture ids (electrical points and lights) across every floor of the model. A point belongs to at most one circuit. */
  points: string[];
}

/** One rocker of a multi-gang light switch beyond the first (see Fixture.extraGangs). */
export interface SwitchGang {
  /** Ids of the light fixtures this rocker controls. Absent = none. */
  controls?: string[];
  /** Switched on. Absent = on. */
  on?: boolean;
}

/** Light colour temperatures offered, kelvin. */
export type LightWarmth = 2700 | 3000 | 4000;

export interface Floor {
  id: string;
  name: string;
  /** 0 = ground, 1 = first, -1 = basement. */
  level: number;
  /** Source floorplan image (data URL). */
  image: string;
  imageW: number;
  imageH: number;
  /** Image pixels per metre. */
  pxPerM: number;
  /** Pixel point mapped to world (0, 0) before offset. */
  origin: Pt;
  /** Manual nudge in metres so floors stack correctly. */
  offset: { x: number; y: number };
  rooms: Room[];
  openings: Opening[];
  walls?: Wall[];
  fixtures?: Fixture[];
  stairs?: Pt;
  /** Direction the flight rises in, in plan terms. Default "up" (towards the top of the plan). */
  stairsDir?: StairsDir;
  /** Length of the flight along its run, metres. Default 2.6. */
  stairsLen?: number;
  /** Width of the flight, metres. Default 0.9. */
  stairsWidth?: number;
  /** Winders at the foot turning the bottom steps a quarter turn, entered from this side (facing up the flight). Default straight. */
  stairsTurn?: "left" | "right";
  /** Winders at the head turning the top steps a quarter turn onto the landing, towards this side (facing up the flight). Default straight. */
  stairsTopTurn?: "left" | "right";
  /** Number of winders in a turned head (2 or 3). Default 2. */
  stairsTopWinders?: 2 | 3;
  /** Covered outdoor areas (porch, carport): polygons in image px, roofed at this floor's ceiling. */
  canopies?: Pt[][];
}

export type StairsDir = "up" | "down" | "left" | "right";
export const STAIRS_DIR_LABEL: Record<StairsDir, string> = {
  up: "Rises towards the top of the plan",
  down: "Rises towards the bottom of the plan",
  left: "Rises towards the left",
  right: "Rises towards the right",
};

export interface Exterior {
  showRoof: boolean;
  /** "hip" slopes the roof down at its ends; "gable" has vertical gable walls. */
  roofStyle: "gable" | "hip";
  /**
   * Side of the plan where the house joins its neighbour (semi-detached or
   * terraced). The roof stops flush with no overhang at that end.
   */
  partyWall: "none" | "left" | "right" | "both";
  /** Ridge direction for gable roofs; "auto" follows the longer side. x = left-right on the plan. */
  ridgeAxis: "auto" | "x" | "z";
  pitchDeg: number;
  overhang: number;
  /**
   * Whether rooms tagged with a roofGroup share the main roof or get a separate
   * lower one. With "continue", one set back from the house's walls still gets
   * its own roof (it cannot share), at the same pitch.
   */
  extensionRoof: "continue" | "separate";
  roofColor: string;
  wallColor: string;
  trimColor: string;
  /** Colour of the front door (kind "front") unless the door sets its own. Unset: the usual red. */
  frontDoorColor?: string;
  /** Colour of the other outside doors (swing doors in an outside wall) unless a door sets its own. Unset: the usual oak. */
  backDoorColor?: string;
  /** Default finish for external walls (rooms can override). */
  wallFinish?: WallFinish;
  /** Roof covering on pitched roofs, tinted by roofColor. */
  tileStyle?: TileStyle;
  /** Fascia, soffit and bargeboard colour: white uPVC or the window frame colour. Gutters match. */
  fascia?: "white" | "trim";
  /** Draw gutters along the eaves and downpipes. */
  gutters?: boolean;
  /** How far a separate extension roof's ridge sits at least below the main ridge, metres (its pitch eases to get there). */
  extensionDrop?: number;
  /** Roof over porch canopies: flat, or a tiled lean-to falling away from the wall. */
  canopyRoof?: "flat" | "lean-to";
  chimneys?: Chimney[];
  /**
   * A tiled pitched skirt around the outside edges of flat roofs that face
   * these sides (front = bottom of the plan), hipped where two meet; the
   * roof behind stays flat. A common way to dress a single-storey extension.
   */
  flatRoofSkirt?: FlatRoofSkirt;
  /**
   * Where the rainwater downpipes come down, as points beside the walls in
   * world metres (x to the right, y towards the front, like chimneys). Each
   * goes on the nearest wall under a pitched roof's eaves gutter (a long side
   * or a hip end), or under a plain flat-roof edge, within a metre. Unset: the
   * pitched roofs get one at a corner of each eaves automatically. Downpipes
   * of a flat roof skirt and of lean-tos stay automatic either way.
   */
  downpipes?: WallSpot[];
  /**
   * Soil and vent stacks up an outside wall: each stands against the nearest
   * two-storey wall face and rises from the roof or ground below, through the
   * eaves above, to a vent terminal just clear of the tiles.
   */
  soilPipes?: WallSpot[];
}

/** A point beside an outside wall, world metres: x to the right, y towards the front. */
export interface WallSpot {
  x: number;
  y: number;
}

export type PlanSide = "front" | "rear" | "left" | "right";
export interface FlatRoofSkirt {
  sides: PlanSide[];
  /** Horizontal depth of the tiled slope from the eaves, metres. */
  depth: number;
  pitchDeg: number;
  /**
   * How far the skirt turns an outside corner onto a side not in `sides`,
   * metres from the corner, ending there in a cheek. A front skirt is often
   * returned only a short way down the sides. Unset or 0: no returns.
   */
  returns?: number;
  /**
   * How far the skirt's eaves (where the tiles start, the top of its fascia)
   * sit below the flat roof's deck, metres, down to the tops of the walls at
   * most. Its gutter, fascia and soffit come down with them, and a porch
   * ceiling under the same roof, so the whole slope sits lower on the walls.
   * Unset or 0: the eaves are level with the deck.
   */
  drop?: number;
}

export type TileStyle = "plain" | "concrete" | "slate";
export const TILE_STYLE_LABEL: Record<TileStyle, string> = {
  plain: "Plain clay tiles",
  concrete: "Concrete interlocking tiles",
  slate: "Natural slate",
};

/** A chimney stack. Position is in world metres like Site points: x to the right, y towards the front. */
export interface Chimney {
  id: string;
  x: number;
  y: number;
  /** Footprint along x and along y, metres. */
  w: number;
  d: number;
  /** Height of the top of the stack above the ridge of the roof it rises through, metres. */
  height: number;
  pots: number;
}

export const DEFAULT_EXTERIOR: Exterior = {
  showRoof: true,
  roofStyle: "gable",
  partyWall: "none",
  ridgeAxis: "auto",
  pitchDeg: 35,
  overhang: 0.35,
  extensionRoof: "continue",
  roofColor: "#7a4a3a",
  wallColor: "#efe9d8",
  trimColor: "#4a2e1e",
  tileStyle: "plain",
  fascia: "white",
  gutters: true,
  extensionDrop: 0.3,
  canopyRoof: "flat",
  chimneys: [],
};

export interface HouseModel {
  floors: Floor[];
  /** Floor-to-ceiling height in metres. */
  ceilingHeight: number;
  /** Structural slab thickness between floors, metres. */
  slabThickness: number;
  exterior?: Exterior;
  /** Set on built-in models so the app can offer an update when the tracing improves. */
  preset?: { id: string; version: number };
  /**
   * A design started from a built-in house (`id`, as in `preset`): the version of it the design was copied
   * from or last brought up to date with (see lib/layoutMerge.ts). Not a built-in itself, so never replaced.
   */
  basedOn?: { id: string; version: number };
  /** Total floor area printed on the listing's floorplan (m²), to check the tracing against. */
  listedArea?: number;
  /** Electrical circuits (Electrics mode). Absent = none; the wiring guide's circuit column is then blank. */
  circuits?: Circuit[];
}

/** A point in world metres on the plan: x to the right, y towards the front (bottom of the plan). */
export interface WPt {
  x: number;
  y: number;
}

/** Plot, neighbours and orientation. Each variant has its own (see lib/sites.ts). World frame = the model's world metres. */
export interface Site {
  /**
   * Set on the built-in plot for the listing, and kept when the plot is edited. It lets the app offer a newer
   * version of the built-in plot. Absent on plots drawn or generated by the user.
   */
  preset?: { id: string; version: number };
  /** Compass bearing in degrees that the front of the house (the bottom of the plan) faces. 180 = due south. */
  frontBearing: number;
  latitude: number;
  longitude: number;
  /** Plot boundary polygon, world metres. */
  boundary: WPt[];
  /** Treatment of each boundary edge; edge i runs from boundary[i] to boundary[i + 1]. */
  boundaryEdges?: BoundaryEdge[];
  neighbours: Neighbour[];
  surfaces: SiteSurface[];
  /**
   * Garden furniture, structures, lights and plants, edited in Garden mode
   * (see lib/gardenCatalogue.ts and lib/siteItems.ts). Absent on plots saved
   * before the garden was modelled: read it as an empty list.
   */
  items?: GardenItem[];
}

/**
 * A garden item or plant placed on the plot, by garden catalogue id. World
 * metres like the rest of the Site (x right, y towards the street). It stands
 * on whatever surface is under its centre (lib/siteItems.ts groundHeightAt).
 */
export interface GardenItem {
  id: string;
  /** Garden catalogue id (lib/gardenCatalogue.ts GARDEN_ITEMS). */
  type: string;
  /** Centre of the footprint, world metres; for a run (`to` set), its first end. */
  x: number;
  y: number;
  /** Rotation in degrees, clockwise on the plan; the editor snaps to 15 degree steps. Ignored for runs. */
  rot: number;
  /** Size overrides in metres (default from the catalogue). Plants: w = d = canopy spread, h = height. */
  w?: number;
  d?: number;
  h?: number;
  /** Height of the base above the ground under it, metres, for wall-hung items (default from the catalogue). */
  mount?: number;
  /** Runs only (festoon lights, stepping stones, hedge, bamboo screen, climber): the second end, world metres. */
  to?: WPt;
  /** Festoon lights: height of the second end above the ground (the first end is `h`). Default the same as `h`. */
  toH?: number;
  /** Festoon lights: how far the string sags below the straight line at mid-span, metres (default 0.3). */
  sag?: number;
  /** Dining and lounge sets: number of chairs (default from the catalogue). */
  seats?: number;
  /** Main colour override (frame, body, foliage). */
  color?: string;
  /** Second colour override (parasol canopy, cushions, flowers). */
  accent?: string;
  /** Plants: a number that varies the procedural shape, so two of a kind differ. Default from the id. */
  seed?: number;
}

export interface BoundaryEdge {
  kind: "fence" | "wall" | "hedge" | "open";
  /** Height in metres. */
  height: number;
  /** Walls only: the finish on top. Default "coping" (grey concrete); "brick" is a course of bricks on edge. */
  top?: "coping" | "brick";
  /** Walls only: brick piers about every 3 m. Default true. */
  piers?: boolean;
  /**
   * Openings only: how the ends of the walls beside the gap are finished.
   * Default "plain" (the cut brickwork); "pier" caps each wall end with a brick pier.
   */
  endFinish?: "plain" | "pier";
  /**
   * Walls and fences: how the top meets sloping ground beside it (see lib/wallSteps.ts).
   * "level" keeps one level top; "step" steps it in whole brick courses; "rake"
   * slopes it with the ground. Default: "step" for a wall beside sloping ground,
   * otherwise "level".
   */
  follow?: WallFollow;
  /**
   * Stepped walls and fences only: length of each level run between steps,
   * metres, from the lower end. Absent: a step wherever the ground has
   * climbed another brick course, at least 0.9 m apart.
   */
  stepEvery?: number;
  /**
   * Walls only: a row or two of pierced concrete screen blocks (290 mm square) let into the top of the wall
   * under its top course, see-through, as 1960s garden walls have (see lib/screenBlocks.ts).
   */
  screen?: ScreenPanel;
}

export type WallFollow = "level" | "step" | "rake";

/** A panel of pierced screen blocks in a wall's top. `from` and `length` are metres along the edge from its start; left out, the blocks run the whole edge. */
export interface ScreenPanel {
  rows: 1 | 2;
  from?: number;
  length?: number;
}

/** A neighbouring building block (or outbuilding), drawn as simple massing. */
export interface Neighbour {
  id: string;
  name: string;
  /** Footprint polygon, world metres. Rectangles give the best roofs. */
  polygon: WPt[];
  /** Height of the eaves (wall top) above the ground, metres. */
  eaves: number;
  roof: "hip" | "gable" | "flat";
  pitchDeg?: number;
  /** Eaves overhang of a pitched roof, metres (default 0.35); an attached neighbour's matches the house's so the gutter line carries on. */
  overhang?: number;
  ridgeAxis?: "auto" | "x" | "z";
  /** Side of the footprint that is a party wall (roof stops flush there). */
  partySide?: "none" | "left" | "right";
  color?: string;
  roofColor?: string;
}

export type SurfaceKind = "lawn" | "patio" | "drive" | "path" | "bed" | "pavement" | "road";
export const SURFACE_LABEL: Record<SurfaceKind, string> = {
  lawn: "Lawn",
  patio: "Patio",
  drive: "Driveway",
  path: "Path",
  bed: "Planting bed",
  pavement: "Pavement",
  road: "Road",
};

/** Which way a sloping surface climbs: back is away from the street (-y in plan), front towards it. */
export type SlopeToward = "back" | "front" | "left" | "right";
export const SLOPE_TOWARD_LABEL: Record<SlopeToward, string> = {
  back: "the back of the plot",
  front: "the street",
  left: "the left",
  right: "the right",
};

/**
 * A planar ramp across a surface: heights are metres above the ground. The
 * surface is `base` high at its lowest edge (along the direction of climb) and
 * `base + rise` at its highest, so a drive that meets a door sill is a rise of
 * a little under the step up to the floor. A zero rise with a base is a flat,
 * raised surface.
 */
export interface SurfaceSlope {
  toward: SlopeToward;
  rise: number;
  base?: number;
}

/** The edging round a lawn or bed (see lib/gardenCatalogue.ts KERBS for sizes, colours and labels). */
/** One edge of a garden surface drawn as another surface's edge (SiteSurface.links). */
export interface EdgeLink {
  edge: number;
  surface: string;
  theirEdge: number;
  reversed: boolean;
}

/** A lawn's or bed's edging; "paving" is reclaimed block pavers (the patio's) laid in courses like bricks. */
export type KerbStyle = "brick" | "paving" | "sleeper" | "corten" | "render" | "none";

/**
 * What a hard surface (drive, patio, path, pavement) is laid with. Left out, it
 * looks as it always has: block paving on a drive, slabs on a patio and so on.
 */
export type SurfaceFinish = "tarmac" | "block-mixed" | "block-weathered" | "slabs" | "gravel";
export const SURFACE_FINISH_LABEL: Record<SurfaceFinish, string> = {
  tarmac: "Tarmac (asphalt)",
  "block-mixed": "Block paving, red and grey mixed",
  "block-weathered": "Block paving, weathered dark grey and red",
  slabs: "Paving slabs",
  gravel: "Gravel",
};

export interface SiteSurface {
  id: string;
  kind: SurfaceKind;
  polygon: WPt[];
  /** Absent: the usual look of this kind of surface (see lib/surfaceFinish.ts). */
  finish?: SurfaceFinish;
  /** Absent: flat at ground level. */
  slope?: SurfaceSlope;
  /**
   * Draw the outline as a closed smooth curve through the polygon's points
   * (lib/surfaceCurve.ts surfaceOutline); the points stay the control points
   * the editor drags. Default false: straight edges.
   */
  smooth?: boolean;
  /**
   * Edges drawn as curves when `smooth` is off: edge i runs from polygon[i] to polygon[i + 1]. Kept in step
   * with the polygon by lib/surfaceCurve.ts when corners are added or removed. Absent: none.
   */
  curves?: number[];
  /**
   * Edges that follow another surface's edge, so two surfaces that meet along a curve share one drawing of
   * it: edge `edge` of this surface is drawn as edge `theirEdge` of surface `surface` (reversed when the two
   * run opposite ways, as neighbours wound the same way do). The corners at its ends come from the other
   * surface too. See lib/surfaceCurve.ts.
   */
  links?: EdgeLink[];
  /**
   * Lawns and beds: the edging. Absent: "brick" round a raised bed (slope.base > 0), as before, otherwise
   * "none" (lib/gardenCatalogue.ts kerbOf).
   */
  kerb?: KerbStyle;
  /** How far the kerb stands above the surface's own top at its edge, metres. Absent: the style's default. */
  kerbHeight?: number;
}

export interface Photo {
  id: string;
  name: string;
  dataUrl: string;
  /** Assigned location, by floor name + room name so it survives re-extraction. */
  floorName?: string;
  roomName?: string;
  /** For exterior photos: which side of the house they show. front = bottom of the plan. */
  elevation?: Elevation;
  description?: string;
  confidence?: number;
}

export type Elevation = "front" | "rear" | "left" | "right";
export const ELEVATION_LABEL: Record<Elevation, string> = {
  front: "Front (bottom of plan)",
  rear: "Rear (top of plan)",
  left: "Left side",
  right: "Right side",
};

export type VariantKey = "current" | "proposed";

export const VARIANT_LABEL: Record<VariantKey, string> = {
  current: "As listed",
  proposed: "Proposed",
};

export const uid = () => Math.random().toString(36).slice(2, 10);

/** A piece of furniture the owner already has, measured; placed as fixtures with `piece` set. */
export interface MyPiece {
  id: string;
  name: string;
  /** Catalogue id it draws as. */
  kind: string;
  w: number;
  d: number;
  h: number;
  color?: string;
  note?: string;
}

/** A named 3D camera view, shared by both layouts (project-level, synced). */
export interface SavedView {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  /** Floor cap when saved; null/absent = all floors. */
  maxLevel?: number | null;
}
