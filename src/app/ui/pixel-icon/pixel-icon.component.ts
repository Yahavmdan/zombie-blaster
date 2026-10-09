import {
  ChangeDetectionStrategy,
  Component,
  InputSignal,
  Signal,
  computed,
  input,
} from '@angular/core';
import { PixelIconId } from '@shared/pixel-icon';
import { getPixelIconDataUrl } from '../pixel-icon-raster';

@Component({
  selector: 'app-pixel-icon',
  templateUrl: './pixel-icon.component.html',
  styleUrl: './pixel-icon.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixelIconComponent {
  readonly icon: InputSignal<PixelIconId> = input.required<PixelIconId>();
  readonly size: InputSignal<number> = input<number>(16);
  readonly src: Signal<string> = computed((): string => getPixelIconDataUrl(this.icon()));
}
