import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAGGING_CLASS,
  DRAG_HANDLE_CLASS,
  DRAG_HANDLE_KEEP_VISIBLE_PX,
  DraggableDialogDirective,
} from './draggable-dialog.directive';

/** Header sits at (300, 100), 200 x 40, inside jsdom's 1024 x 768 window. */
const HEADER_RECT: DOMRect = new DOMRect(300, 100, 200, 40);

describe('DraggableDialogDirective', (): void => {
  let panel: HTMLElement;
  let header: HTMLElement;
  let title: HTMLElement;
  let closeButton: HTMLButtonElement;
  let body: HTMLElement;
  let originalCapture: ((pointerId: number) => void) | undefined;

  function pointer(
    target: Element,
    type: string,
    clientX: number,
    clientY: number,
    button: number = 0,
  ): PointerEvent {
    const event: PointerEvent = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      button,
      clientX,
      clientY,
    });
    target.dispatchEvent(event);
    return event;
  }

  function translate(): string {
    return panel.style.getPropertyValue('translate');
  }

  /** Builds a panel + header in the page and attaches a fresh directive to it. */
  function attach(): void {
    panel = document.createElement('div');
    panel.innerHTML = `
      <div class="px-header">
        <h2>Title</h2>
        <button type="button">x</button>
      </div>
      <div class="body">Body</div>`;
    document.body.appendChild(panel);
    header = panel.querySelector<HTMLElement>('.px-header') as HTMLElement;
    title = panel.querySelector<HTMLElement>('h2') as HTMLElement;
    closeButton = panel.querySelector<HTMLButtonElement>('button') as HTMLButtonElement;
    body = panel.querySelector<HTMLElement>('.body') as HTMLElement;

    // jsdom has no layout: the header follows the drag offset like the real one would.
    vi.spyOn(header, 'getBoundingClientRect').mockImplementation((): DOMRect => {
      const [x, y]: number[] = (translate() || '0px 0px')
        .split(' ')
        .map((part: string): number => parseFloat(part));
      return new DOMRect(HEADER_RECT.x + x, HEADER_RECT.y + y, HEADER_RECT.width, 40);
    });

    TestBed.configureTestingModule({
      providers: [{ provide: ElementRef, useValue: new ElementRef<HTMLElement>(panel) }],
    });
    TestBed.runInInjectionContext((): DraggableDialogDirective => new DraggableDialogDirective());
    TestBed.tick();
  }

  beforeEach((): void => {
    originalCapture = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = vi.fn();
    attach();
  });

  afterEach((): void => {
    vi.restoreAllMocks();
    Element.prototype.setPointerCapture = originalCapture as (pointerId: number) => void;
    panel.remove();
  });

  it('marks the header as the drag handle', (): void => {
    expect(header.classList.contains(DRAG_HANDLE_CLASS)).toBe(true);
    expect(body.classList.contains(DRAG_HANDLE_CLASS)).toBe(false);
  });

  it('moves the panel with the pointer while the header is held', (): void => {
    const down: PointerEvent = pointer(title, 'pointerdown', 400, 120);
    expect(down.defaultPrevented).toBe(true);
    expect(header.setPointerCapture).toHaveBeenCalledWith(1);
    expect(panel.classList.contains(DRAGGING_CLASS)).toBe(true);

    pointer(header, 'pointermove', 450, 150);
    expect(translate()).toBe('50px 30px');
    pointer(header, 'pointermove', 550, 200);
    expect(translate()).toBe('150px 80px');

    pointer(header, 'pointerup', 550, 200);
    expect(panel.classList.contains(DRAGGING_CLASS)).toBe(false);

    // After release, moves no longer drag; a second drag continues from the new spot.
    pointer(header, 'pointermove', 700, 300);
    expect(translate()).toBe('150px 80px');
    pointer(header, 'pointerdown', 500, 200);
    pointer(header, 'pointermove', 480, 190);
    pointer(header, 'pointerup', 480, 190);
    expect(translate()).toBe('130px 70px');
  });

  it('does not drag from a button in the header, and the button still clicks', (): void => {
    const onClick: () => void = vi.fn();
    closeButton.addEventListener('click', onClick);

    const down: PointerEvent = pointer(closeButton, 'pointerdown', 480, 120);
    expect(down.defaultPrevented).toBe(false);
    pointer(closeButton, 'pointermove', 600, 300);
    pointer(closeButton, 'pointerup', 600, 300);
    expect(translate()).toBe('');
    expect(panel.classList.contains(DRAGGING_CLASS)).toBe(false);

    closeButton.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not drag from the body or with a non-primary button', (): void => {
    pointer(body, 'pointerdown', 400, 300);
    pointer(body, 'pointermove', 500, 400);
    pointer(header, 'pointerdown', 400, 120, 2);
    pointer(header, 'pointermove', 500, 200);
    expect(translate()).toBe('');
  });

  it('keeps part of the header inside the viewport', (): void => {
    pointer(header, 'pointerdown', 400, 120);
    pointer(header, 'pointermove', -5000, -5000);
    // The header's right edge stops KEEP px inside the left edge; its top stops at the top.
    expect(translate()).toBe(
      `${DRAG_HANDLE_KEEP_VISIBLE_PX - HEADER_RECT.right}px ${-HEADER_RECT.top}px`,
    );
    pointer(header, 'pointermove', 5000, 5000);
    const maxX: number = window.innerWidth - DRAG_HANDLE_KEEP_VISIBLE_PX - HEADER_RECT.left;
    const maxY: number = window.innerHeight - DRAG_HANDLE_KEEP_VISIBLE_PX - HEADER_RECT.top;
    expect(translate()).toBe(`${maxX}px ${maxY}px`);
  });

  it('stops dragging when the pointer capture is lost', (): void => {
    pointer(header, 'pointerdown', 400, 120);
    pointer(header, 'lostpointercapture', 400, 120);
    pointer(header, 'pointermove', 500, 200);
    expect(translate()).toBe('');
    expect(panel.classList.contains(DRAGGING_CLASS)).toBe(false);
  });

  it('removes its listeners when destroyed', (): void => {
    TestBed.resetTestingModule();
    pointer(header, 'pointerdown', 400, 120);
    pointer(header, 'pointermove', 500, 200);
    expect(translate()).toBe('');
  });
});
