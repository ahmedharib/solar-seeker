import React from 'react';
import { UploadCloud, CheckSquare, BarChart3, Check } from 'lucide-react';

const STEPS = [
  { id: 1, title: 'Upload & Setup', icon: UploadCloud, subtitle: 'Satellite screenshot & parameters' },
  { id: 2, title: 'Verify Rooftops', icon: CheckSquare, subtitle: 'Select target house polygons' },
  { id: 3, title: 'Solar Feasibility', icon: BarChart3, subtitle: 'EU PVGIS & financial ROI' },
];

export default function Stepper({ currentStep, onStepClick, maxStepAllowed = 1 }) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-3 p-2 ss-well rounded-2xl">
        {STEPS.map((step) => {
          const isCurrent = currentStep === step.id;
          const isCompleted = currentStep > step.id;
          const isClickable = step.id <= maxStepAllowed && step.id !== currentStep;
          const Icon = step.icon;

          return (
            <li
              key={step.id}
              onClick={() => isClickable && onStepClick && onStepClick(step.id)}
              className={`relative flex items-center gap-3.5 p-3.5 rounded-xl border select-none transition-all ${
                isClickable
                  ? 'cursor-pointer hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface)]'
                  : ''
              } ${
                isCurrent
                  ? 'bg-[var(--bg-surface)] border-[var(--border-strong)] shadow-sm'
                  : isCompleted
                  ? 'bg-[var(--bg-surface)]/60 border-[var(--border-subtle)]'
                  : 'bg-transparent border-transparent opacity-55'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                  isCurrent
                    ? 'bg-[#F5AD46] text-[#182321] shadow-xs'
                    : isCompleted
                    ? 'bg-[#37645C] text-[#F6F5EF]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Icon className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] tabular-nums leading-none">
                    Step 0{step.id}
                  </span>
                </div>
                <h3
                  className={`text-xs sm:text-sm font-bold truncate leading-none mt-1 ${
                    isCurrent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {step.title}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] truncate leading-none mt-1">
                  {step.subtitle}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
