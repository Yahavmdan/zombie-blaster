import {
  Component,
  ChangeDetectionStrategy,
  InputSignal,
  OutputEmitterRef,
  Signal,
  input,
  output,
  computed,
} from '@angular/core';
import { CharacterState, SHOP_ITEMS } from '@shared/index';
import { ShopItemDefinition } from '@shared/game-entities';

export interface ShopRow {
  item: ShopItemDefinition;
  canAfford: boolean;
}

@Component({
  selector: 'app-shop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'shop',
  },
  templateUrl: './shop.component.html',
  styleUrl: './shop.component.css',
})
export class ShopComponent {
  readonly player: InputSignal<CharacterState> = input.required<CharacterState>();

  readonly itemPurchased: OutputEmitterRef<string> = output<string>();
  readonly closed: OutputEmitterRef<void> = output<void>();

  readonly gold: Signal<number> = computed((): number => this.player().inventory.gold);

  readonly rows: Signal<ShopRow[]> = computed((): ShopRow[] => {
    const g: number = this.gold();
    return SHOP_ITEMS.map((item: ShopItemDefinition): ShopRow => ({
      item,
      canAfford: g >= item.price,
    }));
  });

  readonly hpPotions: Signal<number> = computed((): number => this.player().inventory.hpPotions);
  readonly mpPotions: Signal<number> = computed((): number => this.player().inventory.mpPotions);

  onBuy(itemId: string): void {
    this.itemPurchased.emit(itemId);
  }

  onClose(): void {
    this.closed.emit();
  }
}
