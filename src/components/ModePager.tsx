import React, { useCallback, useMemo, useRef } from 'react';

type Mode = 'play' | 'playback';

type Props = {
  mode: Mode;
  onChange: (m: Mode) => void;
};

const pages: { key: Mode; label: string }[] = [
  { key: 'play', label: 'Play as Agent' },
  { key: 'playback', label: 'Playback' },
];

export const ModePager: React.FC<Props> = ({ mode, onChange }) => {
  const startX = useRef<number | null>(null);
  const idx = useMemo(() => pages.findIndex((p) => p.key === mode), [mode]);

  const go = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(pages.length - 1, i));
      onChange(pages[clamped].key);
    },
    [onChange]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startX.current = e.clientX;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    const threshold = 30;
    if (Math.abs(dx) > threshold) {
      if (dx < 0) go(idx + 1);
      else go(idx - 1);
    }
  };

  return (
    <div className="mode-pager" role="tablist" aria-label="Mode switcher" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      {pages.map((p, i) => {
        const active = p.key === mode;
        return (
          <button
            key={p.key}
            role="tab"
            type="button"
            aria-selected={active}
            className={`mode-pager__button ${active ? 'is-active' : ''}`}
            onClick={() => go(i)}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
};

export default ModePager;
