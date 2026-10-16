import type { ProfileFrame, Profiler } from '@portojs/tools';
import { useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';

/**
 * The game type the panel listens to: anything that raises `tick`.
 */
interface TickSource {
  on(event: 'tick', listener: () => void): () => void;
  readonly tickCount: number;
}

/**
 * Props of {@link ProfilerPanel}.
 */
export interface ProfilerPanelProps {
  /**
   * The profiler to show; attach it to the game yourself.
   */
  readonly profiler: Profiler;
  /**
   * The game the profiler is attached to, to know when to redraw.
   */
  readonly game: TickSource;
  /**
   * Redraw every this many fixed steps. Default 10.
   */
  readonly refreshEveryTicks?: number;
  /**
   * Rows of the table. Default 8.
   */
  readonly rows?: number;
  /**
   * Height of the frame graph in pixels. Default 48.
   */
  readonly graphHeight?: number;
  readonly className?: string;
}

const BAR_WIDTH = 3;

function graphPoints(frames: readonly ProfileFrame[], height: number): ReactElement[] {
  let peak = 1;
  for (const frame of frames) peak = Math.max(peak, frame.fixedMs + frame.frameMs);
  const bars: ReactElement[] = [];
  for (const [index, frame] of frames.entries()) {
    const total = frame.fixedMs + frame.frameMs;
    const h = (total / peak) * height;
    bars.push(
      <rect key={index} x={index * BAR_WIDTH} y={height - h} width={BAR_WIDTH - 1} height={h} />,
    );
  }
  return bars;
}

/**
 * A React panel for a {@link Profiler}: the components that cost the most time per method, and
 * a frame graph of the last steps. Mount it only in development builds.
 *
 * @example
 * const profiler = new Profiler().attach(game);
 * {import.meta.env.DEV && <ProfilerPanel profiler={profiler} game={game} />}
 */
export function ProfilerPanel({
  profiler,
  game,
  refreshEveryTicks = 10,
  rows = 8,
  graphHeight = 48,
  className,
}: ProfilerPanelProps): ReactElement {
  const bucket = Math.floor(game.tickCount / refreshEveryTicks);
  const subscribe = (notify: () => void): (() => void) => game.on('tick', notify);
  const getSnapshot = (): number => Math.floor(game.tickCount / refreshEveryTicks);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const entries = profiler.report().slice(0, rows);
  const frames = profiler.frames();
  const body: ReactElement[] = [];
  for (const [index, entry] of entries.entries()) {
    body.push(
      <tr key={`${index}:${entry.type}.${entry.phase}`}>
        <td>{`${entry.type}.${entry.phase}`}</td>
        <td>{entry.calls}</td>
        <td>{entry.total.toFixed(2)}</td>
        <td>{entry.average.toFixed(3)}</td>
        <td>{entry.max.toFixed(2)}</td>
      </tr>,
    );
  }
  const last = frames.at(-1);
  const status = last
    ? `last step ${(last.fixedMs + last.frameMs).toFixed(2)} ms${
        last.memory === undefined ? '' : ` - ${(last.memory / 1048576).toFixed(1)} MB`
      }`
    : 'no steps measured yet';
  return (
    <div className={className ?? 'pj-profiler'} data-bucket={bucket}>
      <div className="pj-status">{status}</div>
      <svg
        role="img"
        aria-label="frame graph"
        width={Math.max(1, frames.length * BAR_WIDTH)}
        height={graphHeight}
      >
        {graphPoints(frames, graphHeight)}
      </svg>
      <table>
        <thead>
          <tr>
            <th>method</th>
            <th>calls</th>
            <th>total ms</th>
            <th>avg ms</th>
            <th>max ms</th>
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}
