import { GAME_CONSTANTS } from '@shared/index';
import { CageContent, Gadget, HangingCage, SourceGadget } from './engine-types';
import type { GameEngine } from './game-engine';
import { Box, Point } from './boulder-puzzle';
import { LevelLayout } from './level-generator';
import { flightPath, isLauncher, isSource, launchVelocity } from './gadgets';
import {
  EditorEdge,
  EditorRef,
  EditorTool,
  EditorField,
  EditorFieldKey,
  clearLayout,
  edgeAt,
  editableLayout,
  exportLayout,
  followExit,
  gadgetOf,
  hasWayOut,
  itemAt,
  itemBox,
  allRefs,
  moveTo,
  parseLayout,
  placeAt,
  refLabel,
  removeItem,
  resizeTo,
  sameRef,
  fieldsOf,
  setField,
  sourceOf,
  targetLabel,
  toggleWire,
  wireTargetId,
} from './level-editor';

/** Ticks of a launcher's aim the editor draws (where a boulder it throws goes). */
const AIM_TICKS: number = 160;

/** One thing outlined on the map while the editor is open. */
export interface EditorOverlayItem {
  box: Box;
  ref: EditorRef;
  selected: boolean;
  hovered: boolean;
  /** Wired to the selected source (the link tool shows what it drives). */
  linked: boolean;
}

/** A spring's or slingshot's aim: where a boulder it throws flies. */
export interface EditorAim {
  points: Point[];
  label: string;
}

/** What the editor draws over the map this frame (`drawLevelEditor`). */
export interface EditorOverlay {
  items: EditorOverlayItem[];
  /** What a click would place, where the pointer is (null for select, erase and link). */
  ghost: Box | null;
  /** The selection's name, drawn over it. */
  selectedLabel: string | null;
  /** The pointer over a side that resizes (drawn as a handle). */
  hoverEdge: { box: Box; edge: EditorEdge } | null;
  /** Erase tool: the thing a click would take away. */
  erasing: boolean;
  aims: EditorAim[];
}

/** A wire from the selected source, for the bar (click to take it away). */
export interface EditorWireView {
  targetId: string;
  label: string;
}

/** What the bar shows on a selected gadget. */
export interface EditorGadgetView {
  id: string;
  kind: Gadget['kind'];
  /** A source's wires (null for the other kinds). */
  wires: EditorWireView[] | null;
}

/** The middle-click popup: the thing clicked, where (page px), and what can be adjusted on it. */
export interface EditorInspector {
  label: string;
  clientX: number;
  clientY: number;
  fields: EditorField[];
}

/** What the editor bar shows about the selection. */
export interface EditorSelection {
  label: string;
  box: Box;
  /** A cage: what it hides (the bar lets you change it). */
  cageContent: CageContent | null;
  gadget: EditorGadgetView | null;
  /** What can be adjusted on it (size, strength, weight...). */
  fields: EditorField[];
}

interface EditorDrag {
  ref: EditorRef;
  edge: EditorEdge | null;
  /** Pointer offset from the box's top-left when grabbed. */
  dx: number;
  dy: number;
  /** The undo step this press belongs to. */
  tag: string;
}

function gadgetView(layout: LevelLayout, g: Gadget): EditorGadgetView {
  const source: SourceGadget | null = isSource(g) ? g : null;
  return {
    id: g.id,
    kind: g.kind,
    wires: source
      ? source.targets.map(
          (targetId: string): EditorWireView => ({
            targetId,
            label: targetLabel(layout, targetId),
          }),
        )
      : null,
  };
}

/**
 * Dev level editor in the engine (solo only: guests build floors from the host's seed, so a
 * designed layout would split the world). Holds the layout being designed for the current floor,
 * the tool and the selection; every change is played at once through `GameEngine.useCustomLevel`.
 */
export class LevelEditorSystem {
  active: boolean = false;
  tool: EditorTool = 'select';
  selected: EditorRef | null = null;
  /** Called after every change: the bar re-reads the selection; `layoutChanged` when the design itself changed (the draft is saved). */
  onChange: ((layoutChanged: boolean) => void) | null = null;
  private layout: LevelLayout | null = null;
  private pointer: Point | null = null;
  private drag: EditorDrag | null = null;
  /** Designs to go back to (oldest first) and forward to again; the design as last recorded. */
  private undoStack: LevelLayout[] = [];
  private redoStack: LevelLayout[] = [];
  private committed: LevelLayout | null = null;
  /** The last step's tag: a step with the same tag right after joins it (a drag, a slider). */
  private lastTag: string | null = null;
  /** Presses on the map so far (each press is its own step). */
  private presses: number = 0;
  /** Where the middle-click popup opened (page px), while it is open on the selection. */
  private inspectAt: { clientX: number; clientY: number } | null = null;

  constructor(private readonly e: GameEngine) {}

  /** Solo only. */
  canEdit(): boolean {
    return !this.e.isMultiplayerHost && !this.e.isMultiplayerClient;
  }

  open(): void {
    if (!this.canEdit()) return;
    this.active = true;
    this.current();
    this.notify();
  }

  close(): void {
    this.active = false;
    this.drag = null;
    this.pointer = null;
    this.inspectAt = null;
    this.notify();
  }

  isDragging(): boolean {
    return this.drag !== null;
  }

  setTool(tool: EditorTool): void {
    this.tool = tool;
    this.drag = null;
    // Wiring starts from a source: anything else selected is let go.
    if (tool === 'link' && this.layout && !sourceOf(this.layout, this.selected))
      this.selected = null;
    this.notify();
  }

  /** Left button down on the map: select and grab, erase, wire, or place (and grab what was placed). */
  pointerDown(x: number, y: number): void {
    const layout: LevelLayout | null = this.current();
    if (!layout) return;
    this.pointer = { x, y };
    this.inspectAt = null;
    if (this.tool === 'erase') {
      this.eraseAt(x, y);
      return;
    }
    if (this.tool === 'link') {
      this.linkAt(layout, x, y);
      return;
    }
    const ref: EditorRef | null =
      this.tool === 'select' ? itemAt(layout, x, y) : placeAt(layout, this.tool, x, y);
    this.selected = ref;
    const box: Box | null = ref ? itemBox(layout, ref) : null;
    // Placing and dragging what was placed (or one drag) is one step to undo.
    const tag: string = `press:${++this.presses}`;
    this.drag =
      ref && box
        ? {
            ref,
            edge: this.tool === 'select' ? edgeAt(layout, ref, x, y) : null,
            dx: x - box.x,
            dy: y - box.y,
            tag,
          }
        : null;
    if (this.tool === 'select') this.notify();
    else this.play(tag);
  }

  /** Pointer moved over the map (pressed or not): drags the grabbed thing. */
  pointerMove(x: number, y: number): void {
    this.pointer = { x, y };
    const layout: LevelLayout | null = this.layout;
    const drag: EditorDrag | null = this.drag;
    if (!layout || !drag) return;
    if (drag.edge) resizeTo(layout, drag.ref, drag.edge, x, y);
    else moveTo(layout, drag.ref, x - drag.dx, y - drag.dy);
    this.play(drag.tag);
  }

  pointerUp(): void {
    if (!this.drag) return;
    this.drag = null;
    this.notify();
  }

  /** Right button (or the erase tool): takes away the thing under (x, y). */
  eraseAt(x: number, y: number): void {
    const layout: LevelLayout | null = this.current();
    const ref: EditorRef | null = layout ? itemAt(layout, x, y) : null;
    if (ref) this.remove(ref);
  }

  removeSelected(): void {
    if (this.selected) this.remove(this.selected);
  }

  setCageContent(content: CageContent): void {
    const ref: EditorRef | null = this.selected;
    if (!this.layout || !ref || (ref.kind !== 'cage' && ref.kind !== 'cleat')) return;
    const cage: HangingCage | undefined = this.layout.cagePuzzle?.cages[ref.index];
    if (!cage) return;
    cage.content = content;
    this.play();
  }

  /**
   * Middle click on the map: selects the thing under (x, y) and opens its popup at the click
   * (page px) to adjust it; on empty map it closes the popup.
   */
  inspect(x: number, y: number, clientX: number, clientY: number): void {
    const layout: LevelLayout | null = this.current();
    if (!layout) return;
    this.drag = null;
    this.selected = itemAt(layout, x, y);
    this.inspectAt = this.selected ? { clientX, clientY } : null;
    this.notify();
  }

  closeInspector(): void {
    this.inspectAt = null;
    this.notify();
  }

  /** The middle-click popup, or null when it is closed. */
  inspector(): EditorInspector | null {
    const layout: LevelLayout | null = this.layout;
    const ref: EditorRef | null = this.selected;
    if (!layout || !ref || !this.inspectAt || !itemBox(layout, ref)) return null;
    return { label: refLabel(layout, ref), ...this.inspectAt, fields: fieldsOf(layout, ref) };
  }

  /** Adjusts one of the selection's fields (size, strength, weight...) and plays it at once. */
  setField(key: EditorFieldKey, value: number): void {
    if (!this.layout || !this.selected) return;
    setField(this.layout, this.selected, key, value);
    // A slider dragged through many values is one step to undo.
    this.play(`field:${JSON.stringify(this.selected)}:${key}`);
  }

  /** Takes away the selected source's wire to this target. */
  unwire(targetId: string): void {
    const source: SourceGadget | null = this.layout ? sourceOf(this.layout, this.selected) : null;
    if (!source || !source.targets.includes(targetId)) return;
    toggleWire(source, targetId);
    this.play();
  }

  /** The designer's explanation kept with the layout. */
  notes(): string {
    return this.current()?.notes ?? '';
  }

  setNotes(text: string): void {
    const layout: LevelLayout | null = this.current();
    if (!layout) return;
    if (text.length > 0) layout.notes = text;
    else delete layout.notes;
    this.commit('notes');
    // Words change nothing in play: no rebuild, only the draft.
    this.notify(true);
  }

  selection(): EditorSelection | null {
    const layout: LevelLayout | null = this.layout;
    const ref: EditorRef | null = this.selected;
    const box: Box | null = layout && ref ? itemBox(layout, ref) : null;
    if (!layout || !ref || !box) return null;
    const cage: boolean = ref.kind === 'cage' || ref.kind === 'cleat';
    const g: Gadget | null = gadgetOf(layout, ref);
    return {
      label: refLabel(layout, ref),
      box: {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
      cageContent:
        cage && 'index' in ref ? (layout.cagePuzzle?.cages[ref.index]?.content ?? null) : null,
      gadget: g ? gadgetView(layout, g) : null,
      fields: fieldsOf(layout, ref),
    };
  }

  /** Everything but the exit goes. */
  clear(): void {
    const layout: LevelLayout | null = this.current();
    if (!layout) return;
    clearLayout(layout);
    this.selected = null;
    this.play();
  }

  /** Back to this floor's generated layout (the design is dropped). */
  resetToGenerated(): void {
    if (!this.canEdit()) return;
    this.e.useCustomLevel(null);
    this.layout = editableLayout(this.e.level, this.e.exitPlatform.y);
    this.selected = null;
    this.commit(null);
    this.notify(true);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Ctrl+Z: the design as it was one step back (up to DEV_EDITOR_HISTORY_STEPS). */
  undo(): void {
    this.travel(this.undoStack, this.redoStack);
  }

  /** Ctrl+Shift+Z: the step undone last, again. */
  redo(): void {
    this.travel(this.redoStack, this.undoStack);
  }

  /** Players have a way off the designed floor (the hanging exit, or an exit door). */
  hasWayOut(): boolean {
    const layout: LevelLayout | null = this.layout;
    return !layout || hasWayOut(layout);
  }

  exportJson(): string {
    const layout: LevelLayout | null = this.current();
    return layout ? exportLayout(layout) : '';
  }

  /** Plays an exported layout on the current floor. Returns the error, or null when it was applied. */
  importJson(text: string): string | null {
    if (!this.canEdit()) return 'Solo only';
    const parsed: LevelLayout | { error: string } = parseLayout(text);
    if ('error' in parsed) return parsed.error;
    this.layout = { ...parsed, floor: this.e.floor };
    this.selected = null;
    this.play();
    return null;
  }

  overlay(): EditorOverlay {
    const layout: LevelLayout | null = this.layout;
    const empty: EditorOverlay = {
      items: [],
      ghost: null,
      selectedLabel: null,
      hoverEdge: null,
      erasing: false,
      aims: [],
    };
    if (!layout || layout.floor !== this.e.floor) return empty;
    const p: Point | null = this.pointer;
    const hovered: EditorRef | null = p && !this.drag ? itemAt(layout, p.x, p.y) : null;
    const showHover: boolean =
      this.tool === 'select' || this.tool === 'erase' || this.tool === 'link';
    const source: SourceGadget | null = sourceOf(layout, this.selected);
    const items: EditorOverlayItem[] = [];
    for (const ref of allRefs(layout)) {
      const box: Box | null = itemBox(layout, ref);
      if (!box) continue;
      const target: string | null = wireTargetId(layout, ref);
      items.push({
        box,
        ref,
        selected: sameRef(ref, this.selected),
        hovered: showHover && sameRef(ref, hovered),
        linked: source !== null && target !== null && source.targets.includes(target),
      });
    }
    const hoverBox: Box | null =
      hovered && this.tool === 'select' ? itemBox(layout, hovered) : null;
    const edge: EditorEdge | null =
      hovered && hoverBox && p ? edgeAt(layout, hovered, p.x, p.y) : null;
    return {
      items,
      ghost: p && !this.drag ? this.ghostAt(layout, p) : null,
      selectedLabel: this.selected ? refLabel(layout, this.selected) : null,
      hoverEdge: hoverBox && edge ? { box: hoverBox, edge } : null,
      erasing: this.tool === 'erase',
      aims: this.aims(layout),
    };
  }

  /** Every launcher's aim: a boulder's flight from its top at its launch speed. */
  private aims(layout: LevelLayout): EditorAim[] {
    const aims: EditorAim[] = [];
    for (const g of layout.gadgets ?? []) {
      if (!isLauncher(g)) continue;
      const { vx, vy }: { vx: number; vy: number } = launchVelocity(g);
      const start: Point = {
        x: g.x + g.width / 2,
        y: g.y - GAME_CONSTANTS.BOULDER_SIZE_PX / 2,
      };
      const label: string = g.kind === 'spring' ? `${g.power}` : `${g.power} at ${g.angle}`;
      aims.push({ points: flightPath(start, vx, vy, AIM_TICKS, GAME_CONSTANTS.GROUND_Y), label });
    }
    return aims;
  }

  /**
   * The link tool: a click on a source (button, scale, lever) picks it; then a click on a target
   * (spring, slingshot, door, the exit) wires it to the source, or takes that wire away.
   */
  private linkAt(layout: LevelLayout, x: number, y: number): void {
    const ref: EditorRef | null = itemAt(layout, x, y);
    if (sourceOf(layout, ref)) {
      this.selected = ref;
      this.notify();
      return;
    }
    const source: SourceGadget | null = sourceOf(layout, this.selected);
    const target: string | null = wireTargetId(layout, ref);
    if (source && target) {
      toggleWire(source, target);
      this.play();
      return;
    }
    this.selected = null;
    this.notify();
  }

  /** The box `tool` would place at the pointer, tried on a copy of the layout. */
  private ghostAt(layout: LevelLayout, p: Point): Box | null {
    if (this.tool === 'select' || this.tool === 'erase' || this.tool === 'link') return null;
    const trial: LevelLayout = structuredClone(layout);
    const ref: EditorRef | null = placeAt(trial, this.tool, p.x, p.y);
    return ref ? itemBox(trial, ref) : null;
  }

  private remove(ref: EditorRef): void {
    const layout: LevelLayout | null = this.layout;
    if (!layout) return;
    removeItem(layout, ref);
    // Indexes behind the removed one moved: drop the selection rather than point at a neighbour.
    this.selected = null;
    this.drag = null;
    this.inspectAt = null;
    this.play();
  }

  /** The layout of the floor being played (taken afresh when the floor changed). */
  private current(): LevelLayout | null {
    if (!this.canEdit()) return null;
    if (!this.layout || this.layout.floor !== this.e.floor) {
      this.layout = editableLayout(this.e.level, this.e.exitPlatform.y);
      this.selected = null;
      this.drag = null;
      // A new floor starts a new history.
      this.undoStack = [];
      this.redoStack = [];
      this.committed = structuredClone(this.layout);
      this.lastTag = null;
    }
    return this.layout;
  }

  /** Plays the design after a change and records the step (`tag`: steps with the same tag in a row are one). */
  private play(tag: string | null = null): void {
    if (!this.layout) return;
    followExit(this.layout);
    this.commit(tag);
    this.e.useCustomLevel(this.layout);
    this.notify(true);
  }

  /** The design changed: what it was before goes on the undo history (redo is dropped). */
  private commit(tag: string | null): void {
    if (!this.layout) return;
    if (this.committed && (tag === null || tag !== this.lastTag)) {
      this.undoStack.push(this.committed);
      if (this.undoStack.length > GAME_CONSTANTS.DEV_EDITOR_HISTORY_STEPS) this.undoStack.shift();
      this.redoStack = [];
    }
    this.committed = structuredClone(this.layout);
    this.lastTag = tag;
  }

  /** One step along the history: the design now goes on `to`, the one from `from` is played. */
  private travel(from: LevelLayout[], to: LevelLayout[]): void {
    const back: LevelLayout | undefined = from.pop();
    if (!back || !this.layout) return;
    to.push(structuredClone(this.layout));
    this.layout = back;
    this.committed = structuredClone(back);
    this.lastTag = null;
    this.selected = null;
    this.drag = null;
    this.inspectAt = null;
    followExit(this.layout);
    this.e.useCustomLevel(this.layout);
    this.notify(true);
  }

  private notify(layoutChanged: boolean = false): void {
    this.onChange?.(layoutChanged);
  }
}
