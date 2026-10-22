import { Component, ChangeDetectionStrategy, DestroyRef, EffectCleanupRegisterFn, ElementRef, InputSignal, OutputEmitterRef, Signal, WritableSignal, input, output, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActiveBuff, ATTACK_COMBO_HINTS, CharacterState, CHARACTER_CLASSES, SKILLS, SkillDefinition, SkillType, getSkillMpCost, getSkillHpCost, KeyBindings, GameAction, SKILL_KEY_ACTIONS, getTotalPotionsByCategory, ClassSkillTree, TreeSkill, getSkillTree, findTreeSkill, isSlottable, ownsTreeSkill, treeSkillCooldownMs, GAME_CONSTANTS } from '@shared/index';
import { ActiveSpecialEffect, SpecialDropDefinition } from '@shared/game-entities';
import { getSpecialDropDefinition } from '@shared/game-constants';
import { KeyBindingsService, formatKeyName } from '../../services/key-bindings.service';
import { PixelIconComponent } from '../../ui/pixel-icon/pixel-icon.component';
import { PixelIconId } from '@shared/pixel-icon';

export interface SkillSlot {
  id: string;
  key: string;
  name: string;
  icon: PixelIconId;
  mpCost: number;
  hpCost: number;
  locked: boolean;
  isBuff: boolean;
}

/** One slot of a tree class's skill bar, as the HUD shows it. */
export interface TreeBarSlotDisplay {
  slot: number;
  /** The bound key (skill1..skill6). */
  key: string;
  skill: TreeSkill | null;
  /** Share of the cooldown still to run, 0..100 (the shade over the icon). */
  shadePercent: number;
  /** Seconds left as text, '' when ready. */
  label: string;
}

/** What the "New move" plate says about using the skill just learned. */
export interface NewMoveDisplay {
  skill: TreeSkill;
  /** The key that fires it, null when it isn't on the bar. */
  key: string | null;
  /** Shown instead of a key (how a combo is done, or why there is no key). */
  note: string;
}

export interface ActiveBuffDisplay {
  skillName: string;
  icon: PixelIconId;
  color: string;
  remainingPercent: number;
  remainingSec: number;
  testId: string;
}

@Component({
  selector: 'app-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PixelIconComponent, DecimalPipe],
  host: {
    class: 'hud',
  },
  templateUrl: './hud.component.html',
  styleUrl: './hud.component.css',
})
export class HudComponent {
  private readonly keyBindingsService: KeyBindingsService = inject(KeyBindingsService);

  readonly playerData: InputSignal<CharacterState> = input.required<CharacterState>();
  readonly floor: InputSignal<number> = input.required<number>();
  readonly score: InputSignal<number> = input.required<number>();
  /** Time left on a skill's cooldown in ms, read from the running engine. */
  readonly cooldownMsOf: InputSignal<(skillId: string) => number> = input<(skillId: string) => number>(
    (): number => 0,
  );
  /** Special drop effects running in the engine (they act on the whole floor). */
  readonly specialEffectsOf: InputSignal<() => ActiveSpecialEffect[]> = input<() => ActiveSpecialEffect[]>(
    (): ActiveSpecialEffect[] => [],
  );
  /** What no plate may hide, in page px (players, the exit and its sign). */
  readonly keepVisibleOf: InputSignal<() => DOMRect[]> = input<() => DOMRect[]>((): DOMRect[] => []);

  private readonly leftPlate: Signal<ElementRef<HTMLElement>> = viewChild.required<ElementRef<HTMLElement>>('leftPlate');
  private readonly floorSign: Signal<ElementRef<HTMLElement>> = viewChild.required<ElementRef<HTMLElement>>('floorSign');
  private readonly rightPlate: Signal<ElementRef<HTMLElement>> = viewChild.required<ElementRef<HTMLElement>>('rightPlate');
  /** Plates with a player or the exit behind them: see-through so the game shows. */
  readonly leftSeeThrough: WritableSignal<boolean> = signal<boolean>(false);
  readonly floorSeeThrough: WritableSignal<boolean> = signal<boolean>(false);
  readonly rightSeeThrough: WritableSignal<boolean> = signal<boolean>(false);

  readonly statPanelRequested: OutputEmitterRef<void> = output<void>();
  readonly skillTreeRequested: OutputEmitterRef<void> = output<void>();
  readonly shopRequested: OutputEmitterRef<void> = output<void>();
  readonly inventoryRequested: OutputEmitterRef<void> = output<void>();

  /** Ticks while playing, so the skill bar and the special drop timers re-read the engine. */
  private readonly clock: WritableSignal<number> = signal<number>(0);
  /** Tree skills owned at the last player update (null until the first one), to spot a new one. */
  private knownTreeSkills: Set<string> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** The tree skill just learned, shown in the "New move" plate for a few seconds. */
  private readonly learnedSkill: WritableSignal<TreeSkill | null> = signal<TreeSkill | null>(null);

  readonly skillTree: Signal<ClassSkillTree | null> = computed((): ClassSkillTree | null =>
    getSkillTree(this.playerData().classId),
  );

  /** Tree classes: the six skill-bar slots (keys 1-6) with the skill on each and its cooldown. */
  readonly treeBar: Signal<TreeBarSlotDisplay[]> = computed((): TreeBarSlotDisplay[] => {
    this.clock();
    const tree: ClassSkillTree | null = this.skillTree();
    if (!tree) return [];
    const p: CharacterState = this.playerData();
    const remainingOf: (skillId: string) => number = this.cooldownMsOf();
    return SKILL_KEY_ACTIONS.map((action: GameAction, slot: number): TreeBarSlotDisplay => {
      const id: string | null = p.skillBar?.[slot] ?? null;
      const skill: TreeSkill | null =
        tree.skills.find((s: TreeSkill): boolean => s.id === id && ownsTreeSkill(p.skillLevels, s.id)) ?? null;
      const total: number = skill ? treeSkillCooldownMs(skill, p.stats) : 0;
      const remaining: number = skill ? Math.max(0, remainingOf(skill.id)) : 0;
      const seconds: number = remaining / 1000;
      return {
        slot,
        key: this.formatFirstKey(action),
        skill,
        shadePercent: total > 0 ? Math.min(100, (remaining / total) * 100) : 0,
        label: remaining <= 0 ? '' : seconds >= 1 ? `${Math.ceil(seconds)}` : seconds.toFixed(1),
      };
    });
  });

  /** The "New move" plate: the skill just learned and how to use it. */
  readonly newMove: Signal<NewMoveDisplay | null> = computed((): NewMoveDisplay | null => {
    const skill: TreeSkill | null = this.learnedSkill();
    if (!skill) return null;
    const slot: number = this.playerData().skillBar?.indexOf(skill.id) ?? -1;
    const key: string | null = slot >= 0 ? this.formatFirstKey(SKILL_KEY_ACTIONS[slot]) : null;
    let note: string = 'Always on';
    if (skill.combo) note = ATTACK_COMBO_HINTS[skill.combo];
    else if (isSlottable(skill)) note = 'Bar full: place it in the skill tree';
    else if (skill.type === SkillType.Reactive) note = 'Triggers by itself';
    return { skill, key, note };
  });

  constructor() {
    const destroyRef: DestroyRef = inject(DestroyRef);
    destroyRef.onDestroy((): void => {
      if (this.toastTimer) clearTimeout(this.toastTimer);
    });

    effect((onCleanup: EffectCleanupRegisterFn): void => {
      const id: ReturnType<typeof setInterval> = setInterval((): void => {
        this.clock.update((t: number): number => t + 1);
        this.updateSeeThrough();
      }, GAME_CONSTANTS.SKILL_COOLDOWN_HUD_REFRESH_MS);
      onCleanup((): void => clearInterval(id));
    });

    effect((): void => {
      const tree: ClassSkillTree | null = this.skillTree();
      const p: CharacterState = this.playerData();
      const owned: Set<string> = new Set<string>(
        (tree?.skills ?? [])
          .filter((s: TreeSkill): boolean => ownsTreeSkill(p.skillLevels, s.id))
          .map((s: TreeSkill): string => s.id),
      );
      const known: Set<string> | null = this.knownTreeSkills;
      this.knownTreeSkills = owned;
      if (!tree || !known) return;
      const learned: TreeSkill | undefined = tree.skills.find(
        (s: TreeSkill): boolean => owned.has(s.id) && !known.has(s.id),
      );
      if (learned) this.showNewMove(learned);
    });
  }

  readonly classIcon: Signal<PixelIconId> = computed((): PixelIconId => {
    return CHARACTER_CLASSES[this.playerData().classId].icon;
  });

  readonly hpPotionKey: Signal<string> = computed((): string => {
    return this.formatFirstKey('useHpPotion');
  });

  readonly mpPotionKey: Signal<string> = computed((): string => {
    return this.formatFirstKey('useMpPotion');
  });

  readonly shopKey: Signal<string> = computed((): string => {
    return this.formatFirstKey('openShop');
  });

  readonly inventoryKey: Signal<string> = computed((): string => {
    return this.formatFirstKey('openInventory');
  });

  readonly hpPercent: Signal<number> = computed((): number => {
    const p: CharacterState = this.playerData();
    return (p.hp / p.derived.maxHp) * 100;
  });

  readonly mpPercent: Signal<number> = computed((): number => {
    const p: CharacterState = this.playerData();
    return (p.mp / p.derived.maxMp) * 100;
  });

  readonly xpPercent: Signal<number> = computed((): number => {
    const p: CharacterState = this.playerData();
    return (p.xp / p.xpToNext) * 100;
  });

  readonly hasStatPoints: Signal<boolean> = computed((): boolean => {
    return this.playerData().unallocatedStatPoints > 0;
  });

  readonly unallocatedStatPoints: Signal<number> = computed((): number => {
    return this.playerData().unallocatedStatPoints;
  });

  readonly hasSkillPoints: Signal<boolean> = computed((): boolean => {
    return this.playerData().unallocatedSkillPoints > 0;
  });

  readonly unallocatedSkillPoints: Signal<number> = computed((): number => {
    return this.playerData().unallocatedSkillPoints;
  });

  readonly skillSlots: Signal<SkillSlot[]> = computed((): SkillSlot[] => {
    // Tree classes: the skill bar in the player panel shows keys 1-6 instead.
    if (this.skillTree()) return [];
    const p: CharacterState = this.playerData();
    const bindings: KeyBindings = this.keyBindingsService.bindings();
    const skillActions: readonly GameAction[] = SKILL_KEY_ACTIONS;
    const usableSkills: SkillDefinition[] = SKILLS.filter(
      (s: SkillDefinition) =>
        s.classId === p.classId &&
        (s.type === SkillType.Active || s.type === SkillType.Buff) &&
        (p.skillLevels[s.id] ?? 0) > 0,
    ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel)
     .slice(0, 6);
    return usableSkills.map((skill: SkillDefinition, idx: number): SkillSlot => {
      const level: number = p.skillLevels[skill.id] ?? 0;
      const action: GameAction = skillActions[idx];
      const boundKeys: string[] = bindings[action] ?? [];
      const displayKey: string = boundKeys.length > 0 ? formatKeyName(boundKeys[0]) : '?';
      return {
        id: skill.id,
        key: displayKey,
        name: `${skill.name} Lv.${level}`,
        icon: skill.icon,
        mpCost: getSkillMpCost(skill, level),
        hpCost: getSkillHpCost(skill, level),
        locked: false,
        isBuff: skill.type === SkillType.Buff,
      };
    });
  });

  /** Skill buffs, then special drop effects: their timers sit above the quick slot tray. */
  readonly activeBuffs: Signal<ActiveBuffDisplay[]> = computed((): ActiveBuffDisplay[] => {
    this.clock();
    const p: CharacterState = this.playerData();
    const seen: Set<string> = new Set<string>();
    const specials: ActiveBuffDisplay[] = this.specialEffectsOf()().flatMap(
      (eff: ActiveSpecialEffect): ActiveBuffDisplay[] => {
        const def: SpecialDropDefinition | undefined = getSpecialDropDefinition(eff.type);
        if (!def) return [];
        return [{
          skillName: def.name,
          icon: def.icon,
          color: def.color,
          remainingPercent: (eff.remainingTicks / eff.totalTicks) * 100,
          remainingSec: Math.ceil(eff.remainingTicks / GAME_CONSTANTS.TICK_RATE),
          testId: `hud-special-${eff.type}`,
        }];
      },
    );
    const buffs: ActiveBuffDisplay[] = p.activeBuffs
      .filter((buff: ActiveBuff): boolean => {
        if (seen.has(buff.skillId)) return false;
        seen.add(buff.skillId);
        return true;
      })
      .map((buff: ActiveBuff): ActiveBuffDisplay => {
        const skill: SkillDefinition | TreeSkill | undefined =
          SKILLS.find((s: SkillDefinition) => s.id === buff.skillId) ?? findTreeSkill(buff.skillId) ?? undefined;
        return {
          skillName: skill?.name ?? 'Buff',
          icon: skill?.icon ?? 'spark',
          color: skill?.color ?? '#ffffff',
          remainingPercent: (buff.remainingMs / buff.totalDurationMs) * 100,
          remainingSec: Math.ceil(buff.remainingMs / 1000),
          testId: `hud-buff-${buff.skillId}`,
        };
      });
    return [...buffs, ...specials];
  });

  readonly hpPotions: Signal<number> = computed((): number =>
    getTotalPotionsByCategory(this.playerData().inventory.potions, 'hp'),
  );
  readonly mpPotions: Signal<number> = computed((): number =>
    getTotalPotionsByCategory(this.playerData().inventory.potions, 'mp'),
  );
  readonly gold: Signal<number> = computed((): number => this.playerData().inventory.gold);

  onOpenStatPanel(): void {
    this.statPanelRequested.emit();
  }

  onOpenSkillTree(): void {
    this.skillTreeRequested.emit();
  }

  onOpenShop(): void {
    this.shopRequested.emit();
  }

  onOpenInventory(): void {
    this.inventoryRequested.emit();
  }

  onSkillDragStart(event: DragEvent, slot: SkillSlot): void {
    event.dataTransfer?.setData('application/json', JSON.stringify({ type: 'skill', id: slot.id }));
  }

  onPotionDragStart(event: DragEvent, category: string): void {
    const p: CharacterState = this.playerData();
    const potionId: string = category === 'hp'
      ? (p.inventory.autoPotionHpId ?? 'hp-potion-1')
      : (p.inventory.autoPotionMpId ?? 'mp-potion-1');
    event.dataTransfer?.setData('application/json', JSON.stringify({ type: 'potion', id: potionId }));
  }

  private updateSeeThrough(): void {
    const keep: DOMRect[] = this.keepVisibleOf()();
    const covers: (plate: ElementRef<HTMLElement>) => boolean = (plate: ElementRef<HTMLElement>): boolean => {
      const r: DOMRect = plate.nativeElement.getBoundingClientRect();
      return keep.some(
        (k: DOMRect): boolean => k.left < r.right && k.right > r.left && k.top < r.bottom && k.bottom > r.top,
      );
    };
    this.leftSeeThrough.set(covers(this.leftPlate()));
    this.floorSeeThrough.set(covers(this.floorSign()));
    this.rightSeeThrough.set(covers(this.rightPlate()));
  }

  private showNewMove(skill: TreeSkill): void {
    this.learnedSkill.set(skill);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout((): void => this.learnedSkill.set(null), GAME_CONSTANTS.NEW_MOVE_TOAST_MS);
  }

  private formatFirstKey(action: GameAction): string {
    const keys: string[] = this.keyBindingsService.bindings()[action] ?? [];
    return keys.length > 0 ? formatKeyName(keys[0]) : '?';
  }
}
