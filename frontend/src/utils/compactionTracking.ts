const COMPACTION_ATTEMPTS_KEY = 'vibe-kanban-compaction-attempts';

interface CompactionAttempt {
  taskId: string;
  timestamp: number;
}

export function trackCompactionAttempt(taskId: string): void {
  const attempts = getCompactionAttempts();
  attempts.push({
    taskId,
    timestamp: Date.now()
  });
  
  // Keep only last 100 attempts to prevent unbounded growth
  const trimmedAttempts = attempts.slice(-100);
  
  localStorage.setItem(COMPACTION_ATTEMPTS_KEY, JSON.stringify(trimmedAttempts));
}

export function getCompactionAttempts(): CompactionAttempt[] {
  try {
    const stored = localStorage.getItem(COMPACTION_ATTEMPTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function hasRecentCompactionAttempt(taskId: string, withinMs: number = 60000): boolean {
  const attempts = getCompactionAttempts();
  const now = Date.now();
  
  return attempts.some(
    attempt => attempt.taskId === taskId && (now - attempt.timestamp) < withinMs
  );
}

export function clearOldCompactionAttempts(olderThanMs: number = 86400000): void {
  const attempts = getCompactionAttempts();
  const now = Date.now();
  
  const filtered = attempts.filter(
    attempt => (now - attempt.timestamp) < olderThanMs
  );
  
  localStorage.setItem(COMPACTION_ATTEMPTS_KEY, JSON.stringify(filtered));
}