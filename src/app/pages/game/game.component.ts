import { Component, ChangeDetectionStrategy, WritableSignal, Signal, signal, inject, OnInit, viewChild, effect } from '@angular/core';
import { Router } from '@angular/router';
import { CharacterState, CharacterStats, SkillDefinition } from '@shared/index';
import { GameStateService } from '../../services/game-state.service';
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
export class GameComponent implements OnInit {
  private readonly gameState: GameStateService = inject(GameStateService);
  private readonly router: Router = inject(Router);
  private readonly gameCanvas: Signal<GameCanvasComponent | undefined> = viewChild(GameCanvasComponent);

  readonly player: WritableSignal<CharacterState | null> = this.gameState.player;
  readonly wave: WritableSignal<number> = signal<number>(1);
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
  }

  ngOnInit(): void {
    this.syncPlayerDisplay();
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

  onWaveUpdate(event: { wave: number; remaining: number }): void {
    this.wave.set(event.wave);
    this.gameState.wave.set(event.wave);
    this.gameState.zombiesRemaining.set(event.remaining);
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

  onShopItemPurchased(itemId: string): void {
    const success: boolean = this.gameState.buyShopItem(itemId);
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


  setWave(wave: number): void {
    this.wave.set(wave);
    this.gameState.wave.set(wave);
    this.gameCanvas()?.setWave(wave);
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
    this.wave.set(1);
    this.score.set(0);
    this.syncPlayerDisplay();
  }

  backToMenu(): void {
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
