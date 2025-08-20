import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { TaskWithAttemptStatus, ProjectWithBranch } from 'shared/types';

interface VibeKanbanDB extends DBSchema {
  tasks: {
    key: string;
    value: {
      projectId: string;
      tasks: TaskWithAttemptStatus[];
      timestamp: number;
    };
  };
  projects: {
    key: string;
    value: {
      project: ProjectWithBranch;
      timestamp: number;
    };
  };
  syncStatus: {
    key: string;
    value: {
      lastSync: number;
      pendingChanges: boolean;
    };
  };
}

const DB_NAME = 'vibe-kanban-offline';
const DB_VERSION = 1;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

class OfflineStorage {
  private db: IDBPDatabase<VibeKanbanDB> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    
    this.db = await openDB<VibeKanbanDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create stores if they don't exist
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks');
        }
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects');
        }
        if (!db.objectStoreNames.contains('syncStatus')) {
          db.createObjectStore('syncStatus');
        }
      },
    });
  }

  async cacheTasks(projectId: string, tasks: TaskWithAttemptStatus[]): Promise<void> {
    await this.init();
    if (!this.db) return;

    await this.db.put('tasks', {
      projectId,
      tasks,
      timestamp: Date.now(),
    }, projectId);

    // Update sync status
    await this.updateSyncStatus(projectId, false);
  }

  async getCachedTasks(projectId: string): Promise<TaskWithAttemptStatus[] | null> {
    await this.init();
    if (!this.db) return null;

    const cached = await this.db.get('tasks', projectId);
    if (!cached) return null;

    // Check if cache is still valid
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_DURATION) {
      // Cache is stale but still return it (will be used as fallback)
      return cached.tasks;
    }

    return cached.tasks;
  }

  async cacheProject(projectId: string, project: ProjectWithBranch): Promise<void> {
    await this.init();
    if (!this.db) return;

    await this.db.put('projects', {
      project,
      timestamp: Date.now(),
    }, projectId);
  }

  async getCachedProject(projectId: string): Promise<ProjectWithBranch | null> {
    await this.init();
    if (!this.db) return null;

    const cached = await this.db.get('projects', projectId);
    if (!cached) return null;

    return cached.project;
  }

  async updateSyncStatus(key: string, hasPendingChanges: boolean): Promise<void> {
    await this.init();
    if (!this.db) return;

    await this.db.put('syncStatus', {
      lastSync: Date.now(),
      pendingChanges: hasPendingChanges,
    }, key);
  }

  async getSyncStatus(key: string): Promise<{ lastSync: number; pendingChanges: boolean } | null> {
    await this.init();
    if (!this.db) return null;

    return await this.db.get('syncStatus', key) || null;
  }

  async clearCache(): Promise<void> {
    await this.init();
    if (!this.db) return;

    const tx = this.db.transaction(['tasks', 'projects', 'syncStatus'], 'readwrite');
    await Promise.all([
      tx.objectStore('tasks').clear(),
      tx.objectStore('projects').clear(),
      tx.objectStore('syncStatus').clear(),
    ]);
  }

  async getTasksCacheAge(projectId: string): Promise<number | null> {
    await this.init();
    if (!this.db) return null;

    const cached = await this.db.get('tasks', projectId);
    if (!cached) return null;

    return Date.now() - cached.timestamp;
  }

  async isDataStale(projectId: string): Promise<boolean> {
    const age = await this.getTasksCacheAge(projectId);
    if (age === null) return true;
    return age > CACHE_DURATION;
  }
}

export const offlineStorage = new OfflineStorage();