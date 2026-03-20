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
import {
  CharacterState,
  SHOP_ITEMS,
  POTION_DEFINITIONS,
  getPotionsByCategory,
  getTotalPotionsByCategory,
  getPotionById,
} from '@shared/index';
import {
  ShopItemDefinition,
  ShopPurchase,
  PotionDefinition,
  PotionCategory,
} from '@shared/game-entities';

export interface ShopRow {
  item: ShopItemDefinition;
  owned: number;
  canAfford: boolean;
  quantity: number;
  maxAffordable: number;
  totalPrice: number;
}

export interface AutoPotionChange {
  category: PotionCategory;
  potionId: string | null;
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
  readonly autoPotionChanged: OutputEmitterRef<AutoPotionChange> = output<AutoPotionChange>();
  readonly closed: OutputEmitterRef<void> = output<void>();

  readonly gold: Signal<number> = computed((): number => this.player().inventory.gold);

  readonly quantities: WritableSignal<Record<string, number>> = signal<Record<string, number>>({});

  readonly rows: Signal<ShopRow[]> = computed((): ShopRow[] => {
    const g: number = this.gold();
    const qtys: Record<string, number> = this.quantities();
    const playerPotions: Record<string, number> = this.player().inventory.potions;
    return SHOP_ITEMS.map((item: ShopItemDefinition): ShopRow => {
      const maxAffordable: number = item.price > 0 ? Math.floor(g / item.price) : 0;
      const qty: number = Math.min(qtys[item.id] ?? 1, maxAffordable);
      const clampedQty: number = Math.max(qty, 1);
      return {
        item,
        owned: playerPotions[item.potionId] ?? 0,
        canAfford: g >= item.price,
        quantity: clampedQty,
        maxAffordable,
        totalPrice: clampedQty * item.price,
      };
    });
  });

  readonly totalHpPotions: Signal<number> = computed((): number =>
    getTotalPotionsByCategory(this.player().inventory.potions, 'hp'),
  );
  readonly totalMpPotions: Signal<number> = computed((): number =>
    getTotalPotionsByCategory(this.player().inventory.potions, 'mp'),
  );

  readonly hpPotionOptions: Signal<PotionDefinition[]> = computed((): PotionDefinition[] =>
    getPotionsByCategory('hp'),
  );
  readonly mpPotionOptions: Signal<PotionDefinition[]> = computed((): PotionDefinition[] =>
    getPotionsByCategory('mp'),
  );

  readonly autoPotionHpId: Signal<string | null> = computed((): string | null =>
    this.player().inventory.autoPotionHpId,
  );
  readonly autoPotionMpId: Signal<string | null> = computed((): string | null =>
    this.player().inventory.autoPotionMpId,
  );

  readonly autoPotionHpName: Signal<string> = computed((): string => {
    const id: string | null = this.autoPotionHpId();
    if (!id) return 'None';
    const def: PotionDefinition | undefined = getPotionById(id);
    return def ? def.name : 'None';
  });

  readonly autoPotionMpName: Signal<string> = computed((): string => {
    const id: string | null = this.autoPotionMpId();
    if (!id) return 'None';
    const def: PotionDefinition | undefined = getPotionById(id);
    return def ? def.name : 'None';
  });

  onQuantityChange(itemId: string, delta: number): void {
    this.quantities.update((qtys: Record<string, number>): Record<string, number> => {
      const current: number = qtys[itemId] ?? 1;
      const next: number = Math.max(1, current + delta);
      return { ...qtys, [itemId]: next };
    });
  }

  onQuantityInput(itemId: string, event: Event): void {
    const el: HTMLInputElement = event.target as HTMLInputElement;
    const parsed: number = parseInt(el.value, 10);
    const value: number = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
    this.quantities.update((qtys: Record<string, number>): Record<string, number> => {
      return { ...qtys, [itemId]: value };
    });
  }

  onBuy(itemId: string, quantity: number): void {
    this.itemPurchased.emit({ itemId, quantity });
  }

  onAutoPotionHpChange(event: Event): void {
    const el: HTMLSelectElement = event.target as HTMLSelectElement;
    const potionId: string | null = el.value === '' ? null : el.value;
    this.autoPotionChanged.emit({ category: 'hp', potionId });
  }

  onAutoPotionMpChange(event: Event): void {
    const el: HTMLSelectElement = event.target as HTMLSelectElement;
    const potionId: string | null = el.value === '' ? null : el.value;
    this.autoPotionChanged.emit({ category: 'mp', potionId });
  }

  onClose(): void {
    this.closed.emit();
  }
}
