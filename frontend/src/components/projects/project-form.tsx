import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FolderPicker } from '@/components/ui/folder-picker';
import { TaskTemplateManager } from '@/components/TaskTemplateManager';
import { ProjectFormFields } from './project-form-fields';
import { GitHubRepositoryPicker } from './github-repository-picker';
import {
  CreateProject,
  CreateProjectFromGitHub,
  Environment,
  Project,
  UpdateProject,
} from 'shared/types';
import { projectsApi, configApi, githubApi, RepositoryInfo } from '@/lib/api';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { getTextareaNoAutoCorrect } from '@/lib/textarea-utils';
import { getProjectExecutorDefault, setProjectExecutorDefault } from '@/lib/project-executor-defaults';
import { useConfig } from '@/components/config-provider';

interface ProjectFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  project?: Project | null;
}

export function ProjectForm({
  open,
  onClose,
  onSuccess,
  project,
}: ProjectFormProps) {
  const { config } = useConfig();
  const [name, setName] = useState(project?.name || '');
  const [gitRepoPath, setGitRepoPath] = useState(project?.git_repo_path || '');
  const [setupScript, setSetupScript] = useState(project?.setup_script ?? '');
  const [devScript, setDevScript] = useState(project?.dev_script ?? '');
  const [cleanupScript, setCleanupScript] = useState(
    project?.cleanup_script ?? ''
  );
  const [executorEnvScript, setExecutorEnvScript] = useState(
    project?.executor_env_script ?? ''
  );
  const [promptTemplate, setPromptTemplate] = useState(
    project?.prompt_template ?? `project_id: $VK_PROJECT_ID

Task title: $VK_TASK_TITLE
Task description: $VK_TASK_DESCRIPTION`
  );
  const [defaultExecutor, setDefaultExecutor] = useState<string | null>(
    project?.id ? getProjectExecutorDefault(project.id) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [repoMode, setRepoMode] = useState<'existing' | 'new'>('existing');
  const [parentPath, setParentPath] = useState('');
  const [folderName, setFolderName] = useState('');

  // Environment and GitHub repository state
  const [environment, setEnvironment] = useState<Environment>('local');
  const [selectedRepository, setSelectedRepository] =
    useState<RepositoryInfo | null>(null);
  const [modeLoading, setModeLoading] = useState(true);
  const [githubSetupScriptOpen, setGithubSetupScriptOpen] = useState(false);
  const [githubDevScriptOpen, setGithubDevScriptOpen] = useState(false);
  const [githubCleanupScriptOpen, setGithubCleanupScriptOpen] = useState(false);
  const [githubExecutorEnvScriptOpen, setGithubExecutorEnvScriptOpen] = useState(false);

  const isEditing = !!project;

  // Load cloud mode configuration
  useEffect(() => {
    const loadMode = async () => {
      try {
        const constants = await configApi.getConstants();
        setEnvironment(constants.mode);
      } catch (err) {
        console.error('Failed to load config constants:', err);
      } finally {
        setModeLoading(false);
      }
    };

    if (!isEditing) {
      loadMode();
    } else {
      setModeLoading(false);
    }
  }, [isEditing]);

  // Update form fields when project prop changes
  useEffect(() => {
    if (project) {
      setName(project.name || '');
      setGitRepoPath(project.git_repo_path || '');
      setSetupScript(project.setup_script ?? '');
      setDevScript(project.dev_script ?? '');
      setCleanupScript(project.cleanup_script ?? '');
      setExecutorEnvScript(project.executor_env_script ?? '');
      setPromptTemplate(project.prompt_template ?? '');
    } else {
      setName('');
      setGitRepoPath('');
      setSetupScript('');
      setDevScript('');
      setCleanupScript('');
      setExecutorEnvScript('');
      setPromptTemplate('');
      setSelectedRepository(null);
    }
  }, [project]);

  // Auto-populate project name from directory name
  const handleGitRepoPathChange = (path: string) => {
    setGitRepoPath(path);

    // Only auto-populate name for new projects
    if (!isEditing && path) {
      // Extract the last part of the path (directory name)
      const dirName = path.split('/').filter(Boolean).pop() || '';
      if (dirName) {
        // Clean up the directory name for a better project name
        const cleanName = dirName
          .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
          .replace(/\b\w/g, (l) => l.toUpperCase()); // Capitalize first letter of each word
        setName(cleanName);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Get app default executor to compare against
    const appDefaultExecutor = config?.executor.type || 'claude';
    setError('');
    setLoading(true);

    try {
      if (isEditing) {
        // Editing existing project (local mode only)
        let finalGitRepoPath = gitRepoPath;
        if (repoMode === 'new') {
          finalGitRepoPath = `${parentPath}/${folderName}`.replace(/\/+/g, '/');
        }

        const updateData: UpdateProject = {
          name,
          git_repo_path: finalGitRepoPath,
          setup_script: setupScript.trim() || null,
          dev_script: devScript.trim() || null,
          cleanup_script: cleanupScript.trim() || null,
          executor_env_script: executorEnvScript.trim() || null,
          prompt_template: promptTemplate.trim() || '',  // Empty string means the user cleared it
        };

        await projectsApi.update(project.id, updateData);
        // Save executor default to localStorage only if different from app default
        setProjectExecutorDefault(project.id, defaultExecutor, appDefaultExecutor);
      } else {
        // Creating new project
        if (environment === 'cloud') {
          // Cloud mode: Create project from GitHub repository
          if (!selectedRepository) {
            setError('Please select a GitHub repository');
            return;
          }

          const githubData: CreateProjectFromGitHub = {
            repository_id: BigInt(selectedRepository.id),
            name,
            clone_url: selectedRepository.clone_url,
            setup_script: setupScript.trim() || null,
            dev_script: devScript.trim() || null,
            cleanup_script: cleanupScript.trim() || null,
            executor_env_script: executorEnvScript.trim() || null,
            prompt_template: promptTemplate.trim() || null,  // Backend will provide default if null
          };

          const newProject = await githubApi.createProjectFromRepository(githubData);
          // Save executor default to localStorage for new project only if different from app default
          if (newProject?.id) {
            setProjectExecutorDefault(newProject.id, defaultExecutor, appDefaultExecutor);
          }
        } else {
          // Local mode: Create local project
          let finalGitRepoPath = gitRepoPath;
          if (repoMode === 'new') {
            finalGitRepoPath = `${parentPath}/${folderName}`.replace(
              /\/+/g,
              '/'
            );
          }

          const createData: CreateProject = {
            name,
            git_repo_path: finalGitRepoPath,
            use_existing_repo: repoMode === 'existing',
            setup_script: setupScript.trim() || null,
            dev_script: devScript.trim() || null,
            cleanup_script: cleanupScript.trim() || null,
            executor_env_script: executorEnvScript.trim() || null,
            prompt_template: promptTemplate.trim() || null,  // Backend will provide default if null
          };

          const newProject = await projectsApi.create(createData);
          // Save executor default to localStorage for new project only if different from app default
          if (newProject?.id) {
            setProjectExecutorDefault(newProject.id, defaultExecutor, appDefaultExecutor);
          }
        }
      }

      onSuccess();
      // Reset form
      setName('');
      setGitRepoPath('');
      setSetupScript('');
      setDevScript('');
      setCleanupScript('');
      setExecutorEnvScript('');
      setPromptTemplate('');
      setParentPath('');
      setFolderName('');
      setSelectedRepository(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (project) {
      setName(project.name || '');
      setGitRepoPath(project.git_repo_path || '');
      setSetupScript(project.setup_script ?? '');
      setDevScript(project.dev_script ?? '');
      setCleanupScript(project.cleanup_script ?? '');
      setExecutorEnvScript(project.executor_env_script ?? '');
      setPromptTemplate(project.prompt_template ?? '');
    } else {
      setName('');
      setGitRepoPath('');
      setSetupScript('');
      setDevScript('');
      setCleanupScript('');
      setExecutorEnvScript('');
      setPromptTemplate('');
    }
    setParentPath('');
    setFolderName('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={isEditing ? 'sm:max-w-[600px]' : 'sm:max-w-[425px]'}
      >
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Project' : 'Create New Project'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Make changes to your project here. Click save when you're done."
              : 'Choose whether to use an existing git repository or create a new one.'}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          <Tabs defaultValue="general" className="w-full -mt-2">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="templates">Task Templates</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <ProjectFormFields
                  isEditing={isEditing}
                  repoMode={repoMode}
                  setRepoMode={setRepoMode}
                  gitRepoPath={gitRepoPath}
                  handleGitRepoPathChange={handleGitRepoPathChange}
                  setShowFolderPicker={setShowFolderPicker}
                  parentPath={parentPath}
                  setParentPath={setParentPath}
                  folderName={folderName}
                  setFolderName={setFolderName}
                  setName={setName}
                  name={name}
                  setupScript={setupScript}
                  setSetupScript={setSetupScript}
                  devScript={devScript}
                  setDevScript={setDevScript}
                  cleanupScript={cleanupScript}
                  setCleanupScript={setCleanupScript}
                  executorEnvScript={executorEnvScript}
                  setExecutorEnvScript={setExecutorEnvScript}
                  promptTemplate={promptTemplate}
                  setPromptTemplate={setPromptTemplate}
                  defaultExecutor={defaultExecutor}
                  setDefaultExecutor={setDefaultExecutor}
                  error={error}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || !name.trim() || !gitRepoPath.trim()}
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
            <TabsContent value="templates" className="mt-0 pt-0">
              <TaskTemplateManager projectId={project?.id} />
            </TabsContent>
          </Tabs>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {modeLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading...</span>
              </div>
            ) : environment === 'cloud' ? (
              // Cloud mode: Show only GitHub repositories
              <>
                <GitHubRepositoryPicker
                  selectedRepository={selectedRepository}
                  onRepositorySelect={setSelectedRepository}
                  onNameChange={setName}
                  name={name}
                  error={error}
                />

                {/* Divider between repository and scripts */}
                <Separator className="my-4" />

                {/* Scripts Section - Individual collapsibles */}
                <div className="space-y-3">
                  {/* Setup Script */}
                  <Collapsible open={githubSetupScriptOpen} onOpenChange={setGithubSetupScriptOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-between p-4 hover:bg-accent/50 transition-colors border border-border rounded-t-md data-[state=open]:rounded-bl-none data-[state=open]:rounded-br-none data-[state=closed]:rounded-b-md"
                      >
                        <span className="font-medium">Setup Script (Optional)</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-200 ${
                            githubSetupScriptOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 bg-accent/20 rounded-b-md border border-t-0 border-border space-y-2">
                        <textarea
                          id="setup-script"
                          placeholder="e.g., npm install"
                          value={setupScript}
                          onChange={(e) => setSetupScript(e.target.value)}
                          className="w-full p-2 border border-input bg-background text-foreground rounded-md resize-none"
                          rows={3}
                          {...getTextareaNoAutoCorrect()}
                        />
                        <p className="text-sm text-muted-foreground">
                          This script will run after cloning the repository and before the
                          executor starts. Use it for setup tasks like installing dependencies
                          or preparing the environment.
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Dev Script */}
                  <Collapsible open={githubDevScriptOpen} onOpenChange={setGithubDevScriptOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-between p-4 hover:bg-accent/50 transition-colors border border-border rounded-t-md data-[state=open]:rounded-bl-none data-[state=open]:rounded-br-none data-[state=closed]:rounded-b-md"
                      >
                        <span className="font-medium">Dev Server Script (Optional)</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-200 ${
                            githubDevScriptOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 bg-accent/20 rounded-b-md border border-t-0 border-border space-y-2">
                        <textarea
                          id="dev-script"
                          placeholder="e.g., npm run dev"
                          value={devScript}
                          onChange={(e) => setDevScript(e.target.value)}
                          className="w-full p-2 border border-input bg-background text-foreground rounded-md resize-none"
                          rows={3}
                          {...getTextareaNoAutoCorrect()}
                        />
                        <p className="text-sm text-muted-foreground">
                          This script can be run from task attempts to start a development
                          server. Use it to quickly start your project's dev server for testing
                          changes.
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Cleanup Script */}
                  <Collapsible open={githubCleanupScriptOpen} onOpenChange={setGithubCleanupScriptOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-between p-4 hover:bg-accent/50 transition-colors border border-border rounded-t-md data-[state=open]:rounded-bl-none data-[state=open]:rounded-br-none data-[state=closed]:rounded-b-md"
                      >
                        <span className="font-medium">Cleanup Script (Optional)</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-200 ${
                            githubCleanupScriptOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 bg-accent/20 rounded-b-md border border-t-0 border-border space-y-2">
                        <textarea
                          id="cleanup-script"
                          placeholder="e.g., docker-compose down"
                          value={cleanupScript}
                          onChange={(e) => setCleanupScript(e.target.value)}
                          className="w-full p-2 border border-input bg-background text-foreground rounded-md resize-none"
                          rows={3}
                          {...getTextareaNoAutoCorrect()}
                        />
                        <p className="text-sm text-muted-foreground">
                          This script will run after coding agent execution is complete. Use it
                          for quality assurance tasks like running linters, formatters, tests,
                          or other validation steps.
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Executor Environment Script */}
                  <Collapsible open={githubExecutorEnvScriptOpen} onOpenChange={setGithubExecutorEnvScriptOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-between p-4 hover:bg-accent/50 transition-colors border border-border rounded-t-md data-[state=open]:rounded-bl-none data-[state=open]:rounded-br-none data-[state=closed]:rounded-b-md"
                      >
                        <span className="font-medium">Executor Environment Script (Optional)</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-200 ${
                            githubExecutorEnvScriptOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 bg-accent/20 rounded-b-md border border-t-0 border-border space-y-2">
                        <textarea
                          id="executor-env-script"
                          placeholder="e.g., export API_KEY=..., source .env"
                          value={executorEnvScript}
                          onChange={(e) => setExecutorEnvScript(e.target.value)}
                          className="w-full p-2 border border-input bg-background text-foreground rounded-md resize-none"
                          rows={3}
                          {...getTextareaNoAutoCorrect()}
                        />
                        <p className="text-sm text-muted-foreground">
                          This script will run before the executor starts to set up environment
                          variables and configuration. Use it to load API keys, configure
                          environment-specific settings, or source environment files.
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </>
            ) : (
              // Local mode: Show existing form
              <ProjectFormFields
                isEditing={isEditing}
                repoMode={repoMode}
                setRepoMode={setRepoMode}
                gitRepoPath={gitRepoPath}
                handleGitRepoPathChange={handleGitRepoPathChange}
                setShowFolderPicker={setShowFolderPicker}
                parentPath={parentPath}
                setParentPath={setParentPath}
                folderName={folderName}
                setFolderName={setFolderName}
                setName={setName}
                name={name}
                setupScript={setupScript}
                setSetupScript={setSetupScript}
                devScript={devScript}
                setDevScript={setDevScript}
                cleanupScript={cleanupScript}
                setCleanupScript={setCleanupScript}
                executorEnvScript={executorEnvScript}
                setExecutorEnvScript={setExecutorEnvScript}
                promptTemplate={promptTemplate}
                setPromptTemplate={setPromptTemplate}
                defaultExecutor={defaultExecutor}
                setDefaultExecutor={setDefaultExecutor}
                error={error}
              />
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  loading ||
                  !name.trim() ||
                  (environment === 'cloud'
                    ? !selectedRepository
                    : repoMode === 'existing'
                      ? !gitRepoPath.trim()
                      : !parentPath.trim() || !folderName.trim())
                }
              >
                {loading ? 'Creating...' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>

      <FolderPicker
        open={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        onSelect={(path) => {
          if (repoMode === 'existing' || isEditing) {
            handleGitRepoPathChange(path);
          } else {
            setParentPath(path);
          }
          setShowFolderPicker(false);
        }}
        value={repoMode === 'existing' || isEditing ? gitRepoPath : parentPath}
        title={
          repoMode === 'existing' || isEditing
            ? 'Select Git Repository'
            : 'Select Parent Directory'
        }
        description={
          repoMode === 'existing' || isEditing
            ? 'Choose an existing git repository'
            : 'Choose where to create the new repository'
        }
      />
    </Dialog>
  );
}
