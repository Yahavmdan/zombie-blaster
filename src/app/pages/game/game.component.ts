import { Component, ChangeDetectionStrategy, WritableSignal, Signal, signal, inject, OnInit, OnDestroy, viewChild, effect, NgZone, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CharacterState, CharacterStats, SkillDefinition, GameMode, ServerMessageType, ClientMessageType } from '@shared/index';
import type { ServerMessage, ZombieDamagePayload, RemoteZombieDamagePayload, ZombieAttackPlayerPayload, PlayerLeftPayload } from '@shared/multiplayer';
import { ShopPurchase, ZombieCorpse, ZombieState } from '@shared/game-entities';
import { GameStateService } from '../../services/game-state.service';
import { WebSocketService } from '../../services/websocket.service';
import { GameCanvasComponent } from '../../components/game-canvas/game-canvas.component';
import { HudComponent } from '../../components/hud/hud.component';
import { SettingsComponent } from '../../components/settings/settings.component';
import { StatAllocationComponent } from '../../components/stat-allocation/stat-allocation.component';
import { SkillTreeComponent } from '../../components/skill-tree/skill-tree.component';
import { ShopComponent } from '../../components/shop/shop.component';

export interface LevelUpToast {
  oldLevel: number;
  newLevel: number;
}

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameCanvasComponent, HudComponent, SettingsComponent, StatAllocationComponent, SkillTreeComponent, ShopComponent],
  host: {
    class: 'game-page',
  },
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent implements OnInit, OnDestroy {
  private readonly gameState: GameStateService = inject(GameStateService);
  private readonly router: Router = inject(Router);
  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly ws: WebSocketService = inject(WebSocketService);
  private readonly zone: NgZone = inject(NgZone);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);
  private readonly gameCanvas: Signal<GameCanvasComponent | undefined> = viewChild(GameCanvasComponent);

  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isMultiplayer: boolean = false;
  private isHost: boolean = false;
  private roomId: string = '';
  private remotePlayerStates: Map<string, CharacterState> = new Map<string, CharacterState>();

  readonly player: WritableSignal<CharacterState | null> = this.gameState.player;
  readonly level: WritableSignal<number> = signal<number>(1);
  readonly score: WritableSignal<number> = signal<number>(0);
  readonly isGameOver: WritableSignal<boolean> = signal<boolean>(false);
  readonly settingsOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly statPanelOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly skillPanelOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly shopOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly currentPlayerDisplay: WritableSignal<CharacterState> = signal<CharacterState>(null!);
  readonly levelUpToast: WritableSignal<LevelUpToast | null> = signal<LevelUpToast | null>(null);
  readonly availableSkills: Signal<SkillDefinition[]> = this.gameState.availableSkills;

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
        const payload: { player: CharacterState; zombies: ZombieState[]; corpses: ZombieCorpse[]; level: number; attacks?: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }> } =
          msg.payload as { player: CharacterState; zombies: ZombieState[]; corpses: ZombieCorpse[]; level: number; attacks?: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }> };

        this.remotePlayerStates.set(payload.player.id, payload.player);

        if (!this.isHost) {
          this.gameCanvas()?.applyRemoteZombies(payload.zombies);
          this.gameCanvas()?.applyRemoteCorpses(payload.corpses ?? []);
          this.gameCanvas()?.syncRemoteLevel(payload.level);
          this.level.set(payload.level);

          if (payload.attacks && payload.attacks.length > 0) {
            const myId: string = this.gameState.player()?.id ?? '';
            for (const atk of payload.attacks) {
              if (atk.targetPlayerId === myId) {
                this.gameCanvas()?.applyIncomingZombieDamage(atk.damage, atk.knockbackDir, atk.isPoisonAttack);
              }
            }
          }
        }

        this.updateRemotePlayersOnCanvas();
      });

    this.ws.onMessage(ServerMessageType.PlayerStateBroadcast)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: { playerId: string; data: { player: CharacterState } } =
          msg.payload as { playerId: string; data: { player: CharacterState } };

        this.remotePlayerStates.set(payload.playerId, payload.data.player);
        this.updateRemotePlayersOnCanvas();
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

    this.ws.onMessage(ServerMessageType.PlayerLeft)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: PlayerLeftPayload = msg.payload as PlayerLeftPayload;
        this.remotePlayerStates.delete(payload.playerId);
        this.updateRemotePlayersOnCanvas();
      });

    this.zone.runOutsideAngular((): void => {
      const SYNC_INTERVAL_MS: number = 50;
      this.syncTimer = setInterval((): void => {
        if (!this.isMultiplayer) return;
        const canvas: GameCanvasComponent | undefined = this.gameCanvas();
        if (!canvas) return;

        const snapshot: { player: CharacterState; zombies: ZombieState[]; corpses: ZombieCorpse[]; level: number; attacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }> } | null =
          canvas.getStateSnapshot();
        if (!snapshot) return;

        if (this.isHost) {
          this.ws.send(ClientMessageType.GameSync, snapshot);
        } else {
          this.ws.send(ClientMessageType.PlayerState, { player: snapshot.player });
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
    const before: CharacterState | null = this.gameState.player();
    const prevLevel: number = before?.level ?? 1;
    this.gameState.addXp(amount);
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      if (updated.level > prevLevel) {
        this.showLevelUpToast(prevLevel, updated.level);
      }
      this.gameCanvas()?.syncProgression(updated);
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onScoreUpdate(delta: number): void {
    this.score.update((s: number) => s + delta);
    this.gameState.score.set(this.score());
  }

  onLevelUpdate(level: number): void {
    this.level.set(level);
    this.gameState.level.set(level);
  }

  onLevelComplete(): void {
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

  onShopClosed(): void {
    this.shopOpen.set(false);
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


  setLevel(level: number): void {
    this.level.set(level);
    this.gameState.level.set(level);
    this.gameCanvas()?.setLevel(level);
  }

  syncCanvasProgression(): void {
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.gameCanvas()?.syncProgression(updated);
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  retry(): void {
    const p: CharacterState | null = this.gameState.player();
    if (!p) return;
    this.gameState.createPlayer(p.name, p.classId);
    this.isGameOver.set(false);
    this.statPanelOpen.set(false);
    this.skillPanelOpen.set(false);
    this.shopOpen.set(false);
    this.level.set(1);
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

  private syncPlayerDisplay(): void {
    const p: CharacterState | null = this.gameState.player();
    if (p) {
      this.currentPlayerDisplay.set({ ...p });
    }
  }

  private showLevelUpToast(oldLevel: number, newLevel: number): void {
    this.levelUpToast.set({ oldLevel, newLevel });
    setTimeout((): void => {
      this.levelUpToast.set(null);
    }, 3000);
  }
}
