import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  InputSignal,
  OutputEmitterRef,
  Signal,
  viewChild,
  afterNextRender,
  OnDestroy,
  output,
  input,
  inject,
  effect,
} from '@angular/core';
import { CharacterClass, CharacterState, SKILLS, SkillDefinition, SkillType, VfxEvent } from '@shared/index';
import { DropType, QUICK_SLOT_ACTION_SET, QuickSlotEntry, SpecialDropType } from '@shared/game-entities';
import { GameAction } from '@shared/messages';
import { GameEngine } from '../../engine/game-engine';
import { SpitterProjectile, DragonProjectile } from '../../engine/engine-types';
import { InputKeys } from '@shared/messages';
import { KeyBindingsService } from '../../services/key-bindings.service';
import { GameStateService } from '../../services/game-state.service';
import { QuickSlotService } from '../../services/quick-slot.service';

const UI_ACTIONS: Set<string> = new Set<string>(['openStats', 'openSkills', 'openShop', 'openInventory']);

@Component({
  selector: 'app-game-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'game-canvas',
  },
  templateUrl: './game-canvas.component.html',
  styleUrl: './game-canvas.component.css',
})
export class GameCanvasComponent implements OnDestroy {
  private readonly keyBindingsService: KeyBindingsService = inject(KeyBindingsService);
  private readonly gameState: GameStateService = inject(GameStateService);
  private readonly quickSlotService: QuickSlotService = inject(QuickSlotService);

  readonly player: InputSignal<CharacterState> = input.required<CharacterState>();
  readonly inputDisabled: InputSignal<boolean> = input<boolean>(false);

  readonly playerUpdated: OutputEmitterRef<CharacterState> = output<CharacterState>();
  readonly xpGained: OutputEmitterRef<number> = output<number>();
  readonly scoreUpdated: OutputEmitterRef<number> = output<number>();
  readonly floorUpdated: OutputEmitterRef<number> = output<number>();
  readonly floorCompleted: OutputEmitterRef<void> = output<void>();
  readonly gameOver: OutputEmitterRef<void> = output<void>();
  readonly openStatsRequested: OutputEmitterRef<void> = output<void>();
  readonly openSkillsRequested: OutputEmitterRef<void> = output<void>();
  readonly openShopRequested: OutputEmitterRef<void> = output<void>();
  readonly openInventoryRequested: OutputEmitterRef<void> = output<void>();
  readonly quickSlotKeyPressed: OutputEmitterRef<string> = output<string>();
  readonly goldPickedUp: OutputEmitterRef<number> = output<number>();
  readonly potionPickedUp: OutputEmitterRef<DropType> = output<DropType>();
  readonly zombieDamaged: OutputEmitterRef<Array<{ zombieId: string; damage: number; killed: boolean }>> =
    output<Array<{ zombieId: string; damage: number; killed: boolean }>>();
  readonly remotePlayerDamaged: OutputEmitterRef<{ targetPlayerId: string; damage: number; zombieX: number; zombieY: number; knockbackDir: number; isPoisonAttack: boolean }> =
    output<{ targetPlayerId: string; damage: number; zombieX: number; zombieY: number; knockbackDir: number; isPoisonAttack: boolean }>();
  readonly playerRevived: OutputEmitterRef<string> = output<string>();
  readonly playerDowned: OutputEmitterRef<void> = output<void>();
  readonly playerDownExpired: OutputEmitterRef<void> = output<void>();

  useHpPotionHandler: (() => boolean) | null = null;
  useMpPotionHandler: (() => boolean) | null = null;

  readonly canvasRef: Signal<ElementRef<HTMLCanvasElement>> = viewChild.required<ElementRef<HTMLCanvasElement>>('gameCanvas');

  private engine: GameEngine | null = null;
  private currentClassId: CharacterClass | null = null;
  private pendingMultiplayerHost: boolean = false;
  private pendingMultiplayerClient: boolean = false;
  private keys: InputKeys = { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false, skill3: false, skill4: false, skill5: false, skill6: false, openStats: false, openSkills: false, useHpPotion: false, useMpPotion: false, openShop: false, openInventory: false, revive: false, quickSlot1: false, quickSlot2: false, quickSlot3: false, quickSlot4: false, quickSlot5: false, quickSlot6: false, quickSlot7: false, quickSlot8: false };
  private readonly boundKeyDown: (e: KeyboardEvent) => void = (e: KeyboardEvent): void => this.onKeyDown(e);
  private readonly boundKeyUp: (e: KeyboardEvent) => void = (e: KeyboardEvent): void => this.onKeyUp(e);
  private readonly boundMouseDown: () => void = (): void => this.onMouseDown();
  private readonly boundMouseUp: () => void = (): void => this.onMouseUp();
  private readonly heldQuickSlotActions: Map<string, GameAction> = new Map<string, GameAction>();

  constructor() {
    afterNextRender((): void => {
      this.initEngine();
      this.bindInput();
    });

    effect((): void => {
      const disabled: boolean = this.inputDisabled();
      if (disabled) {
        this.resetAllKeys();
      }
    });

    effect((): void => {
      const p: CharacterState = this.player();
      if (!this.engine || this.currentClassId === null) return;
      const classChanged: boolean = p.classId !== this.currentClassId;
      const retried: boolean = !p.isDead && (this.engine.player?.isDead === true);
      if (classChanged || retried) {
        this.restartEngine(p);
      }
    });
  }

  syncProgression(player: CharacterState): void {
    this.engine?.syncProgression(player);
  }

  setFloor(floor: number): void {
    this.engine?.setFloor(floor);
  }

  setGodMode(enabled: boolean): void {
    if (this.engine) {
      this.engine.godMode = enabled;
    }
  }

  setShowCollisionBoxes(enabled: boolean): void {
    if (this.engine) {
      this.engine.showCollisionBoxes = enabled;
    }
  }

  triggerQuickSlotSkill(skillId: string): void {
    const p: CharacterState | null = this.gameState.player();
    if (!p) return;
    const usableSkills: SkillDefinition[] = SKILLS.filter(
      (s: SkillDefinition): boolean =>
        s.classId === p.classId &&
        (s.type === SkillType.Active || s.type === SkillType.Buff) &&
        (p.skillLevels[s.id] ?? 0) > 0,
    ).sort((a: SkillDefinition, b: SkillDefinition): number => a.requiredCharacterLevel - b.requiredCharacterLevel);

    const idx: number = usableSkills.findIndex((s: SkillDefinition): boolean => s.id === skillId);
    if (idx === -1 || idx >= 6) return;

    const skillAction: GameAction = `skill${idx + 1}` as GameAction;
    this.keys[skillAction] = true;
    this.engine?.setKeys({ ...this.keys });
    setTimeout((): void => {
      this.keys[skillAction] = false;
      this.engine?.setKeys({ ...this.keys });
    }, 50);
  }

  triggerQuickSlotAction(action: GameAction): void {
    if (action === 'openStats') { this.openStatsRequested.emit(); return; }
    if (action === 'openSkills') { this.openSkillsRequested.emit(); return; }
    if (action === 'openShop') { this.openShopRequested.emit(); return; }
    if (action === 'openInventory') { this.openInventoryRequested.emit(); return; }

    this.keys[action] = true;
    this.engine?.setKeys({ ...this.keys });
    setTimeout((): void => {
      this.keys[action] = false;
      this.engine?.setKeys({ ...this.keys });
    }, 50);
  }

  setMultiplayerHost(enabled: boolean): void {
    this.pendingMultiplayerHost = enabled;
    if (this.engine) {
      this.engine.isMultiplayerHost = enabled;
    }
  }

  setMultiplayerClient(enabled: boolean): void {
    this.pendingMultiplayerClient = enabled;
    if (this.engine) {
      this.engine.isMultiplayerClient = enabled;
    }
  }

  promoteToHost(): void {
    this.pendingMultiplayerClient = false;
    this.pendingMultiplayerHost = true;
    if (this.engine) {
      this.engine.isMultiplayerClient = false;
      this.engine.isMultiplayerHost = true;
    }
  }

  getStateSnapshot(): { player: CharacterState; zombies: import('@shared/game-entities').ZombieState[]; corpses: import('@shared/game-entities').ZombieCorpse[]; floor: number; attacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }>; revives: string[]; specialDropActivations: import('@shared/game-entities').SpecialDropType[]; activeSpecialEffects: import('@shared/game-entities').ActiveSpecialEffect[]; vfxEvents: VfxEvent[]; pullEvents: Array<{ playerX: number; playerY: number; pullRange: number; skillColor: string }>; spitterProjectiles: SpitterProjectile[]; dragonProjectiles: DragonProjectile[] } | null {
    return this.engine?.getStateSnapshot() ?? null;
  }

  applyRemoteProjectiles(spitterProjectiles: SpitterProjectile[], dragonProjectiles: DragonProjectile[]): void {
    this.engine?.applyRemoteProjectiles(spitterProjectiles, dragonProjectiles);
  }

  applyRemoteZombies(zombies: import('@shared/game-entities').ZombieState[]): void {
    this.engine?.applyRemoteZombies(zombies);
  }

  applyRemoteCorpses(corpses: import('@shared/game-entities').ZombieCorpse[]): void {
    this.engine?.applyRemoteCorpses(corpses);
  }

  syncRemoteFloor(floor: number): void {
    this.engine?.syncRemoteFloor(floor);
  }

  applyRemoteSpecialEffects(effects: import('@shared/game-entities').ActiveSpecialEffect[]): void {
    this.engine?.applyRemoteSpecialEffects(effects);
  }

  applyRemoteDamage(playerId: string, events: Array<{ zombieId: string; damage: number; killed: boolean }>): void {
    this.engine?.applyRemoteDamage(playerId, events);
  }

  applyRemotePull(evt: { playerX: number; playerY: number; pullRange: number; skillColor: string }): void {
    this.engine?.applyRemotePull(evt);
  }

  applyIncomingZombieDamage(damage: number, knockbackDir: number, isPoisonAttack: boolean): void {
    this.engine?.applyIncomingZombieDamage(damage, knockbackDir, isPoisonAttack);
  }

  setRemotePlayers(players: CharacterState[]): void {
    this.engine?.setRemotePlayers(players);
  }

  activateSpecialEffect(type: SpecialDropType): void {
    this.engine?.activateSpecialEffect(type);
  }

  applyRevive(): void {
    this.engine?.applyRevive();
  }

  replayRemoteVfxEvents(events: VfxEvent[]): void {
    this.engine?.replayRemoteVfxEvents(events);
  }

  ngOnDestroy(): void {
    this.engine?.stop();
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    this.canvasRef().nativeElement.removeEventListener('mousedown', this.boundMouseDown);
    this.canvasRef().nativeElement.removeEventListener('mouseup', this.boundMouseUp);
  }

  private initEngine(): void {
    const canvas: HTMLCanvasElement = this.canvasRef().nativeElement;
    const p: CharacterState = this.player();
    this.engine = new GameEngine(canvas);
    this.engine.isMultiplayerHost = this.pendingMultiplayerHost;
    this.engine.isMultiplayerClient = this.pendingMultiplayerClient;
    this.bindEngineCallbacks();
    this.currentClassId = p.classId;
    this.engine.start({ ...p });
  }

  private restartEngine(p: CharacterState): void {
    this.engine!.stop();
    this.currentClassId = p.classId;
    this.engine!.start({ ...p });
  }

  private bindEngineCallbacks(): void {
    this.engine!.onPlayerUpdate = (p: CharacterState): void => this.playerUpdated.emit(p);
    this.engine!.onXpGained = (amount: number): void => this.xpGained.emit(amount);
    this.engine!.onScoreUpdate = (delta: number): void => this.scoreUpdated.emit(delta);
    this.engine!.onFloorUpdate = (floor: number): void => this.floorUpdated.emit(floor);
    this.engine!.onFloorComplete = (): void => this.floorCompleted.emit();
    this.engine!.onGameOver = (): void => this.gameOver.emit();
    this.engine!.onGoldPickup = (amount: number): void => this.goldPickedUp.emit(amount);
    this.engine!.onPotionPickup = (type: DropType): void => this.potionPickedUp.emit(type);
    this.engine!.onOpenShop = (): void => this.openShopRequested.emit();
    this.engine!.onUseHpPotion = (): boolean => this.useHpPotionHandler?.() ?? false;
    this.engine!.onUseMpPotion = (): boolean => this.useMpPotionHandler?.() ?? false;
    this.engine!.onZombieDamaged = (events: Array<{ zombieId: string; damage: number; killed: boolean }>): void =>
      this.zombieDamaged.emit(events);
    this.engine!.onRemotePlayerDamaged = (targetPlayerId: string, damage: number, zombieX: number, zombieY: number, knockbackDir: number, isPoisonAttack: boolean): void =>
      this.remotePlayerDamaged.emit({ targetPlayerId, damage, zombieX, zombieY, knockbackDir, isPoisonAttack });
    this.engine!.onPlayerRevived = (targetPlayerId: string): void =>
      this.playerRevived.emit(targetPlayerId);
    this.engine!.onPlayerDowned = (): void =>
      this.playerDowned.emit();
    this.engine!.onPlayerDownExpired = (): void =>
      this.playerDownExpired.emit();
  }

  private resetAllKeys(): void {
    const actions: GameAction[] = Object.keys(this.keys) as GameAction[];
    for (const action of actions) {
      this.keys[action] = false;
    }
    this.heldQuickSlotActions.clear();
    this.engine?.setKeys({ ...this.keys });
  }

  private bindInput(): void {
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    this.canvasRef().nativeElement.addEventListener('mousedown', this.boundMouseDown);
    this.canvasRef().nativeElement.addEventListener('mouseup', this.boundMouseUp);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.inputDisabled()) return;

    if (this.engine?.hasPendingSpecialDrop()) {
      const key: string = e.key.toLowerCase();
      if (key === 'y') {
        this.engine.confirmPendingDrop();
        e.preventDefault();
        return;
      }
      if (key === 'n') {
        this.engine.declinePendingDrop();
        e.preventDefault();
        return;
      }
    }

    const action: GameAction | null = this.keyBindingsService.getActionForKey(e.key);
    if (!action) return;

    if (UI_ACTIONS.has(action)) {
      this.emitUiAction(action);
      return;
    }

    if (QUICK_SLOT_ACTION_SET.has(action)) {
      this.handleQuickSlotKeyDown(action);
      e.preventDefault();
      return;
    }

    this.keys[action] = true;

    if (action === 'up' || action === 'down' || action === 'jump' || action === 'attack') {
      e.preventDefault();
    }

    this.engine?.setKeys({ ...this.keys });
  }

  private emitUiAction(action: GameAction): void {
    if (action === 'openStats') this.openStatsRequested.emit();
    else if (action === 'openSkills') this.openSkillsRequested.emit();
    else if (action === 'openShop') this.openShopRequested.emit();
    else if (action === 'openInventory') this.openInventoryRequested.emit();
  }

  private handleQuickSlotKeyDown(action: GameAction): void {
    const entry: QuickSlotEntry | null = this.quickSlotService.getEntry(action);
    if (!entry) return;

    if (entry.type === 'keybind' && !QUICK_SLOT_ACTION_SET.has(entry.id)) {
      const mappedAction: GameAction = entry.id as GameAction;
      if (UI_ACTIONS.has(mappedAction)) {
        this.emitUiAction(mappedAction);
        return;
      }
      this.keys[mappedAction] = true;
      this.heldQuickSlotActions.set(action, mappedAction);
      this.engine?.setKeys({ ...this.keys });
      return;
    }

    this.quickSlotKeyPressed.emit(action);
  }

  private onKeyUp(e: KeyboardEvent): void {
    const action: GameAction | null = this.keyBindingsService.getActionForKey(e.key);
    if (!action) return;

    if (QUICK_SLOT_ACTION_SET.has(action)) {
      const mappedAction: GameAction | undefined = this.heldQuickSlotActions.get(action);
      if (mappedAction) {
        this.keys[mappedAction] = false;
        this.heldQuickSlotActions.delete(action);
      }
    }

    this.keys[action] = false;
    this.engine?.setKeys({ ...this.keys });
  }

  private onMouseDown(): void {
    if (this.inputDisabled()) return;
    this.keys.attack = true;
    this.engine?.setKeys({ ...this.keys });
  }

  private onMouseUp(): void {
    this.keys.attack = false;
    this.engine?.setKeys({ ...this.keys });
  }
}
