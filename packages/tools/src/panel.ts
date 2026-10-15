import type { JsonValue } from '@portojs/core';
import type { Game } from '@portojs/runtime';
import { fastForward, findComponent, inspectGame, setComponentState } from './inspector.ts';
import type { ComponentInfo, ObjectInfo } from './inspector.ts';

/**
 * Options of {@link mountDevtools}.
 */
export interface DevtoolsOptions {
  /**
   * Refresh the panel every this many fixed steps. Default 10.
   */
  readonly refreshEveryTicks?: number;
}

/**
 * A mounted panel.
 */
export interface Devtools {
  /**
   * Redraws the panel now.
   */
  refresh(): void;
  /**
   * Removes the panel and its listeners.
   */
  dispose(): void;
}

const FAST_FORWARDS: ReadonlyArray<readonly [string, number, 'steps' | 'offline']> = [
  ['+1 min', 60_000, 'steps'],
  ['+1 h', 3_600_000, 'offline'],
  ['+1 day', 86_400_000, 'offline'],
];

function text(document: Document, tag: string, content: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = content;
  return element;
}

function renderComponent(document: Document, objectName: string, info: ComponentInfo): HTMLElement {
  const box = document.createElement('div');
  box.className = 'pj-component';
  box.append(text(document, 'strong', info.type));
  if (!info.active) box.append(text(document, 'em', ' (inactive)'));
  if (info.state === undefined) return box;
  const area = document.createElement('textarea');
  area.value = JSON.stringify(info.state, null, 2);
  area.rows = Math.min(8, area.value.split('\n').length);
  area.readOnly = !info.editable;
  box.append(area);
  if (info.editable) {
    const apply = text(document, 'button', 'Apply');
    apply.dataset['action'] = 'apply';
    apply.dataset['object'] = objectName;
    apply.dataset['type'] = info.type;
    box.append(apply);
  }
  return box;
}

function renderObject(document: Document, info: ObjectInfo): HTMLElement {
  const details = document.createElement('details');
  details.open = true;
  details.className = 'pj-object';
  details.append(text(document, 'summary', info.active ? info.name : `${info.name} (inactive)`));
  for (const component of info.components) {
    details.append(renderComponent(document, info.name, component));
  }
  for (const child of info.children) details.append(renderObject(document, child));
  return details;
}

/**
 * Mounts an inspector panel into `container`: the object tree with each component's state
 * editable as JSON, the step counter and time, and buttons that fast-forward the game. It
 * refreshes itself as the game runs, but leaves a textarea alone while you type in it.
 *
 * @example
 * const tools = mountDevtools(game, document.getElementById('devtools')!);
 * tools.dispose();
 */
export function mountDevtools(
  game: Game,
  container: HTMLElement,
  options: DevtoolsOptions = {},
): Devtools {
  const document = container.ownerDocument;
  const every = options.refreshEveryTicks ?? 10;
  const status = document.createElement('div');
  status.className = 'pj-status';
  const tree = document.createElement('div');
  tree.className = 'pj-tree';
  const toolbar = document.createElement('div');
  toolbar.className = 'pj-toolbar';
  for (const [label, ms, mode] of FAST_FORWARDS) {
    const button = text(document, 'button', label);
    button.dataset['action'] = 'forward';
    button.dataset['ms'] = String(ms);
    button.dataset['mode'] = mode;
    toolbar.append(button);
  }
  const problem = document.createElement('div');
  problem.className = 'pj-error';
  container.append(status, toolbar, problem, tree);

  const editing = (): boolean => {
    const active = document.activeElement;
    return active !== null && active.tagName === 'TEXTAREA' && tree.contains(active);
  };

  const refresh = (): void => {
    const info = inspectGame(game);
    status.textContent = `tick ${info.tickCount} - ${(info.now / 1000).toFixed(1)} s${info.running ? '' : ' - stopped'}`;
    if (editing()) return;
    tree.replaceChildren();
    for (const object of info.objects) tree.append(renderObject(document, object));
  };

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const action = target.dataset['action'];
    problem.textContent = '';
    if (action === 'forward') {
      const mode = target.dataset['mode'] === 'offline' ? 'offline' : 'steps';
      fastForward(game, Number(target.dataset['ms']), mode);
      refresh();
    } else if (action === 'apply') {
      const area = target.parentElement?.querySelector('textarea');
      const component = findComponent(
        game,
        target.dataset['object'] ?? '',
        target.dataset['type'] ?? '',
      );
      if (area === null || area === undefined || component === undefined) return;
      try {
        setComponentState(component, JSON.parse(area.value) as JsonValue);
        area.blur();
        refresh();
      } catch (error) {
        problem.textContent = error instanceof Error ? error.message : String(error);
      }
    }
  };

  const onTick = (): void => {
    if (game.tickCount % every === 0) refresh();
  };
  const stopTicks = game.on('tick', onTick);
  container.addEventListener('click', onClick);
  refresh();

  return {
    refresh,
    dispose(): void {
      stopTicks();
      container.removeEventListener('click', onClick);
      status.remove();
      toolbar.remove();
      problem.remove();
      tree.remove();
    },
  };
}
