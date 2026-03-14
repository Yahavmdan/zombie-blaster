import { Component, ChangeDetectionStrategy, WritableSignal, Signal, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import {
  CharacterClass,
  CharacterClassDefinition,
  CHARACTER_CLASSES,
  CLASS_STAT_WEIGHTS,
  ClassStatWeights,
  SKILLS,
  SkillDefinition,
} from '@shared/index';
import { GameStateService } from '../../services/game-state.service';

@Component({
  selector: 'app-character-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  host: {
    class: 'character-select',
  },
  templateUrl: './character-select.component.html',
  styleUrl: './character-select.component.css',
})
export class CharacterSelectComponent {
  readonly nameControl: FormControl<string> = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2), Validators.maxLength(16)],
  });

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
    return this.selectedClass() !== null && this.nameControl.valid;
  });

  constructor(
    private readonly router: Router,
    private readonly gameState: GameStateService,
  ) {}

  selectClass(classId: CharacterClass): void {
    this.selectedClass.set(classId);
  }

  goBack(): void {
    void this.router.navigate(['/']);
  }

  startGame(): void {
    const classId: CharacterClass | null = this.selectedClass();
    if (!classId || !this.nameControl.valid) return;

    this.gameState.createPlayer(this.nameControl.value, classId);
    void this.router.navigate(['/game']);
  }
}
