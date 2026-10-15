import { fastForward, findComponent, inspectGame, setComponentState } from '@portojs/tools';
import type { ComponentInfo, GameInfo, ObjectInfo } from '@portojs/tools';
import { createElement as h, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent, ReactElement } from 'react';

/**
 * The game type the panel works with: whatever `@portojs/tools` can inspect.
 */
type PanelGame = Parameters<typeof inspectGame>[0];

/**
 * Props of {@link Devtools}.
 */
export interface DevtoolsProps {
  /**
   * The game to inspect.
   */
  readonly game: PanelGame;
  /**
   * Redraw every this many fixed steps. Default 10.
   */
  readonly refreshEveryTicks?: number;
  /**
   * CSS class for the panel's root element.
   */
  readonly className?: string;
}

const FAST_FORWARDS: ReadonlyArray<readonly [string, number, 'steps' | 'offline']> = [
  ['+1 min', 60_000, 'steps'],
  ['+1 h', 3_600_000, 'offline'],
  ['+1 day', 86_400_000, 'offline'],
];

interface Snapshot {
  readonly key: string;
  readonly info: GameInfo;
}

/**
 * Reads the game's inspection data and re-renders as it changes, at most once per `every` steps.
 * Returns the data and a function that forces a redraw (after you edit something).
 */
function useInspection(game: PanelGame, every: number): [GameInfo, () => void] {
  const version = useRef(0);
  const cached = useRef<Snapshot | undefined>(undefined);
  const listeners = useRef(new Set<() => void>());

  const getSnapshot = (): GameInfo => {
    const key = `${Math.floor(game.tickCount / every)}:${version.current}:${game.running}`;
    if (cached.current?.key !== key) cached.current = { key, info: inspectGame(game) };
    return cached.current.info;
  };
  const subscribe = (notify: () => void): (() => void) => {
    listeners.current.add(notify);
    const stop = game.on('tick', notify);
    return () => {
      listeners.current.delete(notify);
      stop();
    };
  };
  const refresh = (): void => {
    version.current += 1;
    for (const notify of [...listeners.current]) notify();
  };
  return [useSyncExternalStore(subscribe, getSnapshot, getSnapshot), refresh];
}

interface EditorProps {
  readonly game: PanelGame;
  readonly objectName: string;
  readonly info: ComponentInfo;
  readonly onApplied: () => void;
}

function ComponentEditor(props: EditorProps): ReactElement {
  const { game, objectName, info, onApplied } = props;
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState('');
  const shown = draft ?? (info.state === undefined ? '' : JSON.stringify(info.state, null, 2));

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(event.target.value);
  };
  const apply = (): void => {
    const component = findComponent(game, objectName, info.type);
    if (component === undefined) return;
    try {
      setComponentState(component, JSON.parse(shown) as Parameters<typeof setComponentState>[1]);
      setDraft(undefined);
      setProblem('');
      onApplied();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  const parts: ReactElement[] = [h('strong', { key: 'type' }, info.type)];
  if (!info.active) parts.push(h('em', { key: 'inactive' }, ' (inactive)'));
  if (info.state !== undefined) {
    parts.push(
      h('textarea', {
        key: 'state',
        value: shown,
        readOnly: !info.editable,
        rows: Math.min(8, shown.split('\n').length),
        onChange,
      }),
    );
    if (info.editable) {
      parts.push(h('button', { key: 'apply', type: 'button', onClick: apply }, 'Apply'));
    }
    if (problem !== '') parts.push(h('div', { key: 'error', role: 'alert' }, problem));
  }
  return h('div', { className: 'pj-component' }, ...parts);
}

interface TreeProps {
  readonly game: PanelGame;
  readonly info: ObjectInfo;
  readonly onApplied: () => void;
}

function ObjectNode(props: TreeProps): ReactElement {
  const { game, info, onApplied } = props;
  const children: ReactElement[] = [
    h('summary', { key: 'name' }, info.active ? info.name : `${info.name} (inactive)`),
  ];
  for (const [index, component] of info.components.entries()) {
    children.push(
      h(ComponentEditor, {
        key: `c${index}:${component.type}`,
        game,
        objectName: info.name,
        info: component,
        onApplied,
      }),
    );
  }
  for (const [index, child] of info.children.entries()) {
    children.push(h(ObjectNode, { key: `o${index}:${child.name}`, game, info: child, onApplied }));
  }
  return h('details', { className: 'pj-object', open: true }, ...children);
}

/**
 * A React panel for inspecting a running game: the object tree with each component's saved state
 * as editable JSON (press Apply to write it back through `onLoad`), the step counter and game
 * time, and buttons that jump forward a minute, an hour or a day. It never overwrites a draft
 * while you type. Mount it only in development builds.
 *
 * @example
 * {import.meta.env.DEV && <Devtools game={game} />}
 */
export function Devtools(props: DevtoolsProps): ReactElement {
  const { game } = props;
  const every = props.refreshEveryTicks ?? 10;
  const [info, refresh] = useInspection(game, every);

  const buttons: ReactElement[] = [];
  for (const [label, ms, mode] of FAST_FORWARDS) {
    const jump = (): void => {
      fastForward(game, ms, mode);
      refresh();
    };
    buttons.push(h('button', { key: label, type: 'button', onClick: jump }, label));
  }
  const nodes: ReactElement[] = [];
  for (const [index, object] of info.objects.entries()) {
    nodes.push(
      h(ObjectNode, { key: `${index}:${object.name}`, game, info: object, onApplied: refresh }),
    );
  }
  const status = `tick ${info.tickCount} - ${(info.now / 1000).toFixed(1)} s${info.running ? '' : ' - stopped'}`;
  return h(
    'div',
    { className: props.className ?? 'pj-devtools' },
    h('div', { className: 'pj-status' }, status),
    h('div', { className: 'pj-toolbar' }, ...buttons),
    h('div', { className: 'pj-tree' }, ...nodes),
  );
}
