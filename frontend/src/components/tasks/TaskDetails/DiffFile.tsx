import { Button } from '@/components/ui/button.tsx';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import DiffChunkSection from '@/components/tasks/TaskDetails/DiffChunkSection.tsx';
import { FileDiff } from 'shared/types.ts';
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { TaskDeletingFilesContext } from '@/components/context/taskDetailsContext.ts';
import { ProcessedLine, ProcessedSection } from '@/lib/types.ts';

type Props = {
  collapsedFiles: Set<string>;
  compact: boolean;
  deletable: boolean;
  file: FileDiff;
  fileIndex: number;
  setCollapsedFiles: Dispatch<SetStateAction<Set<string>>>;
};

function DiffFile({
  collapsedFiles,
  file,
  deletable,
  compact,
  fileIndex,
  setCollapsedFiles,
}: Props) {
  const { deletingFiles, setFileToDelete } = useContext(
    TaskDeletingFilesContext
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );

  const onDeleteFile = useCallback(
    (filePath: string) => {
      setFileToDelete(filePath);
    },
    [setFileToDelete]
  );

  const toggleFileCollapse = (filePath: string) => {
    setCollapsedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  };

  const processedFileChunks = useMemo(() => {
    const CONTEXT_LINES = compact ? 2 : 3;
    const lines: ProcessedLine[] = [];
    let oldLineNumber = 1;
    let newLineNumber = 1;

    // Convert chunks to lines with line numbers
    file.chunks.forEach((chunk) => {
      const chunkLines = chunk.content.split('\n');
      chunkLines.forEach((line, index) => {
        if (index < chunkLines.length - 1 || line !== '') {
          const processedLine: ProcessedLine = {
            content: line,
            chunkType: chunk.chunk_type,
            oldLineNumber: undefined,
            newLineNumber: undefined,
          };

          switch (chunk.chunk_type) {
            case 'Equal':
              processedLine.oldLineNumber = oldLineNumber++;
              processedLine.newLineNumber = newLineNumber++;
              break;
            case 'Delete':
              processedLine.oldLineNumber = oldLineNumber++;
              break;
            case 'Insert':
              processedLine.newLineNumber = newLineNumber++;
              break;
          }

          lines.push(processedLine);
        }
      });
    });

    const sections: ProcessedSection[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.chunkType === 'Equal') {
        let nextChangeIndex = i + 1;
        while (
          nextChangeIndex < lines.length &&
          lines[nextChangeIndex].chunkType === 'Equal'
        ) {
          nextChangeIndex++;
        }

        const contextLength = nextChangeIndex - i;
        const hasNextChange = nextChangeIndex < lines.length;
        const hasPrevChange =
          sections.length > 0 &&
          sections[sections.length - 1].type === 'change';

        if (
          contextLength <= CONTEXT_LINES * 2 ||
          (!hasPrevChange && !hasNextChange)
        ) {
          sections.push({
            type: 'context',
            lines: lines.slice(i, nextChangeIndex),
            expandKey: undefined,
            expandedAbove: undefined,
            expandedBelow: undefined,
          });
        } else {
          if (hasPrevChange) {
            sections.push({
              type: 'context',
              lines: lines.slice(i, i + CONTEXT_LINES),
              expandKey: undefined,
              expandedAbove: undefined,
              expandedBelow: undefined,
            });
            i += CONTEXT_LINES;
          }

          if (hasNextChange) {
            const expandStart = hasPrevChange ? i : i + CONTEXT_LINES;
            const expandEnd = nextChangeIndex - CONTEXT_LINES;

            if (expandEnd > expandStart) {
              const expandKey = `${fileIndex}-${expandStart}-${expandEnd}`;
              const isExpanded = expandedSections.has(expandKey);

              if (isExpanded) {
                sections.push({
                  type: 'expanded',
                  lines: lines.slice(expandStart, expandEnd),
                  expandKey,
                  expandedAbove: undefined,
                  expandedBelow: undefined,
                });
              } else {
                sections.push({
                  type: 'context',
                  lines: [],
                  expandKey,
                  expandedAbove: undefined,
                  expandedBelow: undefined,
                });
              }
            }

            sections.push({
              type: 'context',
              lines: lines.slice(
                nextChangeIndex - CONTEXT_LINES,
                nextChangeIndex
              ),
              expandKey: undefined,
              expandedAbove: undefined,
              expandedBelow: undefined,
            });
          } else if (!hasPrevChange) {
            sections.push({
              type: 'context',
              lines: lines.slice(i, i + CONTEXT_LINES),
              expandKey: undefined,
              expandedAbove: undefined,
              expandedBelow: undefined,
            });
          }
        }

        i = nextChangeIndex;
      } else {
        const changeStart = i;
        while (i < lines.length && lines[i].chunkType !== 'Equal') {
          i++;
        }

        sections.push({
          type: 'change',
          lines: lines.slice(changeStart, i),
          expandKey: undefined,
          expandedAbove: undefined,
          expandedBelow: undefined,
        });
      }
    }

    return sections;
  }, [file.chunks, expandedSections, compact, fileIndex]);

  // Determine background color based on file status
  const getFileHeaderClasses = () => {
    const baseClasses = 'px-3 py-1.5 flex items-center justify-between rounded-t-lg';
    const borderClasses = !collapsedFiles.has(file.path)
      ? 'flex-shrink-0 border-b'
      : 'rounded-b-lg';

    if (!file.status) {
      return `${baseClasses} ${borderClasses} bg-muted`;
    }

    if (file.status === 'Added') {
      return `${baseClasses} ${borderClasses} bg-green-50 dark:bg-green-950/30`;
    } else if (file.status === 'Deleted') {
      return `${baseClasses} ${borderClasses} bg-red-50 dark:bg-red-950/30`;
    } else if (typeof file.status === 'object' && 'Renamed' in file.status) {
      // No special background for renamed files per request
      return `${baseClasses} ${borderClasses} bg-muted`;
    } else {
      return `${baseClasses} ${borderClasses} bg-muted`;
    }
  };

  // Format file path display for renamed files
  const getFilePathDisplay = () => {
    if (
      file.status &&
      typeof file.status === 'object' &&
      'Renamed' in file.status
    ) {
      const oldPath = file.status.Renamed.old_path;
      return (
        <span className="text-xs font-medium font-mono">
          <span className="text-muted-foreground">{oldPath}</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span className="text-foreground">{file.path}</span>
        </span>
      );
    }
    return (
      <p className="text-xs font-medium text-muted-foreground font-mono">
        {file.path}
      </p>
    );
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        collapsedFiles.has(file.path) ? 'border-muted' : 'border-border'
      } ${!collapsedFiles.has(file.path) ? 'flex flex-col max-h-[600px]' : ''}`}
    >
      <div className={getFileHeaderClasses()}>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleFileCollapse(file.path)}
            className="h-5 w-5 p-0 hover:bg-muted-foreground/10"
            title={
              collapsedFiles.has(file.path) ? 'Expand diff' : 'Collapse diff'
            }
          >
            {collapsedFiles.has(file.path) ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
          </Button>
          {getFilePathDisplay()}
          {collapsedFiles.has(file.path) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
              {(() => {
                // All diffs now use the grouped format: chunks contain multiple lines
                const additions = file.chunks
                  .filter((c) => c.chunk_type === 'Insert')
                  .reduce((sum, chunk) => {
                    if (!chunk.content) return sum;
                    const lines = chunk.content.split('\n');
                    // Don't count empty last element from trailing newline
                    return (
                      sum +
                      (lines[lines.length - 1] === ''
                        ? lines.length - 1
                        : lines.length)
                    );
                  }, 0);

                const deletions = file.chunks
                  .filter((c) => c.chunk_type === 'Delete')
                  .reduce((sum, chunk) => {
                    if (!chunk.content) return sum;
                    const lines = chunk.content.split('\n');
                    // Don't count empty last element from trailing newline
                    return (
                      sum +
                      (lines[lines.length - 1] === ''
                        ? lines.length - 1
                        : lines.length)
                    );
                  }, 0);

                return (
                  <>
                    {additions > 0 && (
                      <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-1 py-0.5 rounded text-xs">
                        +{additions}
                      </span>
                    )}
                    {deletions > 0 && (
                      <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-1 py-0.5 rounded text-xs">
                        -{deletions}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
        {deletable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDeleteFile(file.path)}
            disabled={deletingFiles.has(file.path)}
            className="text-red-600 hover:text-red-800 hover:bg-red-50 h-6 px-2 gap-1"
            title={`Delete ${file.path}`}
          >
            <Trash2 className="h-3 w-3" />
            {!compact && (
              <span className="text-xs">
                {deletingFiles.has(file.path) ? 'Deleting...' : 'Delete'}
              </span>
            )}
          </Button>
        )}
      </div>
      {!collapsedFiles.has(file.path) && (
        <div className="overflow-auto flex-1 min-h-0">
          <div className="inline-block min-w-full">
            {processedFileChunks.map((section, sectionIndex) => (
              <DiffChunkSection
                key={`expand-${sectionIndex}`}
                section={section}
                sectionIndex={sectionIndex}
                setExpandedSections={setExpandedSections}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DiffFile;
