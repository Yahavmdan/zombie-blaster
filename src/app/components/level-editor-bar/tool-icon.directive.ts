import { Directive, ElementRef, InputSignal, effect, inject, input } from '@angular/core';
import { EditorTool } from '../../engine/level-editor';
import { drawToolIcon } from '../../engine/tool-icons';

/** Draws the picture of what a level editor tool places on the host canvas. */
@Directive({
  selector: 'canvas[appToolIcon]',
})
export class ToolIconDirective {
  readonly appToolIcon: InputSignal<EditorTool> = input.required<EditorTool>();
  /** Draw a gadget in this look, close up, instead of as its tool. */
  readonly appToolIconLook: InputSignal<string | undefined> = input<string | undefined>();

  private readonly canvas: HTMLCanvasElement =
    inject<ElementRef<HTMLCanvasElement>>(ElementRef).nativeElement;

  constructor() {
    effect((): void => drawToolIcon(this.canvas, this.appToolIcon(), this.appToolIconLook()));
  }
}
