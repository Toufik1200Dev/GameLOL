'use client';

/**
 * On-screen touch controls for phones/tablets: a left movement joystick, a
 * right-side look area (drag to aim), and Fire / Aim / Jump / Reload buttons.
 * Writes directly into the shared controls ref the game loop reads, so the rest
 * of the engine is input-source agnostic.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clamp } from '@game/shared';
import { useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ControlsRef } from '../../game/input/useGameControls';

const JOY_RADIUS = 64; // px

export function TouchControls({ controls }: { controls: React.MutableRefObject<ControlsRef> }) {
  const moveId = useRef<number | null>(null);
  const moveOrigin = useRef({ x: 0, y: 0 });
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const [joyBase, setJoyBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  // No pointer lock on touch — mark the controls active while mounted.
  useEffect(() => {
    const c = controls.current;
    c.pointerLocked = true;
    return () => {
      c.pointerLocked = false;
      c.moveX = 0;
      c.moveZ = 0;
      c.shoot = false;
    };
  }, [controls]);

  const onStart = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth / 2 && moveId.current === null) {
        moveId.current = t.identifier;
        moveOrigin.current = { x: t.clientX, y: t.clientY };
        setJoyBase({ x: t.clientX, y: t.clientY });
        setKnob({ x: 0, y: 0 });
      } else if (t.clientX >= window.innerWidth / 2 && lookId.current === null) {
        lookId.current = t.identifier;
        lookLast.current = { x: t.clientX, y: t.clientY };
      }
    }
  };

  const onMove = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === moveId.current) {
        let dx = t.clientX - moveOrigin.current.x;
        let dy = t.clientY - moveOrigin.current.y;
        const len = Math.hypot(dx, dy);
        if (len > JOY_RADIUS) {
          dx = (dx / len) * JOY_RADIUS;
          dy = (dy / len) * JOY_RADIUS;
        }
        setKnob({ x: dx, y: dy });
        controls.current.moveX = dx / JOY_RADIUS;
        controls.current.moveZ = -dy / JOY_RADIUS; // up = forward
        controls.current.sprint = len > JOY_RADIUS * 0.85;
      } else if (t.identifier === lookId.current) {
        const s = useSettingsStore.getState();
        const sens = s.mouseSensitivity * 0.006;
        const dx = t.clientX - lookLast.current.x;
        const dy = t.clientY - lookLast.current.y;
        controls.current.yaw -= dx * sens;
        controls.current.pitch = clamp(
          controls.current.pitch - dy * sens * (s.invertY ? -1 : 1),
          -1.4,
          1.4,
        );
        lookLast.current = { x: t.clientX, y: t.clientY };
      }
    }
  };

  const onEnd = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === moveId.current) {
        moveId.current = null;
        setJoyBase(null);
        setKnob({ x: 0, y: 0 });
        controls.current.moveX = 0;
        controls.current.moveZ = 0;
        controls.current.sprint = false;
      }
      if (t.identifier === lookId.current) lookId.current = null;
    }
  };

  /** A button that sets a controls flag while held (or pulses on tap). */
  const hold = (set: (v: boolean) => void) => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.stopPropagation();
      set(true);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.stopPropagation();
      set(false);
    },
  });

  return (
    <div
      className="absolute inset-0 z-20 touch-none select-none"
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
    >
      {/* Pause */}
      <button
        className="bg-bg/70 pointer-events-auto absolute left-3 top-3 rounded-lg px-3 py-2 text-xs text-white/80"
        onTouchStart={(e) => {
          e.stopPropagation();
          useGameStore.getState().setPaused(true);
        }}
      >
        ❚❚
      </button>

      {/* Movement joystick (left) — appears where the thumb lands */}
      {joyBase && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: joyBase.x - JOY_RADIUS,
            top: joyBase.y - JOY_RADIUS,
            width: JOY_RADIUS * 2,
            height: JOY_RADIUS * 2,
          }}
        >
          <div className="absolute inset-0 rounded-full border-2 border-white/25 bg-white/5" />
          <div
            className="absolute rounded-full bg-white/40"
            style={{ width: 56, height: 56, left: JOY_RADIUS - 28 + knob.x, top: JOY_RADIUS - 28 + knob.y }}
          />
        </div>
      )}

      {/* Action buttons (right) */}
      <div className="pointer-events-none absolute bottom-6 right-5 flex items-end gap-3">
        <div className="flex flex-col gap-3">
          <TouchButton small {...hold((v) => (controls.current.reload = v))}>
            ⟳
          </TouchButton>
          <TouchButton small {...hold((v) => (controls.current.jump = v))}>
            ⤒
          </TouchButton>
        </div>
        <div className="flex flex-col gap-3">
          <TouchButton small {...hold((v) => (controls.current.aim = v))}>
            ◎
          </TouchButton>
          <TouchButton {...hold((v) => (controls.current.shoot = v))}>🔫</TouchButton>
        </div>
      </div>
    </div>
  );
}

function TouchButton({
  children,
  small,
  ...rest
}: {
  children: ReactNode;
  small?: boolean;
} & React.HTMLAttributes<HTMLButtonElement>) {
  const size = small ? 'h-14 w-14 text-xl' : 'h-20 w-20 text-3xl';
  return (
    <button
      className={`pointer-events-auto flex items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur active:bg-white/30 ${size}`}
      {...rest}
    >
      {children}
    </button>
  );
}
