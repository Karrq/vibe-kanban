import { offlineStorage } from './offline-storage';
import type { TaskWithAttemptStatus, ProjectWithBranch } from 'shared/types';

interface OfflineApiOptions {
  forceOffline?: boolean;
  skipCache?: boolean;
}

class OfflineApiWrapper {
  private isOnline(): boolean {
    return navigator.onLine;
  }

  async fetchWithFallback<T>(
    fetchFn: () => Promise<T>,
    getCacheFn: () => Promise<T | null>,
    setCacheFn: (data: T) => Promise<void>,
    options: OfflineApiOptions = {}
  ): Promise<{ data: T | null; fromCache: boolean; error?: Error }> {
    // If forced offline or actually offline, try cache first
    if (options.forceOffline || !this.isOnline()) {
      const cachedData = await getCacheFn();
      if (cachedData) {
        return { data: cachedData, fromCache: true };
      }
      
      // If no cache and offline, return error
      if (!this.isOnline()) {
        return { 
          data: null, 
          fromCache: false, 
          error: new Error('No cached data available offline') 
        };
      }
    }

    // Try to fetch from network
    if (!options.skipCache && this.isOnline()) {
      try {
        const freshData = await fetchFn();
        // Cache the fresh data
        await setCacheFn(freshData);
        return { data: freshData, fromCache: false };
      } catch (error) {
        // Network failed, try cache as fallback
        const cachedData = await getCacheFn();
        if (cachedData) {
          return { 
            data: cachedData, 
            fromCache: true, 
            error: error as Error 
          };
        }
        // No cache available
        return { 
          data: null, 
          fromCache: false, 
          error: error as Error 
        };
      }
    }

    // Skip cache option - only try network
    try {
      const freshData = await fetchFn();
      return { data: freshData, fromCache: false };
    } catch (error) {
      return { 
        data: null, 
        fromCache: false, 
        error: error as Error 
      };
    }
  }

  async getTasks(
    projectId: string,
    fetchFn: () => Promise<TaskWithAttemptStatus[]>,
    options: OfflineApiOptions = {}
  ): Promise<{ tasks: TaskWithAttemptStatus[]; fromCache: boolean; error?: Error }> {
    const result = await this.fetchWithFallback(
      fetchFn,
      () => offlineStorage.getCachedTasks(projectId),
      (tasks) => offlineStorage.cacheTasks(projectId, tasks),
      options
    );

    return {
      tasks: result.data || [],
      fromCache: result.fromCache,
      error: result.error
    };
  }

  async getProject(
    projectId: string,
    fetchFn: () => Promise<ProjectWithBranch>,
    options: OfflineApiOptions = {}
  ): Promise<{ project: ProjectWithBranch | null; fromCache: boolean; error?: Error }> {
    const result = await this.fetchWithFallback(
      fetchFn,
      () => offlineStorage.getCachedProject(projectId),
      (project) => offlineStorage.cacheProject(projectId, project),
      options
    );

    return {
      project: result.data,
      fromCache: result.fromCache,
      error: result.error
    };
  }

  async preloadTasksForOffline(
    projectId: string,
    tasks: TaskWithAttemptStatus[]
  ): Promise<void> {
    await offlineStorage.cacheTasks(projectId, tasks);
  }

  async preloadProjectForOffline(
    projectId: string,
    project: ProjectWithBranch
  ): Promise<void> {
    await offlineStorage.cacheProject(projectId, project);
  }

  async getDataAge(projectId: string): Promise<number | null> {
    return await offlineStorage.getTasksCacheAge(projectId);
  }

  async isDataStale(projectId: string): Promise<boolean> {
    return await offlineStorage.isDataStale(projectId);
  }

  async clearAllCache(): Promise<void> {
    await offlineStorage.clearCache();
  }
}

export const offlineApi = new OfflineApiWrapper();