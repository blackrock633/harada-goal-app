import * as React from 'react';
import { clsx } from 'clsx';
import { formatPercent } from '../format';

export interface ProgressBarProps {
  progress: number | null;
  className?: string;
  label?: string;
}

export function ProgressBar({ progress, className, label }: ProgressBarProps) {
  const isNull = progress === null;
  const val = isNull ? 0 : Math.round(progress * 100);
  
  return (
    <div className={clsx('w-full', className)}>
      <div className="flex justify-between items-center text-sm mb-1.5">
        <span className="text-ink-muted font-medium">{label || 'Progress'}</span>
        <span className="text-ink font-medium tabular-nums">{formatPercent(progress)}</span>
      </div>
      <div 
        className="h-2 w-full bg-surface-sunken overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={isNull ? undefined : val}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
      >
        <span className="sr-only">{isNull ? 'Not measurable yet' : `${val}%`}</span>
        {!isNull && (
          <div 
            className="h-full bg-accent transition-all duration-300 ease-out rounded-full"
            style={{ width: `${val}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function ProgressRing({ progress, size = 40, strokeWidth = 4, className }: ProgressBarProps & { size?: number, strokeWidth?: number }) {
  const isNull = progress === null;
  const val = isNull ? 0 : Math.max(0, Math.min(1, progress));
  
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - val * circumference;

  return (
    <div 
      className={clsx('relative inline-flex items-center justify-center', className)}
      role="progressbar"
      aria-valuenow={isNull ? undefined : Math.round(val * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="sr-only">{isNull ? 'Not measurable yet' : `${Math.round(val * 100)}%`}</span>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          className="text-surface-sunken"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {!isNull && (
          <circle
            className="text-accent transition-all duration-300 ease-out"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        )}
      </svg>
    </div>
  );
}
