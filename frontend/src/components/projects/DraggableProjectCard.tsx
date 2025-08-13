import { useDraggable, useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import ProjectCard from './ProjectCard';
import type { Project } from 'shared/types';

interface DraggableProjectCardProps {
  project: Project;
  index: number;
  isFocused: boolean;
  fetchProjects: () => void;
  setError: (error: string) => void;
  setEditingProject: (project: Project) => void;
  setShowForm: (show: boolean) => void;
  onArchive: (projectId: string) => void;
  isArchived: boolean;
}

export function DraggableProjectCard({
  project,
  index,
  isFocused,
  fetchProjects,
  setError,
  setEditingProject,
  setShowForm,
  onArchive,
  isArchived,
}: DraggableProjectCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } =
    useDraggable({
      id: project.id,
      data: { index, type: 'project' },
    });

  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: project.id,
    data: { index, type: 'project' },
  });

  // Combine refs
  const combinedRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <div
      ref={combinedRef}
      className={cn(
        'transition-all',
        isDragging && 'opacity-50 scale-95',
        isOver && 'ring-2 ring-primary'
      )}
      style={{
        transform: transform
          ? `translateX(${transform.x}px) translateY(${transform.y}px)`
          : 'none',
      }}
      {...listeners}
      {...attributes}
    >
      <ProjectCard
        project={project}
        isFocused={isFocused}
        fetchProjects={fetchProjects}
        setError={setError}
        setEditingProject={setEditingProject}
        setShowForm={setShowForm}
        onArchive={onArchive}
        isArchived={isArchived}
      />
    </div>
  );
}