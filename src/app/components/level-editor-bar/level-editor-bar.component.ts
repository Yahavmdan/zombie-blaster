import {
  ChangeDetectionStrategy,
  Component,
  InputSignal,
  OutputEmitterRef,
  Signal,
  WritableSignal,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { CageContent } from '../../engine/engine-types';
import { NgTemplateOutlet } from '@angular/common';
import { CAGE_CONTENTS, EditorField, EditorFieldKey, EditorTool } from '../../engine/level-editor';
import {
  EditorInspector,
  EditorSelection,
  LevelEditorSystem,
} from '../../engine/level-editor-system';
import { DraggableDialogDirective } from '../../ui/draggable-dialog.directive';
import { PixelIconComponent } from '../../ui/pixel-icon/pixel-icon.component';
import { ToolIconDirective } from './tool-icon.directive';

interface ToolButton {
  tool: EditorTool;
  label: string;
  hint: string;
}

/** The middle-click popup where it opens: by the click, kept inside the window. */
interface InspectorView {
  /** The click that opened it. */
  key: string;
  label: string;
  fields: EditorField[];
  left: number;
  top: number;
}

/** Room the popup keeps from the window's right and bottom edges (the bottom: its height plus the quick-slot tray). */
const INSPECTOR_W_PX: number = 280;
const INSPECTOR_H_PX: number = 340;
/** The popup opens this far right of and below the click. */
const INSPECTOR_OFFSET_PX: number = 12;

interface ToolGroup {
  title: string;
  tools: ToolButton[];
}

type EditorPanel = 'none' | 'export' | 'import' | 'notes';

/** The design autosaved in this browser, so a reload (or a dev server rebuild) doesn't lose it. */
const DRAFT_KEY: string = 'zb-level-editor-draft';

const PROP_HINT: string = 'Click: drops it onto the surface below. Rails: drag a side to resize';

const TOOL_GROUPS: ToolGroup[] = [
  {
    title: 'Map',
    tools: [
      {
        tool: 'select',
        label: 'Select',
        hint: 'Click to select, drag to move, drag a side to resize. Middle click adjusts it (size, strength, weight). Right click erases',
      },
      {
        tool: 'erase',
        label: 'Erase',
        hint: 'Click a thing to take it away (right click does it with any tool)',
      },
      {
        tool: 'link',
        label: 'Link',
        hint: 'Click a button, scale or lever, then click springs, slingshots, doors or the exit to wire them to it (click again to unwire)',
      },
      {
        tool: 'platform',
        label: 'Platform',
        hint: 'Click: a platform there. Keep holding to drag it into place',
      },
      {
        tool: 'ladder',
        label: 'Ladder',
        hint: 'Click a platform: a ladder from it down to the surface below',
      },
      {
        tool: 'wall',
        label: 'Wall',
        hint: 'Click: a solid wall standing on the surface below. Drag its top or sides to size it',
      },
      {
        tool: 'safe-spot',
        label: 'Safe spot',
        hint: 'Click: the safe spot moves here (zombies never reach it)',
      },
      {
        tool: 'exit',
        label: 'Exit',
        hint: 'Click: the exit hangs here, at this height. Wire a source to it (Link) to lock it behind a door',
      },
    ],
  },
  {
    title: 'Props',
    tools: [
      { tool: 'barrel1', label: 'Barrel 1', hint: PROP_HINT },
      { tool: 'barrel2', label: 'Barrel 2', hint: PROP_HINT },
      { tool: 'barrel3', label: 'Barrel 3', hint: PROP_HINT },
      { tool: 'box1', label: 'Box 1', hint: PROP_HINT },
      { tool: 'box2', label: 'Box 2', hint: PROP_HINT },
      { tool: 'box3', label: 'Box 3', hint: PROP_HINT },
      { tool: 'locker1', label: 'Locker 1', hint: PROP_HINT },
      { tool: 'locker2', label: 'Locker 2', hint: PROP_HINT },
      { tool: 'rail', label: 'Rail', hint: PROP_HINT },
    ],
  },
  {
    title: 'Gadgets',
    tools: [
      {
        tool: 'boulder',
        label: 'Boulder',
        hint: 'Click: a boulder on the surface below. Swing at it to roll it; fast it crushes zombies and breaks crack bands. It weighs 600 kg',
      },
      {
        tool: 'crack-wall',
        label: 'Cracked wall',
        hint: 'Click: a stone wall with a crack band. Drag the band lines to set where it breaks: swings there, a barrel blast or a fast boulder',
      },
      {
        tool: 'button',
        label: 'Button',
        hint: 'Click a surface: a floor button set into it, on while its kg rest on it. Wire it with Link',
      },
      {
        tool: 'scale',
        label: 'Scale',
        hint: 'Click a surface: a scale, on while its kg rest on it. Wire it with Link',
      },
      {
        tool: 'lever',
        label: 'Lever',
        hint: 'Click: a lever. Every swing flips it on or off. Wire it with Link',
      },
      {
        tool: 'spring',
        label: 'Spring',
        hint: 'Click: a spring pad. Wired, it fires as the signal comes on; unwired, when something lands on it',
      },
      {
        tool: 'slingshot',
        label: 'Slingshot',
        hint: 'Click: a slingshot. Set power and angle below; the dots show where a boulder flies. Fires like a spring',
      },
      {
        tool: 'door',
        label: 'Door',
        hint: 'Click: a door, open while its wire is on (no wire: always open). Middle click to make it an exit door',
      },
      {
        tool: 'slope',
        label: 'Slope',
        hint: 'Click: a ramp on the surface below. Players walk on it, a boulder rolls down it. Middle click: size and which way it rises',
      },
      {
        tool: 'cage',
        label: 'Cage',
        hint: 'Click: a covered cage hanging from the ceiling. A wire (or a swing at it) drops it. Middle click: what it hides, smash or stay',
      },
    ],
  },
];

/**
 * The dev level editor's floating tool bar: pick what the left mouse places, change the
 * selection, and export / import the design as JSON. It opens the editor while it is shown.
 */
@Component({
  selector: 'app-level-editor-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PixelIconComponent, DraggableDialogDirective, NgTemplateOutlet, ToolIconDirective],
  templateUrl: './level-editor-bar.component.html',
  styleUrl: './level-editor-bar.component.css',
})
export class LevelEditorBarComponent {
  readonly editor: InputSignal<LevelEditorSystem> = input.required<LevelEditorSystem>();
  readonly closed: OutputEmitterRef<void> = output<void>();

  readonly groups: ToolGroup[] = TOOL_GROUPS;
  readonly contents: CageContent[] = CAGE_CONTENTS;
  readonly panel: WritableSignal<EditorPanel> = signal<EditorPanel>('none');
  readonly exportText: WritableSignal<string> = signal<string>('');
  readonly importText: WritableSignal<string> = signal<string>('');
  readonly notesText: WritableSignal<string> = signal<string>('');
  readonly message: WritableSignal<string | null> = signal<string | null>(null);
  /** Bumped by the editor on every change: the computed views below re-read it. */
  private readonly version: WritableSignal<number> = signal<number>(0);

  readonly tool: Signal<EditorTool> = computed((): EditorTool => {
    this.version();
    return this.editor().tool;
  });
  readonly selection: Signal<EditorSelection | null> = computed((): EditorSelection | null => {
    this.version();
    return this.editor().selection();
  });
  /** The middle-click popup (none or one), draggable by its title bar. */
  readonly canUndo: Signal<boolean> = computed((): boolean => {
    this.version();
    return this.editor().canUndo();
  });
  readonly canRedo: Signal<boolean> = computed((): boolean => {
    this.version();
    return this.editor().canRedo();
  });
  /** False when the design has neither the hanging exit nor an exit door. */
  readonly hasWayOut: Signal<boolean> = computed((): boolean => {
    this.version();
    return this.editor().hasWayOut();
  });
  readonly inspectors: Signal<InspectorView[]> = computed((): InspectorView[] => {
    this.version();
    const ins: EditorInspector | null = this.editor().inspector();
    if (!ins) return [];
    const view: InspectorView = {
      key: `${ins.clientX},${ins.clientY}`,
      label: ins.label,
      fields: ins.fields,
      left: Math.max(
        0,
        Math.min(ins.clientX + INSPECTOR_OFFSET_PX, window.innerWidth - INSPECTOR_W_PX),
      ),
      top: Math.max(
        0,
        Math.min(ins.clientY + INSPECTOR_OFFSET_PX, window.innerHeight - INSPECTOR_H_PX),
      ),
    };
    return [view];
  });
  readonly hint: Signal<string> = computed((): string => {
    const tool: EditorTool = this.tool();
    for (const group of TOOL_GROUPS) {
      const button: ToolButton | undefined = group.tools.find(
        (b: ToolButton): boolean => b.tool === tool,
      );
      if (button) return `${button.label}: ${button.hint}`;
    }
    return '';
  });

  constructor() {
    effect((onCleanup: (fn: () => void) => void): void => {
      const editor: LevelEditorSystem = this.editor();
      editor.onChange = (layoutChanged: boolean): void => {
        this.version.update((v: number): number => v + 1);
        if (layoutChanged) this.saveDraft(editor.exportJson());
      };
      editor.open();
      // Ctrl+Z / Ctrl+Shift+Z step through the design's history; in a text box they stay the box's.
      const onKey: (event: KeyboardEvent) => void = (event: KeyboardEvent): void => {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
        const target: EventTarget | null = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      };
      window.addEventListener('keydown', onKey, true);
      onCleanup((): void => {
        window.removeEventListener('keydown', onKey, true);
        editor.onChange = null;
        editor.close();
      });
    });
  }

  pickTool(tool: EditorTool): void {
    this.editor().setTool(tool);
  }

  removeSelected(): void {
    this.editor().removeSelected();
  }

  setContent(content: CageContent): void {
    this.editor().setCageContent(content);
  }

  /** A field's slider moved or its number was typed: the thing changes at once. */
  onFieldInput(key: EditorFieldKey, event: Event): void {
    this.setField(key, Number((event.target as HTMLInputElement).value));
  }

  setField(key: EditorFieldKey, value: number): void {
    this.editor().setField(key, value);
  }

  closeInspector(): void {
    this.editor().closeInspector();
  }

  undo(): void {
    this.editor().undo();
  }

  redo(): void {
    this.editor().redo();
  }

  unwire(targetId: string): void {
    this.editor().unwire(targetId);
  }

  toggleNotes(): void {
    if (this.panel() === 'notes') {
      this.panel.set('none');
      return;
    }
    this.notesText.set(this.editor().notes());
    this.panel.set('notes');
  }

  onNotesInput(event: Event): void {
    const text: string = (event.target as HTMLTextAreaElement).value;
    this.notesText.set(text);
    this.editor().setNotes(text);
  }

  clear(): void {
    this.editor().clear();
    this.message.set('Cleared: only the exit (and your notes) are left');
  }

  reset(): void {
    this.editor().resetToGenerated();
    this.message.set('Back to the generated floor');
    this.notesText.set(this.editor().notes());
  }

  toggleExport(): void {
    if (this.panel() === 'export') {
      this.panel.set('none');
      return;
    }
    const text: string = this.editor().exportJson();
    this.exportText.set(text);
    this.panel.set('export');
    navigator.clipboard?.writeText(text).then(
      (): void => this.message.set('Layout copied to the clipboard'),
      (): void => this.message.set('Copy the layout from the box'),
    );
  }

  download(): void {
    const blob: Blob = new Blob([this.exportText()], { type: 'application/json' });
    const url: string = URL.createObjectURL(blob);
    const link: HTMLAnchorElement = document.createElement('a');
    link.href = url;
    link.download = `floor-${this.floorOf(this.exportText())}-layout.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  toggleImport(): void {
    this.panel.set(this.panel() === 'import' ? 'none' : 'import');
  }

  applyImport(): void {
    const error: string | null = this.editor().importJson(this.importText());
    this.message.set(error ? `Import failed: ${error}` : 'Layout imported');
    if (!error) this.panel.set('none');
  }

  loadDraft(): void {
    const draft: string | null = this.readDraft();
    if (!draft) {
      this.message.set('No draft saved yet');
      return;
    }
    const error: string | null = this.editor().importJson(draft);
    this.message.set(error ? `Draft failed: ${error}` : 'Draft loaded');
    this.notesText.set(this.editor().notes());
  }

  onClose(): void {
    this.closed.emit();
  }

  /** Typing in the boxes must not move the player (the game reads keys on the window). */
  stopKeys(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  onImportInput(event: Event): void {
    this.importText.set((event.target as HTMLTextAreaElement).value);
  }

  private floorOf(json: string): string {
    const match: RegExpMatchArray | null = /"floor":\s*(\d+)/.exec(json);
    return match ? match[1] : 'x';
  }

  private saveDraft(json: string): void {
    try {
      localStorage.setItem(DRAFT_KEY, json);
    } catch {
      // Storage blocked (private window): the draft just isn't kept.
    }
  }

  private readDraft(): string | null {
    try {
      return localStorage.getItem(DRAFT_KEY);
    } catch {
      return null;
    }
  }
}
