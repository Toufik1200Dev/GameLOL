'use client';

/**
 * Small, reusable UI building blocks used across every screen. Keeping them in
 * one file makes the design language consistent and easy to tweak.
 */
import { motion, type HTMLMotionProps } from 'framer-motion';
import type { InputHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-[#04111d] hover:bg-accent-strong shadow-[0_0_24px_-6px_var(--color-accent)] font-semibold',
  secondary: 'bg-panel border border-border text-white/90 hover:border-accent hover:text-white',
  danger: 'bg-danger/90 text-white hover:bg-danger font-semibold',
  ghost: 'bg-transparent text-white/70 hover:text-white hover:bg-white/5',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: rest.disabled ? 1 : 1.03 }}
      whileTap={{ scale: rest.disabled ? 1 : 0.97 }}
      className={`font-display rounded-lg uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

interface PanelProps {
  children: ReactNode;
  className?: string;
}

export function Panel({ children, className = '' }: PanelProps) {
  return (
    <div
      className={`bg-panel/80 border-border rounded-2xl border backdrop-blur-md ${className}`}
    >
      {children}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function TextInput({ label, className = '', id, ...rest }: TextInputProps) {
  return (
    <label className="flex w-full flex-col gap-1.5" htmlFor={id}>
      {label && <span className="text-xs font-medium tracking-wide text-white/50">{label}</span>}
      <input
        id={id}
        className={`bg-bg-elevated border-border focus:border-accent w-full rounded-lg border px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/30 ${className}`}
        {...rest}
      />
    </label>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 disabled:opacity-40"
    >
      <span
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-white/15'}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
          style={{ left: checked ? '22px' : '2px' }}
        />
      </span>
      {label && <span className="text-sm text-white/80">{label}</span>}
    </button>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  format?: (value: number) => string;
}

export function Slider({ value, min, max, step = 0.01, onChange, label, format }: SliderProps) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      {label && (
        <span className="flex justify-between text-xs font-medium tracking-wide text-white/50">
          <span>{label}</span>
          <span className="text-accent">{format ? format(value) : value}</span>
        </span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-accent h-1.5 w-full cursor-pointer rounded-full"
      />
    </label>
  );
}
