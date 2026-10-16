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
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-3 p-1.5 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl">
        {STEPS.map((step) => {
          const isCurrent = currentStep === step.id;
          const isCompleted = currentStep > step.id;
          const isClickable = step.id <= maxStepAllowed && step.id !== currentStep;
          const Icon = step.icon;

          return (
            <li
              key={step.id}
              onClick={() => isClickable && onStepClick && onStepClick(step.id)}
              className={`relative flex items-center gap-3.5 p-3 sm:p-3.5 rounded-xl border select-none transition-all ${
                isClickable ? 'cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/70' : ''
              } ${
                isCurrent
                  ? 'bg-zinc-900 border-zinc-700 shadow-sm'
                  : isCompleted
                  ? 'bg-zinc-900/40 border-zinc-800/80'
                  : 'bg-transparent border-transparent opacity-50'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-xs shrink-0 transition-colors ${
                  isCurrent
                    ? 'bg-white text-zinc-950 font-bold'
                    : isCompleted
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700/60'
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Icon className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 leading-none">
                    Step {step.id}
                  </span>
                </div>
                <h3 className={`text-xs sm:text-sm font-semibold truncate leading-none mt-1 ${isCurrent ? 'text-white' : 'text-zinc-300'}`}>
                  {step.title}
                </h3>
                <p className="text-[11px] text-zinc-500 truncate leading-none mt-1">{step.subtitle}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
