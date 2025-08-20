import { useEffect, useMemo, useRef, useState } from 'react';
import { ExecutionProcess } from 'shared/types.ts';

type Props = {
  setupProcessId: string | null;
  runningProcessDetails: Record<string, ExecutionProcess>;
};

function SetupScriptRunning({ setupProcessId, runningProcessDetails }: Props) {
  const setupScrollRef = useRef<HTMLDivElement>(null);
  
  // Check if we're in side-by-side mode (desktop)
  const [isSideBySide, setIsSideBySide] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1280; // xl breakpoint
    }
    return false;
  });

  useEffect(() => {
    const checkMode = () => {
      setIsSideBySide(window.innerWidth >= 1280);
    };
    window.addEventListener('resize', checkMode);
    return () => window.removeEventListener('resize', checkMode);
  }, []);

  // Auto-scroll setup script logs to bottom
  useEffect(() => {
    if (setupScrollRef.current) {
      setupScrollRef.current.scrollTop = setupScrollRef.current.scrollHeight;
    }
  }, [runningProcessDetails]);

  const setupProcess = useMemo(
    () =>
      setupProcessId
        ? runningProcessDetails[setupProcessId]
        : Object.values(runningProcessDetails).find(
            (process) => process.process_type === 'setupscript'
          ),
    [setupProcessId, runningProcessDetails]
  );

  return (
    <div ref={setupScrollRef} className={isSideBySide ? "h-full overflow-y-auto overscroll-contain" : ""}>
      <div className="mb-4">
        <p className="text-lg font-semibold mb-2">Setup Script Running</p>
        <p className="text-muted-foreground mb-4">
          Preparing the environment for the coding agent...
        </p>
      </div>

      {setupProcess && (
        <div className="font-mono text-sm whitespace-pre-wrap text-muted-foreground">
          {[setupProcess.stdout || '', setupProcess.stderr || '']
            .filter(Boolean)
            .join('\n') || 'Waiting for setup script output...'}
        </div>
      )}
    </div>
  );
}

export default SetupScriptRunning;
