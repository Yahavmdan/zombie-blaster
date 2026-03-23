import { Component, ChangeDetectionStrategy, WritableSignal, Signal, signal, inject, OnInit, OnDestroy, viewChild, effect, NgZone, DestroyRef, isDevMode, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CharacterClass, CharacterClassDefinition, CharacterState, CharacterStats, SkillDefinition, GameMode, ServerMessageType, ClientMessageType, SPECIAL_DROP_DEFINITIONS, CHARACTER_CLASSES, VfxEvent } from '@shared/index';
import { SpecialDropType, SpecialDropDefinition } from '@shared/game-entities';
import type { ServerMessage, ZombieDamagePayload, RemoteZombieDamagePayload, ZombieAttackPlayerPayload, PlayerLeftPayload, RevivePlayerPayload, ServerShuttingDownPayload } from '@shared/multiplayer';
import { ActiveSpecialEffect, ShopPurchase, ZombieCorpse, ZombieState, QuickSlotEntry, QUICK_SLOT_ACTION_SET } from '@shared/game-entities';
import { GameAction } from '@shared/messages';
import { AutoPotionChange } from '../../components/shop/shop.component';
import { GameStateService } from '../../services/game-state.service';
import { WebSocketService, ConnectionStatus } from '../../services/websocket.service';
import { GameCanvasComponent } from '../../components/game-canvas/game-canvas.component';
import { HudComponent } from '../../components/hud/hud.component';
import { SettingsComponent } from '../../components/settings/settings.component';
import { StatAllocationComponent } from '../../components/stat-allocation/stat-allocation.component';
import { SkillTreeComponent } from '../../components/skill-tree/skill-tree.component';
import { ShopComponent } from '../../components/shop/shop.component';
import { InventoryComponent } from '../../components/inventory/inventory.component';
import { QuickSlotsComponent } from '../../components/quick-slots/quick-slots.component';
import { QuickSlotService } from '../../services/quick-slot.service';

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameCanvasComponent, HudComponent, SettingsComponent, StatAllocationComponent, SkillTreeComponent, ShopComponent, InventoryComponent, QuickSlotsComponent, FormsModule],
  host: {
    class: 'game-page',
  },
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent implements OnInit, OnDestroy {
  protected readonly gameState: GameStateService = inject(GameStateService);
  private readonly router: Router = inject(Router);
  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly ws: WebSocketService = inject(WebSocketService);
  private readonly zone: NgZone = inject(NgZone);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);
  private readonly quickSlotService: QuickSlotService = inject(QuickSlotService);
  private readonly gameCanvas: Signal<GameCanvasComponent | undefined> = viewChild(GameCanvasComponent);

  private syncTimer: ReturnType<typeof setInterval> | null = null;
  protected isMultiplayer: boolean = false;
  private isHost: boolean = false;
  private roomId: string = '';
  private remotePlayerStates: Map<string, CharacterState> = new Map<string, CharacterState>();

  readonly player: WritableSignal<CharacterState | null> = this.gameState.player;
  readonly floor: WritableSignal<number> = signal<number>(1);
  readonly score: WritableSignal<number> = signal<number>(0);
  readonly isGameOver: WritableSignal<boolean> = signal<boolean>(false);
  readonly settingsOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly statPanelOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly skillPanelOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly shopOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly inventoryOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly currentPlayerDisplay: WritableSignal<CharacterState> = signal<CharacterState>(null!);
  readonly availableSkills: Signal<SkillDefinition[]> = this.gameState.availableSkills;
  readonly shutdownWarning: WritableSignal<string> = signal<string>('');

  constructor() {
    effect((): void => {
      const p: CharacterState | null = this.gameState.player();
      if (p) {
        this.currentPlayerDisplay.set({ ...p });
      }
    });
    effect((): void => {
      const canvas: GameCanvasComponent | undefined = this.gameCanvas();
      if (canvas) {
        canvas.useHpPotionHandler = (): boolean => this.gameState.useHpPotion();
        canvas.useMpPotionHandler = (): boolean => this.gameState.useMpPotion();
      }
    });
    effect((): void => {
      const enabled: boolean = this.gameState.godMode();
      const canvas: GameCanvasComponent | undefined = this.gameCanvas();
      if (canvas) {
        canvas.setGodMode(enabled);
      }
    });
    effect((): void => {
      const enabled: boolean = this.gameState.showCollisionBoxes();
      const canvas: GameCanvasComponent | undefined = this.gameCanvas();
      if (canvas) {
        canvas.setShowCollisionBoxes(enabled);
      }
    });
    effect((): void => {
      const canvas: GameCanvasComponent | undefined = this.gameCanvas();
      if (canvas && this.isMultiplayer) {
        if (this.isHost) {
          canvas.setMultiplayerHost(true);
        } else {
          canvas.setMultiplayerClient(true);
        }
      }
    });
  }

  ngOnInit(): void {
    const mode: string | null = this.route.snapshot.queryParamMap.get('mode');
    this.roomId = this.route.snapshot.queryParamMap.get('roomId') ?? '';
    this.isMultiplayer = mode === GameMode.Multiplayer && this.roomId !== '';
    this.isHost = this.route.snapshot.queryParamMap.get('isHost') === '1';

    this.syncPlayerDisplay();

    if (this.isMultiplayer) {
      const player: CharacterState | null = this.gameState.player();
      if (player) {
        this.ws.setSessionInfo({
          roomId: this.roomId,
          playerName: player.name,
          classId: player.classId,
        });
      }

      this.ws.serverShutdown$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((payload: ServerShuttingDownPayload): void => {
          const seconds: number = Math.ceil(payload.gracePeriodMs / 1000);
          this.shutdownWarning.set(`Server restarting in ${seconds}s — reconnecting automatically...`);
        });

      this.ws.status$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((status: ConnectionStatus): void => {
          if (status === 'connected' && this.shutdownWarning()) {
            this.shutdownWarning.set('');
          }
        });

      this.setupMultiplayer();
    }
  }

  ngOnDestroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.isMultiplayer && this.roomId) {
      this.ws.send(ClientMessageType.LeaveRoom, { roomId: this.roomId });
    }
  }

  private setupMultiplayer(): void {
    this.ws.onMessage(ServerMessageType.GameSync)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: { player: CharacterState; zombies: ZombieState[]; corpses: ZombieCorpse[]; floor: number; attacks?: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }>; revives?: string[]; activeSpecialEffects?: ActiveSpecialEffect[]; vfxEvents?: VfxEvent[] } =
          msg.payload as { player: CharacterState; zombies: ZombieState[]; corpses: ZombieCorpse[]; floor: number; attacks?: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }>; revives?: string[]; activeSpecialEffects?: ActiveSpecialEffect[]; vfxEvents?: VfxEvent[] };

        this.remotePlayerStates.set(payload.player.id, payload.player);

        if (!this.isHost) {
          this.gameCanvas()?.applyRemoteZombies(payload.zombies);
          this.gameCanvas()?.applyRemoteCorpses(payload.corpses ?? []);
          this.gameCanvas()?.syncRemoteFloor(payload.floor);
          this.gameCanvas()?.applyRemoteSpecialEffects(payload.activeSpecialEffects ?? []);
          this.floor.set(payload.floor);

          if (payload.attacks && payload.attacks.length > 0) {
            const myId: string = this.gameState.player()?.id ?? '';
            for (const atk of payload.attacks) {
              if (atk.targetPlayerId === myId) {
                this.gameCanvas()?.applyIncomingZombieDamage(atk.damage, atk.knockbackDir, atk.isPoisonAttack);
              }
            }
          }

          this.processIncomingRevives(payload.revives);

          if (payload.vfxEvents && payload.vfxEvents.length > 0) {
            this.gameCanvas()?.replayRemoteVfxEvents(payload.vfxEvents);
          }
        }

        this.updateRemotePlayersOnCanvas();
        this.checkAllPlayersDead();
      });

    this.ws.onMessage(ServerMessageType.PlayerStateBroadcast)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: { playerId: string; data: { player: CharacterState; revives?: string[]; specialDropActivations?: SpecialDropType[]; vfxEvents?: VfxEvent[]; pullEvents?: Array<{ playerX: number; playerY: number; pullRange: number; skillColor: string }> } } =
          msg.payload as { playerId: string; data: { player: CharacterState; revives?: string[]; specialDropActivations?: SpecialDropType[]; vfxEvents?: VfxEvent[]; pullEvents?: Array<{ playerX: number; playerY: number; pullRange: number; skillColor: string }> } };

        this.remotePlayerStates.set(payload.playerId, payload.data.player);
        this.processIncomingRevives(payload.data.revives);
        this.processIncomingSpecialDropActivations(payload.data.specialDropActivations);

        if (payload.data.vfxEvents && payload.data.vfxEvents.length > 0) {
          this.gameCanvas()?.replayRemoteVfxEvents(payload.data.vfxEvents);
        }

        if (this.isHost && payload.data.pullEvents) {
          for (const pullEvt of payload.data.pullEvents) {
            this.gameCanvas()?.applyRemotePull(pullEvt);
          }
        }

        this.updateRemotePlayersOnCanvas();
        this.checkAllPlayersDead();
      });

    if (this.isHost) {
      this.ws.onMessage(ServerMessageType.ZombieDamage)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((msg: ServerMessage): void => {
          const payload: RemoteZombieDamagePayload =
            msg.payload as RemoteZombieDamagePayload;
          this.gameCanvas()?.applyRemoteDamage(payload.events);
        });
    }

    if (!this.isHost) {
      this.ws.onMessage(ServerMessageType.ZombieAttackPlayer)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((msg: ServerMessage): void => {
          const payload: ZombieAttackPlayerPayload =
            msg.payload as ZombieAttackPlayerPayload;
          const myId: string = this.gameState.player()?.id ?? '';
          if (payload.targetPlayerId === myId) {
            this.gameCanvas()?.applyIncomingZombieDamage(
              payload.damage,
              payload.knockbackDir,
              payload.isPoisonAttack,
            );
          }
        });
    }

    this.ws.onMessage(ServerMessageType.PlayerRevived)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((): void => {
        this.applyLocalRevive();
      });

    this.ws.onMessage(ServerMessageType.PlayerLeft)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: PlayerLeftPayload = msg.payload as PlayerLeftPayload;
        this.remotePlayerStates.delete(payload.playerId);
        this.updateRemotePlayersOnCanvas();
        this.checkAllPlayersDead();
      });

    this.zone.runOutsideAngular((): void => {
      const SYNC_INTERVAL_MS: number = 50;
      this.syncTimer = setInterval((): void => {
        if (!this.isMultiplayer) return;
        const canvas: GameCanvasComponent | undefined = this.gameCanvas();
        if (!canvas) return;

        const snapshot: { player: CharacterState; zombies: ZombieState[]; corpses: ZombieCorpse[]; floor: number; attacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }>; revives: string[]; specialDropActivations: SpecialDropType[]; activeSpecialEffects: ActiveSpecialEffect[]; vfxEvents: VfxEvent[]; pullEvents: Array<{ playerX: number; playerY: number; pullRange: number; skillColor: string }> } | null =
          canvas.getStateSnapshot();
        if (!snapshot) return;

        if (this.isHost) {
          this.ws.send(ClientMessageType.GameSync, snapshot);
        } else {
          this.ws.send(ClientMessageType.PlayerState, { player: snapshot.player, revives: snapshot.revives, specialDropActivations: snapshot.specialDropActivations, vfxEvents: snapshot.vfxEvents, pullEvents: snapshot.pullEvents });
        }
      }, SYNC_INTERVAL_MS);
    });
  }

  private updateRemotePlayersOnCanvas(): void {
    const myId: string = this.gameState.player()?.id ?? '';
    const remotePlayers: CharacterState[] = [];
    for (const [id, state] of this.remotePlayerStates) {
      if (id !== myId) {
        remotePlayers.push(state);
      }
    }
    this.gameCanvas()?.setRemotePlayers(remotePlayers);
  }

  onPlayerUpdate(enginePlayer: CharacterState): void {
    const current: CharacterState | null = this.gameState.player();
    if (current) {
      const merged: CharacterState = {
        ...enginePlayer,
        level: current.level,
        xp: current.xp,
        xpToNext: current.xpToNext,
        stats: current.stats,
        derived: current.derived,
        allocatedStats: current.allocatedStats,
        unallocatedStatPoints: current.unallocatedStatPoints,
        unallocatedSkillPoints: current.unallocatedSkillPoints,
        skillLevels: current.skillLevels,
      };
      this.gameState.player.set(merged);
      this.currentPlayerDisplay.set(merged);
    } else {
      this.gameState.player.set({ ...enginePlayer });
      this.currentPlayerDisplay.set({ ...enginePlayer });
    }
  }

  onXpGained(amount: number): void {
    this.gameState.addXp(amount);
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.gameCanvas()?.syncProgression(updated);
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onScoreUpdate(delta: number): void {
    this.score.update((s: number) => s + delta);
    this.gameState.score.set(this.score());
  }

  onFloorUpdate(floor: number): void {
    this.floor.set(floor);
    this.gameState.floor.set(floor);
  }

  onFloorComplete(): void {
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onSettingsOpenChanged(isOpen: boolean): void {
    this.settingsOpen.set(isOpen);
  }

  onGameOver(): void {
    this.isGameOver.set(true);
    this.gameState.gameOver.set(true);
  }

  onStatPanelRequested(): void {
    if (this.statPanelOpen()) {
      this.statPanelOpen.set(false);
      return;
    }
    this.closeAllDialogs();
    this.statPanelOpen.set(true);
  }

  onStatAllocated(stat: keyof CharacterStats): void {
    this.gameState.allocateStatPoint(stat);
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.gameCanvas()?.syncProgression(updated);
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onAutoAllocateStats(stat: keyof CharacterStats): void {
    const p: CharacterState | null = this.gameState.player();
    if (!p) return;
    const count: number = p.unallocatedStatPoints;
    for (let i: number = 0; i < count; i++) {
      this.gameState.allocateStatPoint(stat);
    }
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.gameCanvas()?.syncProgression(updated);
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onStatPanelClosed(): void {
    this.statPanelOpen.set(false);
  }

  onSkillTreeRequested(): void {
    if (this.skillPanelOpen()) {
      this.skillPanelOpen.set(false);
      return;
    }
    this.closeAllDialogs();
    this.skillPanelOpen.set(true);
  }

  onSkillAllocated(skillId: string): void {
    this.gameState.allocateSkillPoint(skillId);
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.gameCanvas()?.syncProgression(updated);
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onSkillPanelClosed(): void {
    this.skillPanelOpen.set(false);
  }

  onShopRequested(): void {
    if (this.shopOpen()) {
      this.shopOpen.set(false);
      return;
    }
    this.closeAllDialogs();
    this.shopOpen.set(true);
  }

  onShopItemPurchased(purchase: ShopPurchase): void {
    const success: boolean = this.gameState.buyShopItem(purchase.itemId, purchase.quantity);
    if (success) {
      const updated: CharacterState | null = this.gameState.player();
      if (updated) {
        this.gameCanvas()?.syncProgression(updated);
        this.currentPlayerDisplay.set({ ...updated });
      }
    }
  }

  onAutoPotionChanged(change: AutoPotionChange): void {
    if (change.category === 'hp') {
      this.gameState.setAutoPotionHp(change.potionId);
    } else {
      this.gameState.setAutoPotionMp(change.potionId);
    }
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onShopClosed(): void {
    this.shopOpen.set(false);
  }

  onInventoryRequested(): void {
    if (this.inventoryOpen()) {
      this.inventoryOpen.set(false);
      return;
    }
    this.closeAllDialogs();
    this.inventoryOpen.set(true);
  }

  onInventoryClosed(): void {
    this.inventoryOpen.set(false);
  }

  onQuickSlotKeyPressed(action: string): void {
    const entry: QuickSlotEntry | null = this.quickSlotService.getEntry(action);
    if (!entry) return;

    if (entry.type === 'keybind') {
      if (QUICK_SLOT_ACTION_SET.has(entry.id)) return;
      this.gameCanvas()?.triggerQuickSlotAction(entry.id as GameAction);
      return;
    }

    if (entry.type === 'potion') {
      const used: boolean = this.gameState.usePotion(entry.id);
      if (used) {
        const updated: CharacterState | null = this.gameState.player();
        if (updated) {
          this.gameCanvas()?.syncProgression(updated);
          this.currentPlayerDisplay.set({ ...updated });
        }
      }
    } else if (entry.type === 'skill') {
      this.gameCanvas()?.triggerQuickSlotSkill(entry.id);
    }
  }

  onGoldPickup(amount: number): void {
    this.gameState.addGold(amount);
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onPotionPickup(): void {
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onZombieDamaged(events: Array<{ zombieId: string; damage: number; killed: boolean }>): void {
    if (!this.isMultiplayer || this.isHost) return;
    const payload: ZombieDamagePayload = {
      roomId: this.roomId,
      events,
    };
    this.ws.send(ClientMessageType.ZombieDamage, payload);
  }

  onRemotePlayerDamaged(event: { targetPlayerId: string; damage: number; zombieX: number; zombieY: number; knockbackDir: number; isPoisonAttack: boolean }): void {
    if (!this.isMultiplayer || !this.isHost) return;
    const payload: ZombieAttackPlayerPayload = {
      targetPlayerId: event.targetPlayerId,
      damage: event.damage,
      zombieX: event.zombieX,
      zombieY: event.zombieY,
      knockbackDir: event.knockbackDir,
      isPoisonAttack: event.isPoisonAttack,
    };
    this.ws.send(ClientMessageType.ZombieAttackPlayer, payload);
  }

  onPlayerRevived(targetPlayerId: string): void {
    if (!this.isMultiplayer) return;
    const payload: RevivePlayerPayload = {
      roomId: this.roomId,
      targetPlayerId,
      reviverId: this.gameState.player()?.id ?? '',
    };
    this.ws.send(ClientMessageType.RevivePlayer, payload);
  }

  private processIncomingRevives(revives: string[] | undefined): void {
    if (!revives || revives.length === 0) return;
    const myId: string = this.gameState.player()?.id ?? '';
    for (const targetId of revives) {
      if (targetId === myId) {
        this.applyLocalRevive();
        break;
      }
    }
  }

  private processIncomingSpecialDropActivations(activations: SpecialDropType[] | undefined): void {
    if (!activations || activations.length === 0) return;
    if (!this.isHost) return;
    for (const type of activations) {
      this.gameCanvas()?.activateSpecialEffect(type);
    }
  }

  private applyLocalRevive(): void {
    this.gameCanvas()?.applyRevive();
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      updated.isDown = false;
      updated.downTimer = 0;
      this.gameState.player.set({ ...updated });
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onPlayerDowned(): void {
    // Downed state is synced via normal player state broadcast
  }

  onPlayerDownExpired(): void {
    if (!this.isMultiplayer) {
      this.isGameOver.set(true);
      this.gameState.gameOver.set(true);
      return;
    }
    this.checkAllPlayersDead();
  }

  private checkAllPlayersDead(): void {
    const local: CharacterState | null = this.gameState.player();
    if (!local || !local.isDead) return;

    for (const [, state] of this.remotePlayerStates) {
      if (!state.isDead) return;
    }

    this.isGameOver.set(true);
    this.gameState.gameOver.set(true);
  }

  readonly isDev: boolean = isDevMode();
  readonly devClassList: CharacterClassDefinition[] = Object.values(CHARACTER_CLASSES);
  readonly devFloorInput: WritableSignal<number> = signal<number>(1);
  readonly devDialogOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly devPlayerLevel: Signal<number> = computed((): number => {
    const p: CharacterState | null = this.gameState.player();
    return p ? p.level : 0;
  });
  readonly godMode: WritableSignal<boolean> = this.gameState.godMode;
  readonly showCollisionBoxes: WritableSignal<boolean> = this.gameState.showCollisionBoxes;

  readonly specialDropDefs: SpecialDropDefinition[] = SPECIAL_DROP_DEFINITIONS;

  activateSpecialDrop(type: SpecialDropType): void {
    this.gameCanvas()?.activateSpecialEffect(type);
  }

  setFloor(floor: number): void {
    this.floor.set(floor);
    this.gameState.floor.set(floor);
    this.gameCanvas()?.setFloor(floor);
  }

  syncCanvasProgression(): void {
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.gameCanvas()?.syncProgression(updated);
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  toggleDevDialog(): void {
    this.devDialogOpen.update((v: boolean) => !v);
  }

  closeDevDialog(): void {
    this.devDialogOpen.set(false);
  }

  devSelectClass(classId: CharacterClass): void {
    const p: CharacterState | null = this.gameState.player();
    if (!p) return;
    this.gameState.createPlayer(p.name, classId, p.id);
    this.syncCanvasProgression();
  }

  devLevelUp(): void {
    const p: CharacterState | null = this.gameState.player();
    if (!p) return;
    this.gameState.addXp(p.xpToNext);
    this.syncCanvasProgression();
  }

  devMaxAllSkills(): void {
    this.gameState.maxAllSkills();
    this.syncCanvasProgression();
  }

  devMaxOutPlayer(): void {
    this.gameState.maxOutPlayer();
    this.syncCanvasProgression();
  }

  devSetFloor(): void {
    const floor: number = Math.max(1, this.devFloorInput());
    this.setFloor(floor);
  }

  devToggleGodMode(): void {
    this.gameState.godMode.update((v: boolean) => !v);
  }

  devToggleCollisionBoxes(): void {
    this.gameState.showCollisionBoxes.update((v: boolean) => !v);
  }

  retry(): void {
    const p: CharacterState | null = this.gameState.player();
    if (!p) return;
    this.gameState.createPlayer(p.name, p.classId);
    this.isGameOver.set(false);
    this.statPanelOpen.set(false);
    this.skillPanelOpen.set(false);
    this.shopOpen.set(false);
    this.inventoryOpen.set(false);
    this.floor.set(1);
    this.score.set(0);
    this.syncPlayerDisplay();
  }

  backToMenu(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.gameState.reset();
    void this.router.navigate(['/']);
  }

  private closeAllDialogs(): void {
    this.statPanelOpen.set(false);
    this.skillPanelOpen.set(false);
    this.shopOpen.set(false);
    this.inventoryOpen.set(false);
  }

  private syncPlayerDisplay(): void {
    const p: CharacterState | null = this.gameState.player();
    if (p) {
      this.currentPlayerDisplay.set({ ...p });
    }
  }

}
