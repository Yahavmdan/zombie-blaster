import { Component, ChangeDetectionStrategy, WritableSignal, Signal, signal, computed, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormControl, FormControlStatus, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
  CharacterClass,
  CharacterClassDefinition,
  CHARACTER_CLASSES,
  CLASS_STAT_WEIGHTS,
  ClassStatWeights,
  SKILLS,
  SkillDefinition,
  GameMode,
} from '@shared/index';
import { GameStateService } from '../../services/game-state.service';
import { KeyBindingsService } from '../../services/key-bindings.service';
import { QuickSlotService } from '../../services/quick-slot.service';
import { PixelIconComponent } from '../../ui/pixel-icon/pixel-icon.component';
import { classToSpriteSet, SpriteSet } from '../../engine/sprite-animator';

@Component({
  selector: 'app-character-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PixelIconComponent, ReactiveFormsModule],
  host: {
    class: 'character-select',
  },
  templateUrl: './character-select.component.html',
  styleUrl: './character-select.component.css',
})
export class CharacterSelectComponent implements OnInit {
  private readonly router: Router = inject(Router);
  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly gameState: GameStateService = inject(GameStateService);
  private readonly keyBindingsService: KeyBindingsService = inject(KeyBindingsService);
  private readonly quickSlotService: QuickSlotService = inject(QuickSlotService);

  readonly gameMode: WritableSignal<GameMode> = signal<GameMode>(GameMode.SinglePlayer);

  readonly nameControl: FormControl<string> = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2), Validators.maxLength(16)],
  });

  /** Signal mirror of the form's validity so computed() re-runs while typing. */
  private readonly nameValid: Signal<boolean> = toSignal(
    this.nameControl.statusChanges.pipe(map((status: FormControlStatus): boolean => status === 'VALID')),
    { initialValue: this.nameControl.valid },
  );

  readonly classList: CharacterClassDefinition[] = Object.values(CHARACTER_CLASSES);

  readonly selectedClass: WritableSignal<CharacterClass | null> = signal<CharacterClass | null>(null);

  readonly selectedClassDef: Signal<CharacterClassDefinition | null> = computed((): CharacterClassDefinition | null => {
    const id: CharacterClass | null = this.selectedClass();
    return id ? CHARACTER_CLASSES[id] : null;
  });

  readonly classSkills: Signal<SkillDefinition[]> = computed((): SkillDefinition[] => {
    const id: CharacterClass | null = this.selectedClass();
    if (!id) return [];
    return SKILLS.filter((s: SkillDefinition) => s.classId === id && s.requiredCharacterLevel <= 1);
  });

  readonly statFocus: Signal<{ primary: string; secondary: string; tip: string } | null> = computed((): { primary: string; secondary: string; tip: string } | null => {
    const id: CharacterClass | null = this.selectedClass();
    if (!id) return null;
    const w: ClassStatWeights = CLASS_STAT_WEIGHTS[id];
    const tips: Record<CharacterClass, string> = {
      [CharacterClass.Warrior]: 'Put your points in Strength to hit harder!',
      [CharacterClass.Ranger]: 'Stack Dexterity for precise, deadly shots!',
      [CharacterClass.Mage]: 'Intelligence fuels your devastating spells!',
      [CharacterClass.Assassin]: 'Luck means more crits and bigger burst damage!',
      [CharacterClass.Priest]: 'Intelligence boosts both healing and holy damage!',
    };
    return {
      primary: w.primaryStat.toUpperCase(),
      secondary: w.secondaryStat.toUpperCase(),
      tip: tips[id],
    };
  });

  readonly canStart: Signal<boolean> = computed((): boolean => {
    return this.selectedClass() !== null && this.nameValid();
  });

  readonly isMultiplayer: Signal<boolean> = computed((): boolean => {
    return this.gameMode() === GameMode.Multiplayer;
  });

  readonly startButtonLabel: Signal<string> = computed((): string => {
    return this.isMultiplayer() ? 'Find lobby' : 'Start game';
  });

  ngOnInit(): void {
    const modeParam: string | null = this.route.snapshot.queryParamMap.get('mode');
    if (modeParam === GameMode.Multiplayer) {
      this.gameMode.set(GameMode.Multiplayer);
    } else {
      this.gameMode.set(GameMode.SinglePlayer);
    }
  }

  /** CSS background for the class's in-game idle sheet (sprites/<set>/<Set>_idle.png). */
  idleSprite(classId: CharacterClass): string {
    const set: SpriteSet = classToSpriteSet(classId);
    const fileSet: string = set.charAt(0).toUpperCase() + set.slice(1);
    return `url('/sprites/${set}/${fileSet}_idle.png')`;
  }

  selectClass(classId: CharacterClass): void {
    this.selectedClass.set(classId);
  }

  goBack(): void {
    void this.router.navigate(['/']);
  }

  startGame(): void {
    const classId: CharacterClass | null = this.selectedClass();
    if (!classId || !this.nameControl.valid) return;

    this.keyBindingsService.resetToDefaults();
    this.quickSlotService.resetToDefaults();

    if (this.gameMode() === GameMode.SinglePlayer) {
      this.gameState.createPlayer(this.nameControl.value, classId);
      void this.router.navigate(['/game']);
    } else {
      void this.router.navigate(['/lobby'], {
        queryParams: {
          name: this.nameControl.value,
          classId,
        },
      });
    }
  }
}
