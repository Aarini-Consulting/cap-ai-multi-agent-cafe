const STEPS = [
  { label: 'Order received', sub: 'Sent to the kitchen' },
  { label: 'Preparing', sub: 'Cooking your meal' },
  { label: 'Plating', sub: 'Drinks & sides' },
  { label: 'Ready at table', sub: 'Runner brings it over' },
];

interface StatusStepperProps { currentStep: number; }

export default function StatusStepper({ currentStep }: StatusStepperProps) {
  return (
    <div className="status-stepper">
      {STEPS.map((step, i) => {
        const isDone = i < currentStep;
        const isActive = i === currentStep;
        const isPending = i > currentStep;
        const isLast = i === STEPS.length - 1;

        return (
          <div key={step.label} className={`step ${isPending ? 'pending' : ''}`}>
            <div className="step-col">
              <div className={`step-marker ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
                {isDone ? '✓' : isActive ? '●' : '○'}
              </div>
              {!isLast && <div className={`step-connect ${isDone ? 'done' : ''}`} />}
            </div>
            <div className="step-text">
              <div className="step-title">{step.label}</div>
              <div className="step-sub">{step.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
