import { ChangeDetectionStrategy, Component, OutputEmitterRef, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PixelIconId } from '@shared/pixel-icon';
import { GameAction } from '@shared/messages';
import { PixelIconComponent } from '../../ui/pixel-icon/pixel-icon.component';

/** One on-screen button: held while a finger is on it. */
interface TouchButton {
  action: GameAction;
  icon: PixelIconId;
  label: string;
}

/** An action pressed or let go by a finger. */
export interface TouchHold {
  action: GameAction;
  held: boolean;
}

/** Left thumb: walk and climb. */
const MOVE_BUTTONS: TouchButton[] = [
  { action: 'up', icon: 'arrow-up', label: 'Climb up' },
  { action: 'left', icon: 'arrow-left', label: 'Left' },
  { action: 'right', icon: 'arrow-right', label: 'Right' },
  { action: 'down', icon: 'arrow-down', label: 'Climb down' },
];

/** Right thumb: jump, swing (rolls boulders, flips levers, breaks cracks) and carry. */
const ACT_BUTTONS: TouchButton[] = [
  { action: 'carry', icon: 'bag', label: 'Carry' },
  { action: 'attack', icon: 'sword', label: 'Attack' },
  { action: 'jump', icon: 'boot', label: 'Jump' },
];

/** Every action the touch controls can hold. */
export const TOUCH_ACTIONS: GameAction[] = [...MOVE_BUTTONS, ...ACT_BUTTONS].map(
  (b: TouchButton): GameAction => b.action,
);

/**
 * Phone controls over the map: a pad for the left thumb and action buttons for the right.
 * Every button is its own pointer, so walking and jumping work together.
 */
@Component({
  selector: 'app-touch-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PixelIconComponent, NgTemplateOutlet],
  templateUrl: './touch-controls.component.html',
  styleUrl: './touch-controls.component.css',
})
export class TouchControlsComponent {
  readonly hold: OutputEmitterRef<TouchHold> = output<TouchHold>();

  readonly moveButtons: TouchButton[] = MOVE_BUTTONS;
  readonly actButtons: TouchButton[] = ACT_BUTTONS;

  press(action: GameAction, event: PointerEvent): void {
    event.preventDefault();
    // The finger may slide off the button: it still gets the release.
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.hold.emit({ action, held: true });
  }

  release(action: GameAction): void {
    this.hold.emit({ action, held: false });
  }
}
