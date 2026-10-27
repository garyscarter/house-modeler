import { memo, useMemo } from "react";
import type { CatalogueItem } from "../../../lib/catalogue";
import type { IconName } from "../../../components/icons";
import { Info } from "../../../components/Info";
import { editsFixtures, PLAN_TOOLS, type Mode, type Tool } from "../../../lib/modes";
import { imageForState, imageStateOf, type ImageState } from "../../../lib/planMath";
import { TOOL_KEY, TOOL_LABEL } from "../../../lib/shortcuts";
import { useStore } from "../../../store";
import { useChassis } from "../../../components/useChassis";
import { toolAllowed } from "../../../lib/chassis";
import { AddPopover } from "../../AddItem";
import { ToolRail, type RailItem } from "../../ToolRail";
import { IMAGE_STATES } from "../useKeys";
import { IMAGE_STATE_LABEL, ImageOptions } from "./ImageOptions";
import { selectHintFor } from "./PlanStatus";

/**
 * The tool rail: only the tools the mode offers, grouped, with the image controls last. Memoised on what it shows,
 * so the many re-renders of a drag do not rebuild its buttons.
 */
export const PlanRail = memo(function PlanRail({
  mode,
  tool,
  addOpen,
  onAddOpen,
  activeId,
  onPick,
  onStartPlacing,
  clipboardCount,
  pasteLabel,
  onPaste,
}: {
  mode: Mode;
  tool: Tool;
  addOpen: boolean;
  onAddOpen: (open: boolean) => void;
  activeId: string | undefined;
  onPick: (t: Tool) => void;
  onStartPlacing: (item: CatalogueItem) => void;
  clipboardCount: number;
  pasteLabel: string;
  onPaste: () => void;
}) {
  const planImage = useStore((s) => s.planImage);
  const wallsOn = useStore((s) => s.planWalls);
  const setUi = useStore((s) => s.setUi);
  const imageState = imageStateOf(planImage);
  const imgOpacity = Math.min(1, Math.max(0.1, planImage.opacity));
  const setImageState = (st: ImageState) => setUi({ planImage: imageForState(st, planImage.opacity) });
  const fixtureMode = editsFixtures(mode);
  const electrics = mode === "electrics";
  const chassis = useChassis((s) => s.chassis);
  const groups = useMemo(() => {
    const has = (t: Tool) => PLAN_TOOLS[mode].includes(t) && toolAllowed(chassis, t);
    const toolItems = (list: [Tool, IconName][]): RailItem[] =>
      list.filter(([t]) => has(t)).map(([t, icon]) => ({ id: t, icon, label: TOOL_LABEL[t], shortcut: TOOL_KEY[t], active: tool === t, onClick: () => onPick(t) }));
    const cycleImage = () => setImageState(IMAGE_STATES[(IMAGE_STATES.indexOf(imageState) + 1) % IMAGE_STATES.length]);
    const out: RailItem[][] = [
      fixtureMode
        ? [
            {
              id: "add",
              icon: "plus",
              label: electrics ? "Add point" : "Add furniture",
              shortcut: "A",
              active: addOpen,
              onClick: () => onAddOpen(!addOpen),
              extra: <AddPopover scope={electrics ? "electrics" : "furnish"} activeId={activeId} onPick={onStartPlacing} open={addOpen} onOpenChange={onAddOpen} />,
            },
            ...(clipboardCount ? [{ id: "paste", icon: "paste" as const, label: pasteLabel, shortcut: "Ctrl V", onClick: onPaste }] : []),
          ]
        : [],
      toolItems([["select", "select"]]),
      toolItems([["rect", "rect"], ["room", "polygon"], ["wall", "wall"], ["canopy", "canopy"]]),
      toolItems([["door", "door"], ["window", "window"], ["gap", "gap"]]),
      toolItems([["measure", "measure"]]),
      [
        {
          id: "image",
          icon: "image",
          label: `Floorplan image: ${IMAGE_STATE_LABEL[imageState]}`,
          shortcut: "I",
          toggle: true,
          active: planImage.show,
          onClick: cycleImage,
          extra: (
            <ImageOptions
              imageState={imageState}
              opacity={imgOpacity}
              wallsOn={wallsOn}
              onState={setImageState}
              onOpacity={(opacity) => setUi({ planImage: { show: true, opacity } })}
              onWalls={() => setUi({ planWalls: !wallsOn })}
            />
          ),
        },
      ],
    ];
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chassis, tool, addOpen, activeId, clipboardCount, pasteLabel, imageState, imgOpacity, planImage.show, planImage.opacity, wallsOn]);
  const touch = useChassis((s) => s.touch);
  const footer = useMemo(() => <Info label="How this works">{selectHintFor(mode, touch)}</Info>, [mode, touch]);
  return <ToolRail groups={groups} footer={footer} />;
});
