// Temporary type extensions for executor environment script field
// This will be removed once the backend types are updated

import type {
  Project as BaseProject,
  CreateProject as BaseCreateProject,
  UpdateProject as BaseUpdateProject,
  CreateProjectFromGitHub as BaseCreateProjectFromGitHub,
  ProjectWithBranch as BaseProjectWithBranch,
} from 'shared/types';

export interface Project extends BaseProject {
  executor_env_script?: string | null;
}

export interface CreateProject extends BaseCreateProject {
  executor_env_script: string | null;
}

export interface UpdateProject extends BaseUpdateProject {
  executor_env_script?: string | null;
}

export interface CreateProjectFromGitHub extends BaseCreateProjectFromGitHub {
  executor_env_script: string | null;
}

export interface ProjectWithBranch extends BaseProjectWithBranch {
  executor_env_script?: string | null;
}