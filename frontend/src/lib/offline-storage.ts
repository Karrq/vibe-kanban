import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type {
  ProjectWithBranch,
  TaskWithAttemptStatus,
  TaskTemplate,
  ExecutionProcessWithTask,
} from 'shared/types';

interface VibeKanbanDB extends DBSchema {
  projects: {
    key: string;
    value: ProjectWithBranch & { lastSynced: number };
  };
  tasks: {
    key: string;
    value: TaskWithAttemptStatus & { lastSynced: number; projectId: string };
    indexes: { 'by-project': string };
  };
  templates: {
    key: string;
    value: TaskTemplate & { lastSynced: number };
  };
  processes: {
    key: string;
    value: ExecutionProcessWithTask & { lastSynced: number };
    indexes: { 'by-task': string };
  };
  metadata: {
    key: string;
    value: {
      version: number;
      lastFullSync?: number;
      offlineChanges?: any[];
    };
  };
}

const DB_NAME = 'vibe-kanban-offline';
const DB_VERSION = 1;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

class OfflineStorage {
  private db: IDBPDatabase<VibeKanbanDB> | null = null;

  async initialize(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<VibeKanbanDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Projects store
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }

        // Tasks store
        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
          taskStore.createIndex('by-project', 'projectId');
        }

        // Templates store
        if (!db.objectStoreNames.contains('templates')) {
          db.createObjectStore('templates', { keyPath: 'id' });
        }

        // Processes store
        if (!db.objectStoreNames.contains('processes')) {
          const processStore = db.createObjectStore('processes', { keyPath: 'id' });
          processStore.createIndex('by-task', 'task.id');
        }

        // Metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata');
        }
      },
    });

    // Initialize metadata
    const metadata = await this.db.get('metadata', 'app');
    if (!metadata) {
      await this.db.put('metadata', {
        version: DB_VERSION,
        lastFullSync: undefined,
        offlineChanges: [],
      }, 'app');
    }
  }

  private async ensureDb(): Promise<IDBPDatabase<VibeKanbanDB>> {
    if (!this.db) {
      await this.initialize();
    }
    return this.db!;
  }

  // Project operations
  async saveProject(project: ProjectWithBranch): Promise<void> {
    const db = await this.ensureDb();
    await db.put('projects', {
      ...project,
      lastSynced: Date.now(),
    });
  }

  async getProject(id: string): Promise<ProjectWithBranch | undefined> {
    const db = await this.ensureDb();
    const cached = await db.get('projects', id);
    if (!cached) return undefined;
    
    const { lastSynced, ...project } = cached;
    return project;
  }

  async getAllProjects(): Promise<ProjectWithBranch[]> {
    const db = await this.ensureDb();
    const cached = await db.getAll('projects');
    return cached.map(({ lastSynced, ...p }) => p);
  }

  // Task operations
  async saveTasks(tasks: TaskWithAttemptStatus[], projectId: string): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction('tasks', 'readwrite');
    
    await Promise.all([
      ...tasks.map(task => 
        tx.store.put({
          ...task,
          projectId,
          lastSynced: Date.now(),
        })
      ),
      tx.done,
    ]);
  }

  async getTasksByProject(projectId: string): Promise<TaskWithAttemptStatus[]> {
    const db = await this.ensureDb();
    const cached = await db.getAllFromIndex('tasks', 'by-project', projectId);
    return cached.map(({ lastSynced, projectId, ...t }) => t);
  }

  async getTask(id: string): Promise<TaskWithAttemptStatus | undefined> {
    const db = await this.ensureDb();
    const cached = await db.get('tasks', id);
    if (!cached) return undefined;
    
    const { lastSynced, projectId, ...task } = cached;
    return task;
  }

  async updateTask(task: TaskWithAttemptStatus, projectId: string): Promise<void> {
    const db = await this.ensureDb();
    await db.put('tasks', {
      ...task,
      projectId,
      lastSynced: Date.now(),
    });
  }

  // Template operations
  async saveTemplates(templates: TaskTemplate[]): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction('templates', 'readwrite');
    
    await Promise.all([
      ...templates.map(template => 
        tx.store.put({
          ...template,
          lastSynced: Date.now(),
        })
      ),
      tx.done,
    ]);
  }

  async getTemplates(): Promise<TaskTemplate[]> {
    const db = await this.ensureDb();
    const cached = await db.getAll('templates');
    return cached.map(({ lastSynced, ...t }) => t);
  }

  // Process operations
  async saveProcess(process: ExecutionProcessWithTask): Promise<void> {
    const db = await this.ensureDb();
    await db.put('processes', {
      ...process,
      lastSynced: Date.now(),
    });
  }

  async getProcessesByTask(taskId: string): Promise<ExecutionProcessWithTask[]> {
    const db = await this.ensureDb();
    const cached = await db.getAllFromIndex('processes', 'by-task', taskId);
    return cached.map(({ lastSynced, ...p }) => p);
  }

  // Metadata operations
  async setLastFullSync(): Promise<void> {
    const db = await this.ensureDb();
    const metadata = await db.get('metadata', 'app');
    if (metadata) {
      metadata.lastFullSync = Date.now();
      await db.put('metadata', metadata, 'app');
    }
  }

  async getLastFullSync(): Promise<number | undefined> {
    const db = await this.ensureDb();
    const metadata = await db.get('metadata', 'app');
    return metadata?.lastFullSync;
  }

  async isDataStale(lastSynced?: number): Promise<boolean> {
    if (!lastSynced) return true;
    return Date.now() - lastSynced > CACHE_DURATION;
  }

  // Offline changes tracking
  async addOfflineChange(change: any): Promise<void> {
    const db = await this.ensureDb();
    const metadata = await db.get('metadata', 'app');
    if (metadata) {
      metadata.offlineChanges = [...(metadata.offlineChanges || []), change];
      await db.put('metadata', metadata, 'app');
    }
  }

  async getOfflineChanges(): Promise<any[]> {
    const db = await this.ensureDb();
    const metadata = await db.get('metadata', 'app');
    return metadata?.offlineChanges || [];
  }

  async clearOfflineChanges(): Promise<void> {
    const db = await this.ensureDb();
    const metadata = await db.get('metadata', 'app');
    if (metadata) {
      metadata.offlineChanges = [];
      await db.put('metadata', metadata, 'app');
    }
  }

  // Clear all data
  async clearAll(): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction(['projects', 'tasks', 'templates', 'processes'], 'readwrite');
    
    await Promise.all([
      tx.objectStore('projects').clear(),
      tx.objectStore('tasks').clear(),
      tx.objectStore('templates').clear(),
      tx.objectStore('processes').clear(),
      tx.done,
    ]);
  }
}

export const offlineStorage = new OfflineStorage();