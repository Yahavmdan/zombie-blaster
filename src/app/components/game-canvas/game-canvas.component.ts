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
  computed,
  isDevMode,
} from '@angular/core';
import { CharacterClass, CharacterState, GAME_CONSTANTS, SkillDefinition, VfxEvent, getUsableSkills } from '@shared/index';
import { BoulderState, CagePuzzleState, DropType, LooseProp, PlateState, SpringState, QUICK_SLOT_ACTION_SET, QuickSlotEntry, SpecialDropType } from '@shared/game-entities';
import { GameAction, KeyBindings } from '@shared/messages';
import { GameEngine } from '../../engine/game-engine';
import { SpitterProjectile, DragonProjectile } from '../../engine/engine-types';
import { InputKeys } from '@shared/messages';
import { KeyBindingsService, bindingKey, formatKeyName, isTapOnReleaseKey, mouseButtonKey } from '../../services/key-bindings.service';
import { GameStateService } from '../../services/game-state.service';
import { QuickSlotService } from '../../services/quick-slot.service';
import { attachEngineProbe } from '../../testing/e2e-hooks';

const UI_ACTIONS: Set<string> = new Set<string>(['openStats', 'openSkills', 'openShop', 'openInventory']);
/** Answer the special-drop prompt; they never reach the engine as held keys. */
const DROP_PROMPT_ACTIONS: Set<string> = new Set<string>(['confirmDrop', 'declineDrop']);

/** Typing in a dialog's text field must not toggle dialogs. */
function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

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
  /** While input is disabled by a dialog, its keys (P/O/B/I) still close it or switch to another one. */
  readonly dialogKeysEnabled: InputSignal<boolean> = input<boolean>(false);

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

  /** Key shown in the canvas's carry prompt (follows rebinding). */
  private readonly carryKeyLabel: Signal<string> = computed((): string => {
    const keys: string[] = this.keyBindingsService.bindings().carry;
    return keys.length > 0 ? formatKeyName(keys[0]) : '?';
  });

  /** Keys shown in the special-drop prompt (follow rebinding). */
  private readonly dropPromptKeyLabels: Signal<{ confirm: string; decline: string }> = computed(
    (): { confirm: string; decline: string } => {
      const b: KeyBindings = this.keyBindingsService.bindings();
      const label: (keys: string[]) => string = (keys: string[]): string => (keys.length > 0 ? formatKeyName(keys[0]) : '?');
      return { confirm: label(b.confirmDrop), decline: label(b.declineDrop) };
    },
  );

  readonly canvasRef: Signal<ElementRef<HTMLCanvasElement>> = viewChild.required<ElementRef<HTMLCanvasElement>>('gameCanvas');

  private engine: GameEngine | null = null;
  private detachE2eProbe: (() => void) | null = null;
  private currentClassId: CharacterClass | null = null;
  private pendingMultiplayerHost: boolean = false;
  private pendingMultiplayerClient: boolean = false;
  private keys: InputKeys = { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false, skill3: false, skill4: false, skill5: false, skill6: false, skill7: false, openStats: false, openSkills: false, useHpPotion: false, useMpPotion: false, openShop: false, openInventory: false, revive: false, carry: false, confirmDrop: false, declineDrop: false, quickSlot1: false, quickSlot2: false, quickSlot3: false, quickSlot4: false, quickSlot5: false, quickSlot6: false, quickSlot7: false, quickSlot8: false, quickSlot9: false, quickSlot10: false, quickSlot11: false, quickSlot12: false };
  private readonly boundKeyDown: (e: KeyboardEvent) => void = (e: KeyboardEvent): void => this.onKeyDown(e);
  private readonly boundKeyUp: (e: KeyboardEvent) => void = (e: KeyboardEvent): void => this.onKeyUp(e);
  /** Switching tabs or windows swallows the key-ups: let go of everything so nothing stays held. */
  private readonly boundBlur: () => void = (): void => this.resetAllKeys();
  private readonly boundMouseDown: (e: MouseEvent) => void = (e: MouseEvent): void => this.onMouseDown(e);
  private readonly boundMouseUp: (e: MouseEvent) => void = (e: MouseEvent): void => this.onMouseUp(e);
  private readonly boundContextMenu: (e: MouseEvent) => void = (e: MouseEvent): void => this.onContextMenu(e);
  private readonly heldQuickSlotActions: Map<string, GameAction> = new Map<string, GameAction>();
  /** Physical key (e.code) -> binding key it pressed: its release lets go of the same action, whatever modifiers changed meanwhile. */
  private readonly heldKeysByCode: Map<string, string> = new Map<string, string>();
  /** A tap-on-release key (Alt) is down and nothing else was pressed since: it acts when let go. */
  private pendingTapKey: string | null = null;

  constructor() {
    afterNextRender((): void => {
      this.initEngine();
      this.bindInput();
    });

    effect((): void => {
      const label: string = this.carryKeyLabel();
      if (this.engine) this.engine.carryKeyLabel = label;
    });

    effect((): void => {
      const labels: { confirm: string; decline: string } = this.dropPromptKeyLabels();
      if (this.engine) this.engine.dropPromptKeyLabels = labels;
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

  syncLayoutSeed(seed: number): void {
    this.engine?.syncLayoutSeed(seed);
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

  drinkQuickSlotPotion(drink: () => boolean): boolean {
    return this.engine?.drinkQuickSlotPotion(drink) ?? false;
  }

  triggerQuickSlotSkill(skillId: string): void {
    const p: CharacterState | null = this.gameState.player();
    if (!p) return;
    const usableSkills: SkillDefinition[] = getUsableSkills(p.classId, p.skillLevels);

    const idx: number = usableSkills.findIndex((s: SkillDefinition): boolean => s.id === skillId);
    if (idx === -1) return;

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

  demoteToGuest(): void {
    this.pendingMultiplayerHost = false;
    this.pendingMultiplayerClient = true;
    if (this.engine) {
      this.engine.isMultiplayerHost = false;
      this.engine.isMultiplayerClient = true;
    }
  }

  getStateSnapshot(): { player: CharacterState; zombies: import('@shared/game-entities').ZombieState[]; corpses: import('@shared/game-entities').ZombieCorpse[]; props: LooseProp[]; floor: number; layoutSeed: number; boulder: BoulderState | null; spring: SpringState | null; cages: CagePuzzleState | null; plate: PlateState | null; attacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }>; revives: string[]; specialDropActivations: import('@shared/game-entities').SpecialDropType[]; activeSpecialEffects: import('@shared/game-entities').ActiveSpecialEffect[]; vfxEvents: VfxEvent[]; pullEvents: Array<{ playerX: number; playerY: number; pullRange: number; skillColor: string }>; spitterProjectiles: SpitterProjectile[]; dragonProjectiles: DragonProjectile[] } | null {
    return this.engine?.getStateSnapshot() ?? null;
  }

  applyRemoteProjectiles(spitterProjectiles: SpitterProjectile[], dragonProjectiles: DragonProjectile[]): void {
    this.engine?.applyRemoteProjectiles(spitterProjectiles, dragonProjectiles);
  }

  applyRemoteZombies(zombies: import('@shared/game-entities').ZombieState[]): void {
    this.engine?.applyRemoteZombies(zombies);
  }

  applyRemoteProps(props: LooseProp[]): void {
    this.engine?.applyRemoteProps(props);
  }

  applyRemoteCorpses(corpses: import('@shared/game-entities').ZombieCorpse[]): void {
    this.engine?.applyRemoteCorpses(corpses);
  }

  applyRemoteBoulder(state: BoulderState | null): void {
    this.engine?.applyRemoteBoulder(state);
  }

  applyRemoteSpring(state: SpringState | null): void {
    this.engine?.applyRemoteSpring(state);
  }

  applyRemoteCages(state: CagePuzzleState | null): void {
    this.engine?.applyRemoteCages(state);
  }

  applyRemotePlate(state: PlateState | null): void {
    this.engine?.applyRemotePlate(state);
  }

  syncRemoteFloor(floor: number): void {
    this.engine?.syncRemoteFloor(floor);
  }

  applyRemoteSpecialEffects(effects: import('@shared/game-entities').ActiveSpecialEffect[]): void {
    this.engine?.applyRemoteSpecialEffects(effects);
  }

  applyRemoteDamage(events: Array<{ zombieId: string; damage: number; killed: boolean }>): void {
    this.engine?.applyRemoteDamage(events);
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

  applyRemoteSpecialEffect(type: SpecialDropType): void {
    this.engine?.applyRemoteSpecialEffect(type);
  }

  applyRevive(): void {
    this.engine?.applyRevive();
  }

  replayRemoteVfxEvents(events: VfxEvent[]): void {
    this.engine?.replayRemoteVfxEvents(events);
  }

  ngOnDestroy(): void {
    this.engine?.stop();
    this.detachE2eProbe?.();
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('blur', this.boundBlur);
    window.removeEventListener('mouseup', this.boundMouseUp);
    this.canvasRef().nativeElement.removeEventListener('mousedown', this.boundMouseDown);
    this.canvasRef().nativeElement.removeEventListener('contextmenu', this.boundContextMenu);
  }

  private initEngine(): void {
    const canvas: HTMLCanvasElement = this.canvasRef().nativeElement;
    const p: CharacterState = this.player();
    this.engine = new GameEngine(canvas);
    this.engine.isMultiplayerHost = this.pendingMultiplayerHost;
    this.engine.isMultiplayerClient = this.pendingMultiplayerClient;
    this.engine.carryKeyLabel = this.carryKeyLabel();
    this.engine.dropPromptKeyLabels = this.dropPromptKeyLabels();
    if (isDevMode()) {
      this.detachE2eProbe = attachEngineProbe(this.engine);
    }
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
    this.heldKeysByCode.clear();
    this.pendingTapKey = null;
    this.engine?.setKeys({ ...this.keys });
  }

  private bindInput(): void {
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('blur', this.boundBlur);
    // Mouse presses count only on the canvas (HUD buttons stay clickable); releases count anywhere so nothing stays held.
    window.addEventListener('mouseup', this.boundMouseUp);
    this.canvasRef().nativeElement.addEventListener('mousedown', this.boundMouseDown);
    this.canvasRef().nativeElement.addEventListener('contextmenu', this.boundContextMenu);
  }

  private onKeyDown(e: KeyboardEvent): void {
    const key: string = bindingKey(e);
    if (!isTapOnReleaseKey(key)) this.pendingTapKey = null;

    // A held key auto-repeats: panel keys and prompt answers act once per press, not on every repeat.
    if (e.repeat && this.isOneShotKey(key)) {
      e.preventDefault();
      return;
    }

    // The prompt runs on a timer while the game goes on, so it answers with the stats, skills,
    // shop or inventory open too (not under settings, where keys are being rebound).
    if (this.dialogKeysEnabled() && !isTextField(e.target) && this.answerDropPrompt(key)) {
      e.preventDefault();
      return;
    }

    if (this.inputDisabled()) {
      if (this.dialogKeysEnabled() && !isTextField(e.target)) this.pressDialogKey(e, key);
      return;
    }

    // Alt also starts Alt+Tab and AltGr: its action waits for a clean release (see onKeyUp).
    if (isTapOnReleaseKey(key) && this.keyBindingsService.getActionForKey(key)) {
      if (!e.repeat) this.pendingTapKey = key;
      e.preventDefault();
      return;
    }

    // Bound keys never reach the browser: attacking on Control while moving would otherwise
    // fire shortcuts (Ctrl+A select-all, Ctrl+D bookmark, Ctrl+P print, ...).
    if (this.pressBinding(key)) {
      this.heldKeysByCode.set(e.code, key);
      e.preventDefault();
    }
  }

  private isOneShotKey(key: string): boolean {
    const action: GameAction | null = this.keyBindingsService.getActionForKey(key);
    return action !== null && (UI_ACTIONS.has(action) || DROP_PROMPT_ACTIONS.has(action));
  }

  /** Confirms or declines a pending special drop if `key` is bound to that. Returns whether it answered. */
  private answerDropPrompt(key: string): boolean {
    if (!this.engine?.hasPendingSpecialDrop()) return false;
    const action: GameAction | null = this.keyBindingsService.getActionForKey(key);
    if (action === 'confirmDrop') this.engine.confirmPendingDrop();
    else if (action === 'declineDrop') this.engine.declinePendingDrop();
    else return false;
    return true;
  }

  /** Presses whatever action a key or mouse button is bound to. Returns false when it is unbound. */
  private pressBinding(key: string): boolean {
    const action: GameAction | null = this.keyBindingsService.getActionForKey(key);
    if (!action) return false;
    if (DROP_PROMPT_ACTIONS.has(action)) return true;

    if (UI_ACTIONS.has(action)) {
      this.emitUiAction(action);
      return true;
    }

    if (QUICK_SLOT_ACTION_SET.has(action)) {
      this.handleQuickSlotKeyDown(action);
      return true;
    }

    this.keys[action] = true;
    this.engine?.setKeys({ ...this.keys });
    return true;
  }

  private pressDialogKey(e: KeyboardEvent, key: string): void {
    const action: GameAction | null = this.keyBindingsService.getActionForKey(key);
    if (!action || !UI_ACTIONS.has(action)) return;
    this.emitUiAction(action);
    e.preventDefault();
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
    const key: string = this.heldKeysByCode.get(e.code) ?? bindingKey(e);
    this.heldKeysByCode.delete(e.code);
    if (this.pendingTapKey !== null && this.pendingTapKey === key) {
      this.pendingTapKey = null;
      if (this.inputDisabled() || !this.pressBinding(key)) return;
      setTimeout((): void => {
        this.releaseBinding(key);
      }, GAME_CONSTANTS.INPUT_TAP_PULSE_MS);
      return;
    }
    this.releaseBinding(key);
  }

  /** Releases whatever action a key or mouse button is bound to. Returns false when it is unbound. */
  private releaseBinding(key: string): boolean {
    const action: GameAction | null = this.keyBindingsService.getActionForKey(key);
    if (!action) return false;

    if (QUICK_SLOT_ACTION_SET.has(action)) {
      const mappedAction: GameAction | undefined = this.heldQuickSlotActions.get(action);
      if (mappedAction) {
        this.keys[mappedAction] = false;
        this.heldQuickSlotActions.delete(action);
      }
    }

    this.keys[action] = false;
    this.engine?.setKeys({ ...this.keys });
    return true;
  }

  private onMouseDown(e: MouseEvent): void {
    const key: string | null = mouseButtonKey(e.button);
    if (key && this.dialogKeysEnabled() && this.answerDropPrompt(key)) {
      e.preventDefault();
      return;
    }
    if (this.inputDisabled()) return;
    // preventDefault stops middle-click autoscroll on a bound button.
    if (key && this.pressBinding(key)) e.preventDefault();
  }

  private onMouseUp(e: MouseEvent): void {
    const key: string | null = mouseButtonKey(e.button);
    // preventDefault on a bound side button stops the browser navigating back/forward out of the game.
    if (key && this.releaseBinding(key)) e.preventDefault();
  }

  private onContextMenu(e: MouseEvent): void {
    if (this.keyBindingsService.getActionForKey('mouseright')) e.preventDefault();
  }
}
