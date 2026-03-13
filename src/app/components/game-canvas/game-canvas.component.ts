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
import { CharacterState, KeyBindings } from '@shared/index';
import { GameAction } from '@shared/messages';
import { GameEngine } from '../../engine/game-engine';
import { InputKeys } from '@shared/messages';
import { KeyBindingsService, formatKeyName } from '../../services/key-bindings.service';

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

  readonly player: InputSignal<CharacterState> = input.required<CharacterState>();
  readonly inputDisabled: InputSignal<boolean> = input<boolean>(false);

  readonly playerUpdated: OutputEmitterRef<CharacterState> = output<CharacterState>();
  readonly xpGained: OutputEmitterRef<number> = output<number>();
  readonly scoreUpdated: OutputEmitterRef<number> = output<number>();
  readonly waveUpdated: OutputEmitterRef<{ wave: number; remaining: number }> = output<{ wave: number; remaining: number }>();
  readonly gameOver: OutputEmitterRef<void> = output<void>();

  readonly canvasRef: Signal<ElementRef<HTMLCanvasElement>> = viewChild.required<ElementRef<HTMLCanvasElement>>('gameCanvas');

  private engine: GameEngine | null = null;
  private keys: InputKeys = { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false };
  private readonly boundKeyDown: (e: KeyboardEvent) => void = (e: KeyboardEvent): void => this.onKeyDown(e);
  private readonly boundKeyUp: (e: KeyboardEvent) => void = (e: KeyboardEvent): void => this.onKeyUp(e);
  private readonly boundMouseDown: () => void = (): void => this.onMouseDown();
  private readonly boundMouseUp: () => void = (): void => this.onMouseUp();

  constructor() {
    afterNextRender(() => {
      this.initEngine();
      this.bindInput();
      this.syncControlLabels(this.keyBindingsService.bindings());
    });

    effect((): void => {
      const bindings: KeyBindings = this.keyBindingsService.bindings();
      this.syncControlLabels(bindings);
    });
  }

  syncProgression(player: CharacterState): void {
    this.engine?.syncProgression(player);
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
    this.engine = new GameEngine(canvas);

    this.engine.onPlayerUpdate = (p: CharacterState) => this.playerUpdated.emit(p);
    this.engine.onXpGained = (amount: number) => this.xpGained.emit(amount);
    this.engine.onScoreUpdate = (delta: number) => this.scoreUpdated.emit(delta);
    this.engine.onWaveUpdate = (wave: number, remaining: number) => this.waveUpdated.emit({ wave, remaining });
    this.engine.onGameOver = () => this.gameOver.emit();

    this.engine.start({ ...this.player() });
  }

  private bindInput(): void {
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    this.canvasRef().nativeElement.addEventListener('mousedown', this.boundMouseDown);
    this.canvasRef().nativeElement.addEventListener('mouseup', this.boundMouseUp);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.inputDisabled()) return;

    const action: GameAction | null = this.keyBindingsService.getActionForKey(e.key);
    if (!action) return;

    this.keys[action] = true;

    if (action === 'up' || action === 'down' || action === 'jump') {
      e.preventDefault();
    }

    this.engine?.setKeys({ ...this.keys });
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (this.inputDisabled()) return;

    const action: GameAction | null = this.keyBindingsService.getActionForKey(e.key);
    if (!action) return;

    this.keys[action] = false;
    this.engine?.setKeys({ ...this.keys });
  }

  private onMouseDown(): void {
    if (this.inputDisabled()) return;
    this.keys.attack = true;
    this.engine?.setKeys({ ...this.keys });
  }

  private onMouseUp(): void {
    if (this.inputDisabled()) return;
    this.keys.attack = false;
    this.engine?.setKeys({ ...this.keys });
  }

  private syncControlLabels(bindings: KeyBindings): void {
    if (!this.engine) return;

    const fmt = (keys: string[]): string => keys.map((k: string) => formatKeyName(k)).join('/');

    this.engine.setControlKeyDisplay({
      move: `${fmt(bindings.left)}/${fmt(bindings.right)}  Move`,
      jump: `${fmt(bindings.up)}/${fmt(bindings.jump)}  Jump`,
      climb: `${fmt(bindings.up)}/${fmt(bindings.down)} on rope  Climb`,
      attack: `${fmt(bindings.attack)} or Click  Attack`,
      skill1Key: formatKeyName(bindings.skill1[0] ?? 'k'),
      skill2Key: formatKeyName(bindings.skill2[0] ?? 'l'),
    });
  }
}
