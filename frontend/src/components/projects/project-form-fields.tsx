import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Folder, ChevronDown } from 'lucide-react';
import { useSystemInfo } from '@/hooks/use-system-info';
import {
  createScriptPlaceholderStrategy,
  ScriptPlaceholderContext,
} from '@/utils/script-placeholders';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';
import { getTextareaNoAutoCorrect } from '@/lib/textarea-utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EXECUTOR_TYPES, EXECUTOR_LABELS } from 'shared/types';

interface ProjectFormFieldsProps {
  isEditing: boolean;
  repoMode: 'existing' | 'new';
  setRepoMode: (mode: 'existing' | 'new') => void;
  gitRepoPath: string;
  handleGitRepoPathChange: (path: string) => void;
  setShowFolderPicker: (show: boolean) => void;
  parentPath: string;
  setParentPath: (path: string) => void;
  folderName: string;
  setFolderName: (name: string) => void;
  setName: (name: string) => void;
  name: string;
  setupScript: string;
  setSetupScript: (script: string) => void;
  devScript: string;
  setDevScript: (script: string) => void;
  cleanupScript: string;
  setCleanupScript: (script: string) => void;
  executorEnvScript: string;
  setExecutorEnvScript: (script: string) => void;
  promptTemplate: string;
  setPromptTemplate: (template: string) => void;
  defaultExecutor: string | null;
  setDefaultExecutor: (executor: string | null) => void;
  error: string;
}

export function ProjectFormFields({
  isEditing,
  repoMode,
  setRepoMode,
  gitRepoPath,
  handleGitRepoPathChange,
  setShowFolderPicker,
  parentPath,
  setParentPath,
  folderName,
  setFolderName,
  setName,
  name,
  setupScript,
  setSetupScript,
  devScript,
  setDevScript,
  cleanupScript,
  setCleanupScript,
  executorEnvScript,
  setExecutorEnvScript,
  promptTemplate,
  setPromptTemplate,
  defaultExecutor,
  setDefaultExecutor,
  error,
}: ProjectFormFieldsProps) {
  const { systemInfo } = useSystemInfo();
  const [setupScriptOpen, setSetupScriptOpen] = useState(false);
  const [devScriptOpen, setDevScriptOpen] = useState(false);
  const [cleanupScriptOpen, setCleanupScriptOpen] = useState(false);
  const [executorEnvScriptOpen, setExecutorEnvScriptOpen] = useState(false);
  const [promptTemplateOpen, setPromptTemplateOpen] = useState(false);
  const [defaultExecutorOpen, setDefaultExecutorOpen] = useState(false);

  // Create strategy-based placeholders
  const os_type = systemInfo ? systemInfo.os_type : 'unix';
  const placeholders = new ScriptPlaceholderContext(
    createScriptPlaceholderStrategy(os_type)
  ).getPlaceholders();

  return (
    <>
      {!isEditing && (
        <div className="space-y-3">
          <Label>Repository Type</Label>
          <div className="flex space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="repoMode"
                value="existing"
                checked={repoMode === 'existing'}
                onChange={(e) =>
                  setRepoMode(e.target.value as 'existing' | 'new')
                }
                className="text-primary"
              />
              <span className="text-sm">Use existing repository</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="repoMode"
                value="new"
                checked={repoMode === 'new'}
                onChange={(e) =>
                  setRepoMode(e.target.value as 'existing' | 'new')
                }
                className="text-primary"
              />
              <span className="text-sm">Create new repository</span>
            </label>
          </div>
        </div>
      )}

      {repoMode === 'existing' || isEditing ? (
        <div className="space-y-2">
          <Label htmlFor="git-repo-path">Git Repository Path</Label>
          <div className="flex space-x-2">
            <Input
              id="git-repo-path"
              type="text"
              value={gitRepoPath}
              onChange={(e) => handleGitRepoPathChange(e.target.value)}
              placeholder="/path/to/your/existing/repo"
              required
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFolderPicker(true)}
            >
              <Folder className="h-4 w-4" />
            </Button>
          </div>
          {!isEditing && (
            <p className="text-sm text-muted-foreground">
              Select a folder that already contains a git repository
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="parent-path">Parent Directory</Label>
            <div className="flex space-x-2">
              <Input
                id="parent-path"
                type="text"
                value={parentPath}
                onChange={(e) => setParentPath(e.target.value)}
                placeholder="/path/to/parent/directory"
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFolderPicker(true)}
              >
                <Folder className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Choose where to create the new repository
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="folder-name">Repository Folder Name</Label>
            <Input
              id="folder-name"
              type="text"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                if (e.target.value) {
                  setName(
                    e.target.value
                      .replace(/[-_]/g, ' ')
                      .replace(/\b\w/g, (l) => l.toUpperCase())
                  );
                }
              }}
              placeholder="my-awesome-project"
              required
              className="flex-1"
            />
            <p className="text-sm text-muted-foreground">
              The project name will be auto-populated from this folder name
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Project Name</Label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter project name"
          required
        />
      </div>

      {/* Divider between project options and scripts */}
      <Separator className="my-4" />

      {/* Scripts Section - Individual collapsibles */}
      <div className="space-y-3">
        {/* Setup Script */}
        <Collapsible open={setupScriptOpen} onOpenChange={setSetupScriptOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between p-4 hover:bg-accent/50 transition-colors border border-border rounded-t-md data-[state=open]:rounded-bl-none data-[state=open]:rounded-br-none data-[state=closed]:rounded-b-md"
            >
              <span className="font-medium">Setup Script (Optional)</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  setupScriptOpen ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-accent/20 rounded-b-md border border-t-0 border-border space-y-2">
              <textarea
                id="setup-script"
                value={setupScript}
                onChange={(e) => setSetupScript(e.target.value)}
                placeholder={placeholders.setup}
                rows={4}
                className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
                {...getTextareaNoAutoCorrect()}
              />
              <p className="text-sm text-muted-foreground">
                This script will run after creating the worktree and before the
                executor starts. Use it for setup tasks like installing
                dependencies or preparing the environment.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Dev Script */}
        <Collapsible open={devScriptOpen} onOpenChange={setDevScriptOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between p-4 hover:bg-accent/50 transition-colors border border-border rounded-t-md data-[state=open]:rounded-bl-none data-[state=open]:rounded-br-none data-[state=closed]:rounded-b-md"
            >
              <span className="font-medium">Dev Server Script (Optional)</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  devScriptOpen ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-accent/20 rounded-b-md border border-t-0 border-border space-y-2">
              <textarea
                id="dev-script"
                value={devScript}
                onChange={(e) => setDevScript(e.target.value)}
                placeholder={placeholders.dev}
                rows={4}
                className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
                {...getTextareaNoAutoCorrect()}
              />
              <p className="text-sm text-muted-foreground">
                This script can be run from task attempts to start a development
                server. Use it to quickly start your project's dev server for
                testing changes.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Cleanup Script */}
        <Collapsible
          open={cleanupScriptOpen}
          onOpenChange={setCleanupScriptOpen}
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between p-4 hover:bg-accent/50 transition-colors border border-border rounded-t-md data-[state=open]:rounded-bl-none data-[state=open]:rounded-br-none data-[state=closed]:rounded-b-md"
            >
              <span className="font-medium">Cleanup Script (Optional)</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  cleanupScriptOpen ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-accent/20 rounded-b-md border border-t-0 border-border space-y-2">
              <textarea
                id="cleanup-script"
                value={cleanupScript}
                onChange={(e) => setCleanupScript(e.target.value)}
                placeholder={placeholders.cleanup}
                rows={4}
                className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
                {...getTextareaNoAutoCorrect()}
              />
              <p className="text-sm text-muted-foreground">
                This script will run after coding agent execution is complete.
                Use it for quality assurance tasks like running linters,
                formatters, tests, or other validation steps.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Executor Environment Script */}
        <Collapsible
          open={executorEnvScriptOpen}
          onOpenChange={setExecutorEnvScriptOpen}
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between p-4 hover:bg-accent/50 transition-colors border border-border rounded-t-md data-[state=open]:rounded-bl-none data-[state=open]:rounded-br-none data-[state=closed]:rounded-b-md"
            >
              <span className="font-medium">
                Executor Environment Script (Optional)
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  executorEnvScriptOpen ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-accent/20 rounded-b-md border border-t-0 border-border space-y-2">
              <textarea
                id="executor-env-script"
                value={executorEnvScript}
                onChange={(e) => setExecutorEnvScript(e.target.value)}
                placeholder={placeholders.executorEnv}
                rows={4}
                className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
                {...getTextareaNoAutoCorrect()}
              />
              <p className="text-sm text-muted-foreground">
                This script will run before the executor starts to set up
                environment variables and configuration. The executor command
                and arguments are passed to your script - make sure to call the
                executor at the end of your script.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Prompt Template */}
        <Collapsible
          open={promptTemplateOpen}
          onOpenChange={setPromptTemplateOpen}
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between p-4 hover:bg-accent/50 transition-colors border border-border rounded-t-md data-[state=open]:rounded-bl-none data-[state=open]:rounded-br-none data-[state=closed]:rounded-b-md"
            >
              <span className="font-medium">
                Prompt Template
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  promptTemplateOpen ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-accent/20 rounded-b-md border border-t-0 border-border space-y-2">
              <textarea
                id="prompt-template"
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                className="w-full min-h-[100px] rounded-md bg-background p-3 font-mono text-sm"
                placeholder="project_id: $VK_PROJECT_ID

Task title: $VK_TASK_TITLE
Task description: $VK_TASK_DESCRIPTION"
                {...getTextareaNoAutoCorrect()}
              />
              <p className="text-sm text-muted-foreground">
                Template for prompts sent to AI executors. Available variables:
                <br />
                <code className="text-xs">$VK_PROJECT_ID</code> - Project ID
                <br />
                <code className="text-xs">$VK_PROJECT_NAME</code> - Project name
                <br />
                <code className="text-xs">$VK_TASK_ID</code> - Task ID
                <br />
                <code className="text-xs">$VK_TASK_TITLE</code> - Task title
                <br />
                <code className="text-xs">$VK_TASK_DESCRIPTION</code> - Task description
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Default Executor */}
        <Collapsible
          open={defaultExecutorOpen}
          onOpenChange={setDefaultExecutorOpen}
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between p-4 hover:bg-accent/50 transition-colors border border-border rounded-t-md data-[state=open]:rounded-bl-none data-[state=open]:rounded-br-none data-[state=closed]:rounded-b-md"
            >
              <span className="font-medium">
                Default Executor
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  defaultExecutorOpen ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 bg-accent/20 rounded-b-md border border-t-0 border-border space-y-2">
              <Select 
                value={defaultExecutor || 'none'} 
                onValueChange={(value) => setDefaultExecutor(value === 'none' ? null : value)}
              >
                <SelectTrigger id="default-executor">
                  <SelectValue placeholder="Select default executor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use app default</SelectItem>
                  {EXECUTOR_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {EXECUTOR_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Override the app-wide default executor for new task attempts in this project.
                If not set, the app default executor will be used.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
