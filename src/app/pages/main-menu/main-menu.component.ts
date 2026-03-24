import { Component, ChangeDetectionStrategy, WritableSignal, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { GameMode } from '@shared/multiplayer';
import { SaveGameData, SaveGameSlot } from '@shared/save-game';
import { CHARACTER_CLASSES } from '@shared/game-constants';
import { CharacterClass, CharacterClassDefinition, CharacterState } from '@shared/character';
import { SaveGameService } from '../../services/save-game.service';
import { GameStateService } from '../../services/game-state.service';
import { KeyBindingsService } from '../../services/key-bindings.service';
import { QuickSlotService } from '../../services/quick-slot.service';

interface FloatingZombie {
  id: number;
  x: number;
  y: number;
  delay: number;
  opacity: number;
  emoji: string;
}

@Component({
  selector: 'app-main-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'main-menu',
  },
  templateUrl: './main-menu.component.html',
  styleUrl: './main-menu.component.css',
})
export class MainMenuComponent {
  private readonly router: Router = inject(Router);
  private readonly saveGameService: SaveGameService = inject(SaveGameService);
  private readonly gameState: GameStateService = inject(GameStateService);
  private readonly keyBindingsService: KeyBindingsService = inject(KeyBindingsService);
  private readonly quickSlotService: QuickSlotService = inject(QuickSlotService);

  showHelp: boolean = false;
  readonly loadPanelOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly savedGames: WritableSignal<SaveGameSlot[]> = signal<SaveGameSlot[]>([]);
  readonly hasAutoSave: WritableSignal<boolean> = signal<boolean>(false);
  readonly confirmDeleteSlot: WritableSignal<string | null> = signal<string | null>(null);

  readonly floatingZombies: FloatingZombie[] = Array.from(
    { length: 8 },
    (_: unknown, i: number): FloatingZombie => ({
      id: i,
      x: Math.random() * 90 + 5 + (i % 2 === 0 ? 0 : 50),
      y: Math.random() * 80 + 10,
      delay: Math.random() * 5,
      opacity: 0.15 + Math.random() * 0.15,
      emoji: ['🧟', '💀', '☠️', '👻'][i % 4],
    }),
  ).map((z: FloatingZombie): FloatingZombie => ({
    ...z,
    x: (z.x / 100) * window.innerWidth,
    y: (z.y / 100) * window.innerHeight,
  }));

  constructor() {
    this.saveGameService.clearLegacyStorage();
    this.refreshSaveState();
  }

  onSinglePlayer(): void {
    void this.router.navigate(['/character-select'], {
      queryParams: { mode: GameMode.SinglePlayer },
    });
  }

  onMultiplayer(): void {
    void this.router.navigate(['/character-select'], {
      queryParams: { mode: GameMode.Multiplayer },
    });
  }

  onContinue(): void {
    const data: SaveGameData | null = this.saveGameService.loadAutoSave();
    if (!data) return;
    this.loadAndNavigate(data);
  }

  onLoadGame(): void {
    this.refreshSaveState();
    this.loadPanelOpen.set(true);
  }

  onCloseLoadPanel(): void {
    this.loadPanelOpen.set(false);
    this.confirmDeleteSlot.set(null);
  }

  onLoadSlot(slot: SaveGameSlot): void {
    this.loadAndNavigate(slot.data);
  }

  onLoadSlotMultiplayer(slot: SaveGameSlot): void {
    this.loadSaveAndGoOnline(slot.data);
  }

  onContinueMultiplayer(): void {
    const data: SaveGameData | null = this.saveGameService.loadAutoSave();
    if (!data) return;
    this.loadSaveAndGoOnline(data);
  }

  onDeleteSlot(slot: SaveGameSlot): void {
    const current: string | null = this.confirmDeleteSlot();
    if (current === slot.key) {
      this.saveGameService.deleteSlot(slot.data.saveName);
      this.refreshSaveState();
      this.confirmDeleteSlot.set(null);
    } else {
      this.confirmDeleteSlot.set(slot.key);
    }
  }

  onDeleteAutoSave(): void {
    this.saveGameService.deleteAutoSave();
    this.refreshSaveState();
  }

  getClassName(data: SaveGameData): string {
    const def: CharacterClassDefinition | undefined = CHARACTER_CLASSES[data.classId];
    return def ? def.name : data.classId;
  }

  getClassIcon(data: SaveGameData): string {
    const def: CharacterClassDefinition | undefined = CHARACTER_CLASSES[data.classId];
    return def ? def.icon : '';
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  private loadAndNavigate(data: SaveGameData): void {
    this.applySaveToGameState(data);

    void this.router.navigate(['/game'], {
      queryParams: { loadFloor: data.floor, loadScore: data.score },
    });
  }

  private loadSaveAndGoOnline(data: SaveGameData): void {
    this.applySaveToGameState(data);

    void this.router.navigate(['/lobby'], {
      queryParams: {
        name: data.playerName,
        classId: data.classId as CharacterClass,
        fromSave: '1',
      },
    });
  }

  private applySaveToGameState(data: SaveGameData): void {
    this.gameState.createPlayer(data.playerName, data.classId);
    this.gameState.player.update((p: CharacterState | null): CharacterState | null => {
      if (!p) return p;
      return {
        ...p,
        level: data.level,
        xp: data.xp,
        xpToNext: data.xpToNext,
        allocatedStats: { ...data.allocatedStats },
        unallocatedStatPoints: data.unallocatedStatPoints,
        unallocatedSkillPoints: data.unallocatedSkillPoints,
        skillLevels: { ...data.skillLevels },
        inventory: {
          potions: { ...data.inventory.potions },
          gold: data.inventory.gold,
          autoPotionHpId: data.inventory.autoPotionHpId,
          autoPotionMpId: data.inventory.autoPotionMpId,
        },
        stats: this.gameState.getTotalStats(
          CHARACTER_CLASSES[data.classId].baseStats,
          data.allocatedStats,
        ),
        derived: this.gameState.calculateDerived(
          CHARACTER_CLASSES[data.classId].baseStats,
          data.allocatedStats,
          data.classId,
          data.level,
        ),
      };
    });

    this.gameState.player.update((p: CharacterState | null): CharacterState | null => {
      if (!p) return p;
      return { ...p, hp: p.derived.maxHp, mp: p.derived.maxMp };
    });

    this.gameState.floor.set(data.floor);
    this.gameState.score.set(data.score);

    if (data.keyBindings) {
      this.keyBindingsService.loadFromSave(data.keyBindings);
    } else {
      this.keyBindingsService.resetToDefaults();
    }

    if (data.quickSlots) {
      this.quickSlotService.loadFromSave(data.quickSlots);
    } else {
      this.quickSlotService.resetToDefaults();
    }
  }

  private refreshSaveState(): void {
    this.hasAutoSave.set(this.saveGameService.hasAutoSave());
    this.savedGames.set(this.saveGameService.listSaves());
  }
}
