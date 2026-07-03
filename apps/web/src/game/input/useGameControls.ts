'use client';

/**
 * Captures keyboard + pointer-lock mouse input into a single mutable ref the
 * game loop reads each frame (no React re-renders on input). Also wires
 * scoreboard (Tab), pause (Esc / pointer-unlock) and first-person toggle (V or P).
 */
import { useEffect, useRef, type MutableRefObject } from 'react';
import { clamp } from '@game/shared';
import { useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';

export interface ControlsRef {
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  shoot: boolean;
  aim: boolean;
  reload: boolean;
  firstPerson: boolean;
  pointerLocked: boolean;
}

export function useGameControls(initialYaw: number): MutableRefObject<ControlsRef> {
  const ref = useRef<ControlsRef>({
    moveX: 0,
    moveZ: 0,
    yaw: initialYaw,
    pitch: 0,
    jump: false,
    sprint: false,
    crouch: false,
    shoot: false,
    aim: false,
    reload: false,
    firstPerson: false,
    pointerLocked: false,
  });

  useEffect(() => {
    const keys: Record<string, boolean> = {};

    const recompute = (): void => {
      const r = ref.current;
      r.moveX = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
      r.moveZ = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
      r.jump = Boolean(keys['Space']);
      r.sprint = Boolean(keys['ShiftLeft'] || keys['ShiftRight']);
      r.crouch = Boolean(keys['ControlLeft'] || keys['KeyC']);
      r.reload = Boolean(keys['KeyR']);
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      keys[e.code] = true;
      if (e.code === 'Tab') {
        e.preventDefault();
        useGameStore.getState().setScoreboard(true);
      }
      if (e.code === 'KeyV' || e.code === 'KeyP')
        ref.current.firstPerson = !ref.current.firstPerson;
      recompute();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      keys[e.code] = false;
      if (e.code === 'Tab') useGameStore.getState().setScoreboard(false);
      recompute();
    };

    const onMouseMove = (e: MouseEvent): void => {
      if (!ref.current.pointerLocked) return;
      const s = useSettingsStore.getState();
      const sens = s.mouseSensitivity * 0.0022;
      const invert = s.invertY ? -1 : 1;
      ref.current.yaw -= e.movementX * sens;
      ref.current.pitch = clamp(ref.current.pitch - e.movementY * sens * invert, -1.4, 1.4);
    };

    const onMouseDown = (e: MouseEvent): void => {
      if (!ref.current.pointerLocked) return;
      if (e.button === 0) ref.current.shoot = true;
      if (e.button === 2) ref.current.aim = true;
    };
    const onMouseUp = (e: MouseEvent): void => {
      if (e.button === 0) ref.current.shoot = false;
      if (e.button === 2) ref.current.aim = false;
    };

    const onPointerLockChange = (): void => {
      const locked = document.pointerLockElement != null;
      ref.current.pointerLocked = locked;
      if (locked) {
        useGameStore.getState().setPaused(false);
      } else {
        ref.current.shoot = false;
        ref.current.aim = false;
        // Releasing the pointer (e.g. Esc) opens the pause menu.
        if (!useGameStore.getState().ended) useGameStore.getState().setPaused(true);
      }
    };

    const onContextMenu = (e: Event): void => e.preventDefault();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  return ref;
}
