import { Box } from './boulder-puzzle';
import { CANVAS_BONE, fillOutlinedText, pixelFont } from './canvas-text';
import { EditorEdge, EditorRef } from './level-editor';
import { EditorOverlay, EditorOverlayItem } from './level-editor-system';
import { PIXEL } from './pixel-art';
import { drawFlightPath } from './gadget-art';

/** Outline colour by what a thing is: map pieces steel, props rust, gadgets teal, floor puzzle parts toxic, the exit gold. */
function kindColor(kind: EditorRef['kind']): string {
  switch (kind) {
    case 'platform':
    case 'wall':
    case 'ladder':
      return PIXEL['steelLight'];
    case 'prop':
      return PIXEL['rustHi'];
    case 'gadget':
      return PIXEL['tealHi'];
    case 'exit':
      return PIXEL['goldHi'];
    default:
      return PIXEL['toxicHi'];
  }
}

/** A hard 2 px frame inside the box (no anti-aliased strokes). */
function frame(
  ctx: CanvasRenderingContext2D,
  box: Box,
  color: string,
  thickness: number = 2,
): void {
  const x: number = Math.round(box.x);
  const y: number = Math.round(box.y);
  const w: number = Math.max(thickness, Math.round(box.width));
  const h: number = Math.max(thickness, Math.round(box.height));
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, thickness);
  ctx.fillRect(x, y + h - thickness, w, thickness);
  ctx.fillRect(x, y, thickness, h);
  ctx.fillRect(x + w - thickness, y, thickness, h);
}

function drawItem(ctx: CanvasRenderingContext2D, item: EditorOverlayItem, erasing: boolean): void {
  if (item.selected) {
    frame(
      ctx,
      {
        x: item.box.x - 2,
        y: item.box.y - 2,
        width: item.box.width + 4,
        height: item.box.height + 4,
      },
      PIXEL['ink'],
      2,
    );
    frame(ctx, item.box, PIXEL['gold'], 2);
    return;
  }
  if (item.hovered) {
    frame(ctx, item.box, erasing ? PIXEL['bloodHi'] : PIXEL['white'], 2);
    return;
  }
  if (item.linked) {
    // Wired to the selected source.
    frame(ctx, item.box, PIXEL['rustHi'], 2);
    return;
  }
  ctx.globalAlpha = 0.7;
  frame(ctx, item.box, kindColor(item.ref.kind), 2);
  ctx.globalAlpha = 1;
}

/**
 * The dev level editor's marks over the map: every thing outlined by kind, the hovered one white
 * (blood red with the erase tool), the selection gold with its name, a resize handle on the side
 * under the pointer, what the selected source is wired to (rust), every launcher's aim, and the
 * ghost of what a click would place.
 */
export function drawLevelEditor(ctx: CanvasRenderingContext2D, overlay: EditorOverlay): void {
  ctx.save();
  for (const aim of overlay.aims) drawFlightPath(ctx, aim.points, aim.label);
  for (const item of overlay.items) drawItem(ctx, item, overlay.erasing);
  if (overlay.ghost) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = PIXEL['toxicHi'];
    ctx.fillRect(overlay.ghost.x, overlay.ghost.y, overlay.ghost.width, overlay.ghost.height);
    ctx.globalAlpha = 1;
    frame(ctx, overlay.ghost, PIXEL['toxicHi'], 2);
  }
  if (overlay.hoverEdge) {
    const { box, edge }: { box: Box; edge: EditorEdge } = overlay.hoverEdge;
    const handle: Box =
      edge === 'left' || edge === 'right'
        ? {
            x: (edge === 'left' ? box.x : box.x + box.width) - 3,
            y: box.y,
            width: 6,
            height: Math.max(box.height, 8),
          }
        : {
            x: box.x,
            y: (edge === 'top' ? box.y : box.y + box.height) - 3,
            width: Math.max(box.width, 8),
            height: 6,
          };
    ctx.fillStyle = PIXEL['goldHi'];
    ctx.fillRect(handle.x, handle.y, handle.width, handle.height);
  }
  const selected: EditorOverlayItem | undefined = overlay.items.find(
    (i: EditorOverlayItem): boolean => i.selected,
  );
  if (selected && overlay.selectedLabel) {
    ctx.font = pixelFont(16);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const box: Box = selected.box;
    const text: string = `${overlay.selectedLabel} ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`;
    fillOutlinedText(
      ctx,
      text,
      Math.round(box.x),
      Math.max(16, Math.round(box.y) - 4),
      CANVAS_BONE,
    );
  }
  ctx.restore();
}
