import {
  DestroyRef,
  Directive,
  ElementRef,
  InputSignal,
  afterNextRender,
  inject,
  input,
} from '@angular/core';
import { GAME_CONSTANTS } from '@shared/index';

/** Pointer-downs inside these never start a drag, so the header's buttons keep working. */
const NO_DRAG_SELECTOR: string = 'button, input, select, textarea, a, [data-no-drag]';

/** How much of the handle (px) always stays inside the viewport, so it can be grabbed again. */
export const DRAG_HANDLE_KEEP_VISIBLE_PX: number = GAME_CONSTANTS.HUD_DIALOG_DRAG_KEEP_VISIBLE_PX;

/** Class on the handle (cursor) and on the panel while it is being dragged (no text selection). */
export const DRAG_HANDLE_CLASS: string = 'px-drag-handle';
export const DRAGGING_CLASS: string = 'px-dragging';

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

type PointerHandler = (event: PointerEvent) => void;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Lets the player drag a dialog panel by its title bar. The offset goes into the CSS `translate`
 * property, which stacks on top of whatever `transform` already centres the panel.
 */
@Directive({
  selector: '[appDraggableDialog]',
})
export class DraggableDialogDirective {
  /** Selector of the drag handle inside the panel. */
  readonly dragHandle: InputSignal<string> = input<string>('.px-header');

  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private session: DragSession | null = null;

  constructor() {
    const handlers: [string, PointerHandler][] = [
      ['pointerdown', (event: PointerEvent): void => this.onPointerDown(event)],
      ['pointermove', (event: PointerEvent): void => this.onPointerMove(event)],
      ['pointerup', (event: PointerEvent): void => this.onPointerEnd(event)],
      ['pointercancel', (event: PointerEvent): void => this.onPointerEnd(event)],
      ['lostpointercapture', (event: PointerEvent): void => this.onPointerEnd(event)],
    ];
    // Plain listeners (not host bindings): pointermove must not schedule change detection.
    for (const [type, handler] of handlers) {
      this.host.addEventListener(type, handler as EventListener);
    }
    inject(DestroyRef).onDestroy((): void => {
      for (const [type, handler] of handlers) {
        this.host.removeEventListener(type, handler as EventListener);
      }
    });
    afterNextRender((): void => this.markHandles());
  }

  private markHandles(): void {
    const handles: NodeListOf<HTMLElement> = this.host.querySelectorAll<HTMLElement>(
      this.dragHandle(),
    );
    handles.forEach((handle: HTMLElement): void => handle.classList.add(DRAG_HANDLE_CLASS));
  }

  private findHandle(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const blocker: Element | null = target.closest(NO_DRAG_SELECTOR);
    if (blocker && this.host.contains(blocker)) return null;
    const handle: HTMLElement | null = target.closest<HTMLElement>(this.dragHandle());
    return handle && this.host.contains(handle) ? handle : null;
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.session || event.button !== 0) return;
    const handle: HTMLElement | null = this.findHandle(event.target);
    if (!handle) return;

    // Where the handle would sit with no drag offset; the clamp keeps it reachable.
    const rect: DOMRect = handle.getBoundingClientRect();
    const baseLeft: number = rect.left - this.offsetX;
    const baseRight: number = rect.right - this.offsetX;
    const baseTop: number = rect.top - this.offsetY;
    const keep: number = DRAG_HANDLE_KEEP_VISIBLE_PX;
    this.session = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: this.offsetX,
      startOffsetY: this.offsetY,
      minX: keep - baseRight,
      maxX: window.innerWidth - keep - baseLeft,
      minY: -baseTop,
      maxY: window.innerHeight - keep - baseTop,
    };
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    this.host.classList.add(DRAGGING_CLASS);
  }

  private onPointerMove(event: PointerEvent): void {
    const session: DragSession | null = this.session;
    if (!session || event.pointerId !== session.pointerId) return;
    this.offsetX = clamp(
      session.startOffsetX + event.clientX - session.startX,
      session.minX,
      session.maxX,
    );
    this.offsetY = clamp(
      session.startOffsetY + event.clientY - session.startY,
      session.minY,
      session.maxY,
    );
    this.host.style.setProperty('translate', `${this.offsetX}px ${this.offsetY}px`);
  }

  private onPointerEnd(event: PointerEvent): void {
    if (!this.session || event.pointerId !== this.session.pointerId) return;
    this.session = null;
    this.host.classList.remove(DRAGGING_CLASS);
  }
}
