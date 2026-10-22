import {
  ChangeDetectionStrategy,
  Component,
  InputSignal,
  OutputEmitterRef,
  Signal,
  WritableSignal,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  ATTACK_COMBO_HINTS,
  CHARACTER_CLASSES,
  CharacterState,
  ClassSkillTree,
  GAME_CONSTANTS,
  ScalingStat,
  SkillTreeBranch,
  SkillType,
  StatCurve,
  TreeCurveKey,
  TreeLockReason,
  TreeSkill,
  countOwnedTreeSkills,
  curveValue,
  getSkillTree,
  isSlottable,
  ownsTreeSkill,
  treeSkillCooldownMs,
  treeSkillLockReason,
} from '@shared/index';
import { PixelIconId } from '@shared/pixel-icon';
import { GameAction, SKILL_KEY_ACTIONS } from '@shared/messages';
import { GameStateService } from '../../services/game-state.service';
import { KeyBindingsService, formatKeyName } from '../../services/key-bindings.service';
import { PixelIconComponent } from '../../ui/pixel-icon/pixel-icon.component';
import { DraggableDialogDirective } from '../../ui/draggable-dialog.directive';

export type TreeNodeState = 'locked' | 'available' | 'owned';
export type TreeLinkState = 'lit' | 'ready' | 'dim';

export interface TreeNodeView {
  readonly skill: TreeSkill;
  readonly state: TreeNodeState;
  readonly reason: TreeLockReason | null;
  /** Shown on a tile whose tier the player hasn't reached. */
  readonly levelChip: number | null;
  readonly padlock: boolean;
  /** The key of the skill-bar slot holding this skill, null when it isn't on the bar. */
  readonly barKey: string | null;
  readonly left: number;
  readonly top: number;
}

/** One skill-bar slot as the window's bar strip shows it. */
export interface TreeBarSlotView {
  readonly slot: number;
  readonly key: string;
  readonly skill: TreeSkill | null;
  /** Holds the selected skill. */
  readonly selected: boolean;
}

/** The player put a skill on a bar slot (null empties it). */
export interface SkillBarAssignment {
  readonly slot: number;
  readonly skillId: string | null;
}

export interface TreeLinkView {
  readonly id: string;
  readonly path: string;
  readonly state: TreeLinkState;
}

export interface TreeBranchView {
  readonly branch: SkillTreeBranch;
  readonly nodes: TreeNodeView[];
  readonly links: TreeLinkView[];
  readonly owned: number;
}

export interface TreeTierLabel {
  readonly level: number;
  readonly top: number;
  readonly reached: boolean;
}

export interface TreeValueRow {
  readonly label: string;
  readonly value: string;
  readonly source: string;
}

export interface TreeSkillDetail {
  readonly skill: TreeSkill;
  readonly branch: SkillTreeBranch;
  readonly tierLevel: number;
  readonly typeLabel: string;
  readonly values: TreeValueRow[];
  readonly cost: string;
  readonly owned: boolean;
  readonly lockText: string | null;
  /** The key that fires it (on the bar), null otherwise. */
  readonly key: string | null;
  /** How it is used when there is no key to show. */
  readonly useText: string;
}

interface CurveLabel {
  readonly label: string;
  readonly format: (v: number) => string;
}

/** Tile and grid geometry of a branch column (px). Links are drawn from the same numbers. */
const NODE_SIZE: number = 56;
const COL_STEP: number = 72;
const ROW_STEP: number = 78;
const GRID_PAD_X: number = 12;
const GRID_PAD_Y: number = 10;
const TIERS: number = 5;
const COLUMNS: number = 3;
const TREE_GRID_WIDTH: number = GRID_PAD_X * 2 + COL_STEP * (COLUMNS - 1) + NODE_SIZE;
const TREE_GRID_HEIGHT: number = GRID_PAD_Y * 2 + ROW_STEP * (TIERS - 1) + NODE_SIZE;

const px: (v: number) => string = (v: number): string => `${Math.round(v)} px`;
const pct: (v: number) => string = (v: number): string => `${Math.round(v)}%`;
const ms: (v: number) => string = (v: number): string => `${Math.round(v)} ms`;

const CURVE_LABELS: Readonly<Record<TreeCurveKey, CurveLabel>> = {
  range: { label: 'Reach', format: px },
  radius: { label: 'Radius', format: px },
  distance: { label: 'Distance', format: px },
  knockback: { label: 'Knockback', format: (v: number): string => `${Math.round(v)}` },
  launch: { label: 'Launch height', format: px },
  stunMs: { label: 'Stun', format: (v: number): string => `${(v / 1000).toFixed(1)} s` },
  iframesMs: { label: 'Untouchable', format: ms },
  windowMs: { label: 'Window', format: ms },
  percent: { label: 'Bonus', format: pct },
  healPercent: { label: 'Heal', format: (v: number): string => `${Math.round(v)}% max HP` },
  lifestealPercent: { label: 'Lifesteal', format: pct },
  chance: { label: 'Chance', format: pct },
  cooldownCut: { label: 'Cooldown cut', format: (v: number): string => `${Math.round(v * 100)}%` },
};

const TYPE_LABELS: Readonly<Record<SkillType, string>> = {
  [SkillType.Active]: 'Active',
  [SkillType.Buff]: 'Buff',
  [SkillType.Passive]: 'Passive',
  [SkillType.Reactive]: 'Reactive',
};

function seconds(msValue: number): string {
  const s: number = msValue / 1000;
  return Number.isInteger(s) ? `${s} s` : `${s.toFixed(1)} s`;
}

function statSource(stat: ScalingStat, p: CharacterState): string {
  return `from ${stat.toUpperCase()} ${p.stats[stat]}`;
}

/**
 * Skill window of a skill-tree class: three branch columns of node tiles, a detail panel for the
 * selected node with a Learn button, and the skill bar (keys 1-6): click a slot to put the selected
 * active there.
 */
@Component({
  selector: 'app-tree-skill-window',
  imports: [PixelIconComponent, DraggableDialogDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tree-skill-window',
    '(document:keydown.escape)': 'onClose()',
  },
  templateUrl: './tree-skill-window.component.html',
  styleUrl: './tree-skill-window.component.css',
})
export class TreeSkillWindowComponent {
  private readonly gameState: GameStateService = inject(GameStateService);
  private readonly keyBindings: KeyBindingsService = inject(KeyBindingsService);

  readonly player: InputSignal<CharacterState> = input.required<CharacterState>();

  readonly learn: OutputEmitterRef<string> = output<string>();
  readonly respec: OutputEmitterRef<void> = output<void>();
  readonly assign: OutputEmitterRef<SkillBarAssignment> = output<SkillBarAssignment>();
  readonly closed: OutputEmitterRef<void> = output<void>();

  readonly gridWidth: number = TREE_GRID_WIDTH;
  readonly gridHeight: number = TREE_GRID_HEIGHT;

  private readonly picked: WritableSignal<string | null> = signal<string | null>(null);

  readonly tree: Signal<ClassSkillTree | null> = computed((): ClassSkillTree | null =>
    getSkillTree(this.player().classId),
  );

  readonly className: Signal<string> = computed(
    (): string => CHARACTER_CLASSES[this.player().classId].name,
  );

  readonly classIcon: Signal<PixelIconId> = computed(
    (): PixelIconId => CHARACTER_CLASSES[this.player().classId].icon,
  );

  readonly points: Signal<number> = computed((): number => this.player().unallocatedSkillPoints);

  readonly respecPrice: Signal<number> = computed((): number =>
    this.gameState.respecPrice(this.player()),
  );

  readonly canRespec: Signal<boolean> = computed((): boolean => {
    const tree: ClassSkillTree | null = this.tree();
    const p: CharacterState = this.player();
    if (!tree || countOwnedTreeSkills(tree, p.skillLevels) === 0) return false;
    return p.inventory.gold >= this.respecPrice();
  });

  /** The key bound to each skill-bar slot. */
  private readonly barKeys: Signal<string[]> = computed((): string[] => {
    const bindings: Record<string, string[]> = this.keyBindings.bindings();
    return SKILL_KEY_ACTIONS.map((action: GameAction): string => {
      const keys: string[] = bindings[action] ?? [];
      return keys.length > 0 ? formatKeyName(keys[0]) : '?';
    });
  });

  readonly barSlots: Signal<TreeBarSlotView[]> = computed((): TreeBarSlotView[] => {
    const tree: ClassSkillTree | null = this.tree();
    const p: CharacterState = this.player();
    const selected: string | null = this.selectedId();
    return this.barKeys().map((key: string, slot: number): TreeBarSlotView => {
      const id: string | null = p.skillBar?.[slot] ?? null;
      const skill: TreeSkill | null =
        tree?.skills.find((s: TreeSkill): boolean => s.id === id) ?? null;
      return { slot, key, skill, selected: skill !== null && skill.id === selected };
    });
  });

  /** The selected skill can go on the bar (an owned active or buff). */
  readonly canPlaceSelected: Signal<boolean> = computed((): boolean => {
    const d: TreeSkillDetail | null = this.detail();
    return !!d && d.owned && isSlottable(d.skill);
  });

  readonly tierLabels: Signal<TreeTierLabel[]> = computed((): TreeTierLabel[] => {
    const level: number = this.player().level;
    return GAME_CONSTANTS.SKILL_TIER_LEVELS.slice(0, TIERS).map(
      (tierLevel: number, i: number): TreeTierLabel => ({
        level: tierLevel,
        top: GRID_PAD_Y + i * ROW_STEP,
        reached: level >= tierLevel,
      }),
    );
  });

  readonly branches: Signal<TreeBranchView[]> = computed((): TreeBranchView[] => {
    const tree: ClassSkillTree | null = this.tree();
    if (!tree) return [];
    const p: CharacterState = this.player();
    return tree.branches.map((branch: SkillTreeBranch): TreeBranchView => {
      const skills: TreeSkill[] = tree.skills.filter(
        (s: TreeSkill): boolean => s.branch === branch.id,
      );
      const nodes: TreeNodeView[] = skills.map((s: TreeSkill): TreeNodeView => this.nodeView(s, p));
      const links: TreeLinkView[] = [];
      for (const child of skills) {
        const parents: TreeSkill[] = skills.filter((s: TreeSkill): boolean =>
          child.parents.includes(s.id),
        );
        for (const parent of parents) links.push(this.linkView(parent, child, p));
      }
      return {
        branch,
        nodes,
        links,
        owned: skills.filter((s: TreeSkill): boolean => ownsTreeSkill(p.skillLevels, s.id)).length,
      };
    });
  });

  /** The picked node, else the first one the player can learn, else the first owned one. */
  readonly selectedId: Signal<string | null> = computed((): string | null => {
    const picked: string | null = this.picked();
    if (picked) return picked;
    const nodes: TreeNodeView[] = this.branches().flatMap(
      (b: TreeBranchView): TreeNodeView[] => b.nodes,
    );
    const pick: TreeNodeView | undefined =
      nodes.find((n: TreeNodeView): boolean => n.state === 'available') ??
      nodes.find((n: TreeNodeView): boolean => n.state === 'owned') ??
      nodes[0];
    return pick?.skill.id ?? null;
  });

  readonly detail: Signal<TreeSkillDetail | null> = computed((): TreeSkillDetail | null => {
    const tree: ClassSkillTree | null = this.tree();
    const id: string | null = this.selectedId();
    const skill: TreeSkill | undefined = tree?.skills.find((s: TreeSkill): boolean => s.id === id);
    const branch: SkillTreeBranch | undefined = tree?.branches.find(
      (b: SkillTreeBranch): boolean => b.id === skill?.branch,
    );
    if (!tree || !skill || !branch) return null;
    const p: CharacterState = this.player();
    const reason: TreeLockReason | null = this.lockReason(skill, p);
    return {
      skill,
      branch,
      tierLevel: GAME_CONSTANTS.SKILL_TIER_LEVELS[skill.tier - 1],
      typeLabel: TYPE_LABELS[skill.type],
      values: this.valueRows(skill, p),
      cost: this.costLine(skill, p),
      owned: reason === 'owned',
      lockText: reason && reason !== 'owned' ? this.lockText(skill, reason, tree) : null,
      key: this.barKeyOf(skill.id, p),
      useText: this.useText(skill, reason === 'owned'),
    };
  });

  onSelect(skillId: string): void {
    this.picked.set(skillId);
  }

  onLearn(skillId: string): void {
    this.learn.emit(skillId);
  }

  /**
   * A bar slot was clicked: puts the selected owned active there (clicking its own slot takes it off);
   * with nothing to place, selects the skill on that slot.
   */
  onBarSlot(slot: number): void {
    const d: TreeSkillDetail | null = this.detail();
    const onSlot: string | null = this.player().skillBar?.[slot] ?? null;
    if (d && this.canPlaceSelected()) {
      this.assign.emit({ slot, skillId: onSlot === d.skill.id ? null : d.skill.id });
      return;
    }
    if (onSlot) this.picked.set(onSlot);
  }

  onRespec(): void {
    this.respec.emit();
  }

  onClose(): void {
    this.closed.emit();
  }

  private lockReason(skill: TreeSkill, p: CharacterState): TreeLockReason | null {
    return treeSkillLockReason(
      skill,
      p.skillLevels,
      p.level,
      p.unallocatedSkillPoints,
      GAME_CONSTANTS.SKILL_TIER_LEVELS,
    );
  }

  private nodeView(skill: TreeSkill, p: CharacterState): TreeNodeView {
    const reason: TreeLockReason | null = this.lockReason(skill, p);
    const state: TreeNodeState =
      reason === 'owned' ? 'owned' : reason === null ? 'available' : 'locked';
    return {
      skill,
      state,
      reason,
      levelChip: reason === 'level' ? GAME_CONSTANTS.SKILL_TIER_LEVELS[skill.tier - 1] : null,
      padlock: reason === 'level' || reason === 'parent',
      barKey: this.barKeyOf(skill.id, p),
      left: GRID_PAD_X + skill.column * COL_STEP,
      top: GRID_PAD_Y + (skill.tier - 1) * ROW_STEP,
    };
  }

  /** A right-angle line from the parent's bottom edge to the child's top edge. */
  private linkView(parent: TreeSkill, child: TreeSkill, p: CharacterState): TreeLinkView {
    const half: number = NODE_SIZE / 2;
    const x1: number = GRID_PAD_X + parent.column * COL_STEP + half;
    const y1: number = GRID_PAD_Y + (parent.tier - 1) * ROW_STEP + NODE_SIZE;
    const x2: number = GRID_PAD_X + child.column * COL_STEP + half;
    const y2: number = GRID_PAD_Y + (child.tier - 1) * ROW_STEP;
    const midY: number = Math.round((y1 + y2) / 4) * 2;
    const parentOwned: boolean = ownsTreeSkill(p.skillLevels, parent.id);
    const childOwned: boolean = ownsTreeSkill(p.skillLevels, child.id);
    return {
      id: `${parent.id}>${child.id}`,
      path: `M${x1} ${y1} V${midY} H${x2} V${y2}`,
      state: parentOwned && childOwned ? 'lit' : parentOwned ? 'ready' : 'dim',
    };
  }

  private valueRows(skill: TreeSkill, p: CharacterState): TreeValueRow[] {
    const rows: TreeValueRow[] = [];
    if (skill.damageMult > 0) {
      rows.push({
        label: 'Damage',
        value: `${Math.floor(p.derived.attack * skill.damageMult)}`,
        source: `ATK ${p.derived.attack} × ${skill.damageMult}`,
      });
    }
    const keys: TreeCurveKey[] = Object.keys(skill.curves) as TreeCurveKey[];
    for (const key of keys) {
      const curve: StatCurve | undefined = skill.curves[key];
      if (!curve) continue;
      const label: CurveLabel = CURVE_LABELS[key];
      rows.push({
        label: label.label,
        value: label.format(curveValue(curve, p.stats)),
        source: statSource(curve.stat, p),
      });
    }
    if (skill.maxTargets > 1) {
      rows.push({ label: 'Max targets', value: `${skill.maxTargets}`, source: '' });
    }
    if (skill.buff) {
      rows.push({ label: 'Lasts', value: seconds(skill.buff.durationMs), source: '' });
    }
    return rows;
  }

  private costLine(skill: TreeSkill, p: CharacterState): string {
    const parts: string[] = [];
    if (skill.mpCost > 0) parts.push(`${skill.mpCost} MP`);
    if (skill.hpCostPercent > 0) parts.push(`${skill.hpCostPercent}% HP`);
    const cooldown: number = treeSkillCooldownMs(skill, p.stats);
    parts.push(cooldown > 0 ? `${seconds(cooldown)} cooldown` : 'no cooldown');
    if (skill.minHpPercent > 0) parts.push(`needs over ${skill.minHpPercent}% HP`);
    return parts.join(' · ');
  }

  private barKeyOf(skillId: string, p: CharacterState): string | null {
    const slot: number = p.skillBar?.indexOf(skillId) ?? -1;
    return slot >= 0 ? (this.barKeys()[slot] ?? null) : null;
  }

  private useText(skill: TreeSkill, owned: boolean): string {
    if (skill.combo) return ATTACK_COMBO_HINTS[skill.combo];
    if (!isSlottable(skill))
      return skill.type === SkillType.Reactive ? 'Triggers by itself' : 'Always on';
    if (!owned) return 'Learn it and it goes on your skill bar';
    return 'Not on your skill bar: click a slot below';
  }

  private lockText(skill: TreeSkill, reason: TreeLockReason, tree: ClassSkillTree): string {
    if (reason === 'level')
      return `Needs level ${GAME_CONSTANTS.SKILL_TIER_LEVELS[skill.tier - 1]}`;
    if (reason === 'parent') {
      const names: string[] = skill.parents.map(
        (id: string): string =>
          tree.skills.find((s: TreeSkill): boolean => s.id === id)?.name ?? id,
      );
      return `Needs ${names.join(' or ')}`;
    }
    return 'No skill points left';
  }
}
