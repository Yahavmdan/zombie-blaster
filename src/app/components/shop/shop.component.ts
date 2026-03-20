import {
  Component,
  ChangeDetectionStrategy,
  InputSignal,
  OutputEmitterRef,
  Signal,
  WritableSignal,
  input,
  output,
  computed,
  signal,
} from '@angular/core';
import { CharacterState, SHOP_ITEMS } from '@shared/index';
import { ShopItemDefinition, ShopPurchase } from '@shared/game-entities';

export interface ShopRow {
  item: ShopItemDefinition;
  canAfford: boolean;
  quantity: number;
  maxAffordable: number;
  totalPrice: number;
}

@Component({
  selector: 'app-shop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'shop',
    '(document:keydown.escape)': 'onClose()',
  },
  templateUrl: './shop.component.html',
  styleUrl: './shop.component.css',
})
export class ShopComponent {
  readonly player: InputSignal<CharacterState> = input.required<CharacterState>();

  readonly itemPurchased: OutputEmitterRef<ShopPurchase> = output<ShopPurchase>();
  readonly closed: OutputEmitterRef<void> = output<void>();

  readonly gold: Signal<number> = computed((): number => this.player().inventory.gold);

  readonly quantities: WritableSignal<Record<string, number>> = signal<Record<string, number>>({});

  readonly rows: Signal<ShopRow[]> = computed((): ShopRow[] => {
    const g: number = this.gold();
    const qtys: Record<string, number> = this.quantities();
    return SHOP_ITEMS.map((item: ShopItemDefinition): ShopRow => {
      const maxAffordable: number = item.price > 0 ? Math.floor(g / item.price) : 0;
      const qty: number = Math.min(qtys[item.id] ?? 1, maxAffordable);
      const clampedQty: number = Math.max(qty, 1);
      return {
        item,
        canAfford: g >= item.price,
        quantity: clampedQty,
        maxAffordable,
        totalPrice: clampedQty * item.price,
      };
    });
  });

  readonly hpPotions: Signal<number> = computed((): number => this.player().inventory.hpPotions);
  readonly mpPotions: Signal<number> = computed((): number => this.player().inventory.mpPotions);

  onQuantityChange(itemId: string, delta: number): void {
    this.quantities.update((qtys: Record<string, number>): Record<string, number> => {
      const current: number = qtys[itemId] ?? 1;
      const next: number = Math.max(1, current + delta);
      return { ...qtys, [itemId]: next };
    });
  }

  onQuantityInput(itemId: string, event: Event): void {
    const input: HTMLInputElement = event.target as HTMLInputElement;
    const parsed: number = parseInt(input.value, 10);
    const value: number = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
    this.quantities.update((qtys: Record<string, number>): Record<string, number> => {
      return { ...qtys, [itemId]: value };
    });
  }

  onBuy(itemId: string, quantity: number): void {
    this.itemPurchased.emit({ itemId, quantity });
  }

  onClose(): void {
    this.closed.emit();
  }
}
