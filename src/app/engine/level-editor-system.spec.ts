import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import { GameEngine } from './game-engine';
import { Gadget, Platform } from './engine-types';
import { LevelLayout, Prop } from './level-generator';
import { LevelEditorSystem } from './level-editor-system';
import { EditorField } from './level-editor';

function createMockCanvas(): HTMLCanvasElement {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const noop: () => void = vi.fn();
  const ctx: Record<string, unknown> = {
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    strokeText: noop,
    measureText: vi.fn().mockReturnValue({ width: 10 }),
    drawImage: noop,
    beginPath: noop,
    rect: noop,
    clip: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    setTransform: noop,
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    canvas,
  };
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return canvas;
}

function walls(engine: GameEngine): Platform[] {
  return engine.platforms.filter(
    (p: Platform): boolean =>
      p.solid === true &&
      !p.propId &&
      !p.puzzlePart &&
      p.height >= 2 * GAME_CONSTANTS.LEVEL_TILE_PX,
  );
}

describe('LevelEditorSystem on a real engine', () => {
  let engine: GameEngine;
  let editor: LevelEditorSystem;
  let changes: boolean[];

  beforeEach((): void => {
    engine = new GameEngine(createMockCanvas());
    editor = engine.levelEditor;
    changes = [];
    editor.onChange = (layoutChanged: boolean): void => {
      changes.push(layoutChanged);
    };
    editor.open();
  });

  it('a placed wall is solid collision at once', () => {
    editor.setTool('wall');
    editor.pointerDown(400, 600);
    editor.pointerUp();
    const placed: Platform[] = walls(engine).filter(
      (p: Platform): boolean => p.x <= 400 && p.x + p.width >= 400,
    );
    expect(placed.length).toBe(1);
    expect(placed[0].y + placed[0].height).toBe(GAME_CONSTANTS.GROUND_Y);
    expect(engine.level.walls?.length).toBe(1);
    expect(changes).toContain(true);
  });

  it('a platform placed and dragged ends where it was let go', () => {
    editor.setTool('platform');
    editor.pointerDown(640, 300);
    editor.pointerMove(800, 260);
    editor.pointerUp();
    const last: Platform = engine.level.platforms[engine.level.platforms.length - 1];
    expect(last.x + last.width / 2).toBeCloseTo(800, -1);
    expect(engine.platforms.some((p: Platform): boolean => p.x === last.x && p.y === last.y)).toBe(
      true,
    );
  });

  it('the exit hangs where it was put, at a fixed height', () => {
    editor.setTool('exit');
    editor.pointerDown(640, 200);
    editor.pointerUp();
    expect(engine.exitPlatform.y + engine.exitPlatform.height / 2).toBeCloseTo(200, -1);
    expect(engine.exitPlatform.x + engine.exitPlatform.width / 2).toBeCloseTo(640, -1);
  });

  it('a spring placed in the editor is a standalone solid launcher, no floor puzzle', () => {
    editor.setTool('spring');
    editor.pointerDown(900, 600);
    editor.pointerUp();
    expect(engine.springPuzzle).toBeNull();
    expect(engine.gadgets.map((g: Gadget): string => g.kind)).toEqual(['spring']);
    expect(
      engine.platforms.some((p: Platform): boolean => p.gadgetId === 'g1' && p.solid === true),
    ).toBe(true);
  });

  it('the link tool wires a lever to the exit: the exit locks behind a door', () => {
    editor.setTool('lever');
    editor.pointerDown(400, 600);
    editor.pointerUp();
    expect(engine.isExitLocked()).toBe(false);
    editor.setTool('link');
    editor.pointerDown(408, 600);
    editor.pointerDown(engine.exitPlatform.x + 10, engine.exitPlatform.y + 4);
    expect(engine.isExitLocked()).toBe(true);
    expect(editor.selection()?.gadget?.wires).toEqual([{ targetId: 'exit', label: 'Exit' }]);
    editor.unwire('exit');
    expect(engine.isExitLocked()).toBe(false);
  });

  it('a middle click opens the thing under it to adjust; a change plays at once', () => {
    editor.setTool('slingshot');
    editor.pointerDown(600, 600);
    editor.pointerUp();
    editor.setTool('platform');
    editor.inspect(608, 610, 300, 200);
    expect(editor.inspector()).toMatchObject({ label: 'Slingshot g1', clientX: 300, clientY: 200 });
    expect(editor.inspector()?.fields.map((f: EditorField): string => f.key)).toEqual([
      'power',
      'angle',
      'width',
    ]);
    editor.setField('angle', 150);
    expect(engine.gadgets[0]).toMatchObject({ angle: 150 });
    // A click on the map (or on nothing) closes it.
    editor.inspect(1000, 100, 0, 0);
    expect(editor.inspector()).toBeNull();
  });

  it('the popup opens on the selection without a middle click (phones), and not on nothing', () => {
    editor.clear();
    editor.inspectSelected(40, 50);
    expect(editor.inspector()).toBeNull();
    editor.setTool('spring');
    editor.pointerDown(900, 600);
    editor.pointerUp();
    editor.inspectSelected(40, 50);
    expect(editor.inspector()).toMatchObject({ label: 'Spring g1', clientX: 40, clientY: 50 });
  });

  it('undo goes back a step at a time and redo forward again; a drag is one step', () => {
    const walls: () => number = (): number => engine.level.walls?.length ?? 0;
    const platforms: () => number = (): number => engine.level.platforms.length;
    editor.clear();
    editor.setTool('wall');
    editor.pointerDown(300, 600);
    editor.pointerUp();
    editor.setTool('platform');
    editor.pointerDown(700, 300);
    editor.pointerMove(720, 280);
    editor.pointerMove(760, 260);
    editor.pointerUp();
    expect([walls(), platforms()]).toEqual([1, 1]);
    editor.undo();
    expect([walls(), platforms()], 'placing and dragging the platform undone in one step').toEqual([
      1, 0,
    ]);
    editor.undo();
    expect([walls(), platforms()]).toEqual([0, 0]);
    expect(editor.canRedo()).toBe(true);
    editor.redo();
    editor.redo();
    expect([walls(), platforms()]).toEqual([1, 1]);
    expect(engine.level.platforms[0].x + engine.level.platforms[0].width / 2).toBeCloseTo(760, -1);
    // A new step drops what could be redone.
    editor.undo();
    editor.setTool('wall');
    editor.pointerDown(900, 600);
    expect(editor.canRedo()).toBe(false);
  });

  it('undo keeps the last 30 steps', () => {
    editor.setTool('wall');
    for (let i: number = 0; i < 40; i++) {
      editor.pointerDown(40 + i * 30, 600);
      editor.pointerUp();
    }
    let steps: number = 0;
    while (editor.canUndo()) {
      editor.undo();
      steps++;
    }
    expect(steps).toBe(GAME_CONSTANTS.DEV_EDITOR_HISTORY_STEPS);
  });

  it('the hanging exit can be erased; with no exit door the editor says there is no way out', () => {
    expect(editor.hasWayOut()).toBe(true);
    editor.eraseAt(engine.exitPlatform.x + 8, engine.exitPlatform.y + 4);
    expect(engine.exitPlatform.y).toBeLessThan(0);
    expect(editor.hasWayOut()).toBe(false);
    editor.undo();
    expect(engine.exitPlatform.y).toBeGreaterThan(0);
  });

  it('notes go into the export without rebuilding the floor', () => {
    const lying: number = engine.looseProps.length;
    editor.setNotes('Hit the lever, then run.');
    expect(JSON.parse(editor.exportJson()).notes).toBe('Hit the lever, then run.');
    expect(engine.looseProps.length).toBe(lying);
    expect(changes).toContain(true);
  });

  it('select and right-click erase take things away', () => {
    const lying: number = engine.looseProps.length;
    editor.setTool('box1');
    editor.pointerDown(900, 500);
    editor.pointerUp();
    expect(engine.looseProps.length).toBe(lying + 1);
    const before: number = engine.level.props.length;
    const prop: Prop = engine.level.props[before - 1];
    editor.eraseAt(prop.x + 2, prop.y + 2);
    expect(engine.level.props.length).toBe(before - 1);
  });

  it('export, then import on another engine, plays the same floor', () => {
    editor.setTool('wall');
    editor.pointerDown(300, 600);
    editor.setTool('crack-wall');
    editor.pointerDown(700, 600);
    editor.setTool('lever');
    editor.pointerDown(900, 600);
    editor.setTool('door');
    editor.pointerDown(1100, 600);
    editor.setTool('link');
    editor.pointerDown(908, 600);
    editor.pointerDown(1110, 560);
    const json: string = editor.exportJson();
    const other: GameEngine = new GameEngine(createMockCanvas());
    other.levelEditor.open();
    expect(other.levelEditor.importJson(json)).toBeNull();
    const a: LevelLayout = { ...engine.level, seed: 0 };
    const b: LevelLayout = { ...other.level, seed: 0 };
    expect(b.walls).toEqual(a.walls);
    expect(b.gadgets).toEqual(a.gadgets);
    expect(other.gadgets.length).toBe(3);
    const solids: (e: GameEngine) => Platform[] = (e: GameEngine): Platform[] =>
      e.platforms.filter((p: Platform): boolean => p.puzzlePart === 'gadget');
    expect(solids(other)).toEqual(solids(engine));
  });

  it('a bad import is refused and changes nothing', () => {
    const before: LevelLayout = structuredClone(engine.level);
    expect(editor.importJson('{"floor": 1}')).toContain('exitX');
    expect(engine.level).toEqual(before);
  });

  it('reset goes back to the generated floor', () => {
    editor.setTool('wall');
    editor.pointerDown(300, 600);
    editor.resetToGenerated();
    expect(engine.level.walls).toBeUndefined();
    expect(engine.level.exitY).toBeUndefined();
  });

  it('the design is for its floor only: the next floor is generated', () => {
    editor.setTool('wall');
    editor.pointerDown(300, 600);
    engine.floor = 2;
    engine.applyLevel();
    expect(engine.level.walls).toBeUndefined();
    expect(engine.boulderPuzzle).not.toBeNull();
  });

  it('online it does nothing (floors come from the host seed)', () => {
    const online: GameEngine = new GameEngine(createMockCanvas());
    online.isMultiplayerHost = true;
    online.levelEditor.open();
    online.levelEditor.setTool('wall');
    online.levelEditor.pointerDown(300, 600);
    expect(online.level.walls).toBeUndefined();
    expect(online.levelEditor.importJson(editor.exportJson())).toBe('Solo only');
  });
});
