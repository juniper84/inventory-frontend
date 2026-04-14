'use client';

type WizardStepsProps = {
  steps: string[];
  current: number;
  className?: string;
};

/**
 * Shared wizard step indicator. Replaces the inline step pills
 * that each wizard DIYs (product, stock count, transfer, PO, price list).
 *
 * Usage:
 *   const steps = ['Product', 'Variants', 'Stock', 'Review'];
 *   <WizardSteps steps={steps} current={step} />
 */
export function WizardSteps({ steps, current, className = '' }: WizardStepsProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`}>
      {steps.map((label, index) => {
        const isActive = index === current;
        const isCompleted = index < current;

        return (
          <span
            key={label}
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors',
              isActive
                ? 'border-gold-500 text-gold-100 bg-gold-500/10'
                : isCompleted
                  ? 'border-gold-700/60 text-gold-300'
                  : 'border-gold-700/40 text-gold-400/60',
            ].join(' ')}
          >
            <span
              className={[
                'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold',
                isActive
                  ? 'bg-gold-500 text-black'
                  : isCompleted
                    ? 'bg-gold-700/40 text-gold-200'
                    : 'bg-gold-800/30 text-gold-500/50',
              ].join(' ')}
            >
              {isCompleted ? '✓' : index + 1}
            </span>
            {label}
          </span>
        );
      })}
    </div>
  );
}
