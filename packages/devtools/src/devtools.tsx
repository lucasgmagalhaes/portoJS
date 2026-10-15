import { fastForward, findComponent, inspectGame, setComponentState } from '@portojs/tools';
import type { ComponentInfo, GameInfo, ObjectInfo } from '@portojs/tools';
import { useRef, useState, useSyncExternalStore } from 'react';
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

function ComponentEditor({ game, objectName, info, onApplied }: EditorProps): ReactElement {
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

  return (
    <div className="pj-component">
      <strong>{info.type}</strong>
      {info.active ? null : <em> (inactive)</em>}
      {info.state === undefined ? null : (
        <>
          <textarea
            value={shown}
            readOnly={!info.editable}
            rows={Math.min(8, shown.split('\n').length)}
            onChange={onChange}
          />
          {info.editable ? (
            <button type="button" onClick={apply}>
              Apply
            </button>
          ) : null}
          {problem === '' ? null : <div role="alert">{problem}</div>}
        </>
      )}
    </div>
  );
}

interface TreeProps {
  readonly game: PanelGame;
  readonly info: ObjectInfo;
  readonly onApplied: () => void;
}

function ObjectNode({ game, info, onApplied }: TreeProps): ReactElement {
  const components: ReactElement[] = [];
  for (const [index, component] of info.components.entries()) {
    components.push(
      <ComponentEditor
        key={`c${index}:${component.type}`}
        game={game}
        objectName={info.name}
        info={component}
        onApplied={onApplied}
      />,
    );
  }
  const children: ReactElement[] = [];
  for (const [index, child] of info.children.entries()) {
    children.push(
      <ObjectNode key={`o${index}:${child.name}`} game={game} info={child} onApplied={onApplied} />,
    );
  }
  return (
    <details className="pj-object" open>
      <summary>{info.active ? info.name : `${info.name} (inactive)`}</summary>
      {components}
      {children}
    </details>
  );
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
export function Devtools({ game, refreshEveryTicks = 10, className }: DevtoolsProps): ReactElement {
  const [info, refresh] = useInspection(game, refreshEveryTicks);

  const buttons: ReactElement[] = [];
  for (const [label, ms, mode] of FAST_FORWARDS) {
    const jump = (): void => {
      fastForward(game, ms, mode);
      refresh();
    };
    buttons.push(
      <button key={label} type="button" onClick={jump}>
        {label}
      </button>,
    );
  }
  const nodes: ReactElement[] = [];
  for (const [index, object] of info.objects.entries()) {
    nodes.push(
      <ObjectNode key={`${index}:${object.name}`} game={game} info={object} onApplied={refresh} />,
    );
  }
  const status = `tick ${info.tickCount} - ${(info.now / 1000).toFixed(1)} s${info.running ? '' : ' - stopped'}`;
  return (
    <div className={className ?? 'pj-devtools'}>
      <div className="pj-status">{status}</div>
      <div className="pj-toolbar">{buttons}</div>
      <div className="pj-tree">{nodes}</div>
    </div>
  );
}
