import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useKanbanKeyboardNavigation,
  useKeyboardShortcuts,
} from '@/lib/keyboard-shortcuts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Project } from 'shared/types';
import { ProjectForm } from './project-form';
import { projectsApi } from '@/lib/api';
import { AlertCircle, Archive, Loader2, Plus, Search } from 'lucide-react';
import ProjectCard from '@/components/projects/ProjectCard.tsx';
import { useArchive } from '@/hooks/useArchive';

export function ProjectList() {
  const navigate = useNavigate();
  const {
    filterProjects,
    toggleProjectArchive,
    isProjectArchived,
    archivedCounts,
    showArchivedProjects,
    toggleShowArchivedProjects,
    hasArchivedProjects,
  } = useArchive();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);
  const [focusedColumn, setFocusedColumn] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchivedIndicator, setShowArchivedIndicator] = useState(false);

  // Filter projects based on archive status and search
  const { visible: visibleProjects, hasOnlyArchived } = filterProjects(
    projects,
    searchQuery
  );

  // Update archived indicator
  useEffect(() => {
    setShowArchivedIndicator(hasOnlyArchived);
  }, [hasOnlyArchived]);

  const fetchProjects = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await projectsApi.getAll();
      setProjects(result);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setError('Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingProject(null);
    fetchProjects();
  };

  // Group projects by grid columns (3 columns for lg, 2 for md, 1 for sm)
  const getGridColumns = () => {
    const screenWidth = window.innerWidth;
    if (screenWidth >= 1024) return 3; // lg
    if (screenWidth >= 768) return 2; // md
    return 1; // sm
  };

  const groupProjectsByColumns = (projects: Project[], columns: number) => {
    const grouped: Record<string, Project[]> = {};
    for (let i = 0; i < columns; i++) {
      grouped[`column-${i}`] = [];
    }

    projects.forEach((project, index) => {
      const columnIndex = index % columns;
      grouped[`column-${columnIndex}`].push(project);
    });

    return grouped;
  };

  const columns = getGridColumns();
  const groupedProjects = groupProjectsByColumns(visibleProjects, columns);
  const allColumnKeys = Object.keys(groupedProjects);

  // Set initial focus when projects are loaded
  useEffect(() => {
    if (visibleProjects.length > 0 && !focusedProjectId) {
      setFocusedProjectId(visibleProjects[0].id);
      setFocusedColumn('column-0');
    }
  }, [visibleProjects, focusedProjectId]);

  const handleViewProjectDetails = (project: Project) => {
    navigate(`/projects/${project.id}/tasks`);
  };

  // Setup keyboard navigation
  useKanbanKeyboardNavigation({
    focusedTaskId: focusedProjectId,
    setFocusedTaskId: setFocusedProjectId,
    focusedStatus: focusedColumn,
    setFocusedStatus: setFocusedColumn,
    groupedTasks: groupedProjects,
    filteredTasks: visibleProjects,
    allTaskStatuses: allColumnKeys,
    onViewTaskDetails: handleViewProjectDetails,
    preserveIndexOnColumnSwitch: true,
  });

  useKeyboardShortcuts({
    ignoreEscape: true,
    onC: () => setShowForm(true),
    navigate,
    currentPath: '/projects',
  });

  // Handle window resize to update column layout
  useEffect(() => {
    const handleResize = () => {
      // Reset focus when layout changes
      if (focusedProjectId && projects.length > 0) {
        const newColumns = getGridColumns();

        // Find which column the focused project should be in
        const focusedProject = projects.find((p) => p.id === focusedProjectId);
        if (focusedProject) {
          const projectIndex = projects.indexOf(focusedProject);
          const newColumnIndex = projectIndex % newColumns;
          setFocusedColumn(`column-${newColumnIndex}`);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [focusedProjectId, projects]);

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage your projects and track their progress
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={toggleShowArchivedProjects}
            disabled={!hasArchivedProjects}
            className={`${
              !hasArchivedProjects ? "opacity-50" : ""
            } ${showArchivedProjects && hasArchivedProjects ? "bg-accent" : ""}`}
            title={showArchivedProjects ? `Hide archived projects${hasArchivedProjects ? ` (${archivedCounts.projects})` : ''}` : `Show archived projects${hasArchivedProjects ? ` (${archivedCounts.projects})` : ''}`}
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading projects...
        </div>
      ) : visibleProjects.length === 0 ? (
        projects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Plus className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Get started by creating your first project.
              </p>
              <Button className="mt-4" onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create your first project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="mt-4 text-lg font-semibold">
                All projects are archived
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Try searching to show archived projects that match your query.
              </p>
            </CardContent>
          </Card>
        )
      ) : (
        <>
          {showArchivedIndicator && (
            <div className="mb-4 p-3 bg-muted/50 border border-muted rounded-md">
              <p className="text-sm text-muted-foreground">
                Showing archived projects because only archived items match your
                search
              </p>
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isFocused={focusedProjectId === project.id}
                setError={setError}
                setEditingProject={setEditingProject}
                setShowForm={setShowForm}
                fetchProjects={fetchProjects}
                onArchive={toggleProjectArchive}
                isArchived={isProjectArchived(project.id)}
              />
            ))}
          </div>
        </>
      )}

      <ProjectForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingProject(null);
        }}
        onSuccess={handleFormSuccess}
        project={editingProject}
      />

    </div>
  );
}
