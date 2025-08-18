const STORAGE_KEY = 'project-executor-defaults';

interface ProjectExecutorDefaults {
  [projectId: string]: string;
}

export function getProjectExecutorDefault(projectId: string): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const defaults: ProjectExecutorDefaults = JSON.parse(stored);
    return defaults[projectId] || null;
  } catch (error) {
    console.error('Failed to get project executor default:', error);
    return null;
  }
}

export function setProjectExecutorDefault(
  projectId: string, 
  executor: string | null, 
  appDefault: string
): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const defaults: ProjectExecutorDefaults = stored ? JSON.parse(stored) : {};
    
    // Only save if the executor is different from the app default
    // If executor is null or same as app default, remove any stored override
    if (executor && executor !== appDefault) {
      defaults[projectId] = executor;
    } else {
      // Clear any existing override since it matches app default or is null
      delete defaults[projectId];
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch (error) {
    console.error('Failed to set project executor default:', error);
  }
}

export function clearProjectExecutorDefault(projectId: string, appDefault: string): void {
  setProjectExecutorDefault(projectId, null, appDefault);
}

export function getAllProjectExecutorDefaults(): ProjectExecutorDefaults {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to get all project executor defaults:', error);
    return {};
  }
}