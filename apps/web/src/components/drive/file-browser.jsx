"use client";

/* The thumbnail endpoint requires the browser's HTTP-only session cookie, which Next's image optimizer cannot forward. */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArchiveIcon,
  AudioLinesIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FileVideoIcon,
  FolderIcon,
  FolderInputIcon,
  MoreHorizontalIcon,
  DownloadIcon,
  FolderOpenIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
  RotateCcwIcon,
} from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { driveApi } from "@/lib/drive-api";

const thumbnailContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/tiff",
  "application/pdf",
]);

function isThumbnailFile(file) {
  if (file.type !== "file") return false;
  const hasExtension = /\.[^./]+$/.test(file.name);
  if (hasExtension) return /\.(avif|gif|jpe?g|pdf|png|tiff?|webp)$/i.test(file.name);
  const contentType = file.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType && thumbnailContentTypes.has(contentType)) return true;
  return false;
}

function FileTypeIcon({ file, className }) {
  if (file.type === "folder") return <FolderIcon className={className} />;
  const contentType = file.contentType?.toLowerCase() || "";
  if (contentType.startsWith("image/")) return <FileImageIcon className={className} />;
  if (contentType.startsWith("video/")) return <FileVideoIcon className={className} />;
  if (contentType.startsWith("audio/")) return <AudioLinesIcon className={className} />;
  if (contentType.includes("pdf") || contentType.startsWith("text/")) return <FileTextIcon className={className} />;
  if (contentType.includes("zip") || contentType.includes("compressed") || /\.(zip|rar|7z|tar|gz)$/i.test(file.name)) return <ArchiveIcon className={className} />;
  return <FileIcon className={className} />;
}

function placeholderSurface(file, grid) {
  if (file.type === "folder") return grid ? "bg-[var(--accent)] text-primary dark:bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--accent),white_12%),color-mix(in_srgb,var(--accent),black_12%))]" : "bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--accent),white_12%),color-mix(in_srgb,var(--accent),black_12%))] text-primary";
  const contentType = file.contentType?.toLowerCase() || "";
  if (contentType.startsWith("audio/")) return grid ? "bg-muted text-muted-foreground dark:bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--muted),white_12%),color-mix(in_srgb,var(--muted),black_12%))]" : "bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--muted),white_12%),color-mix(in_srgb,var(--muted),black_12%))] text-muted-foreground";
  if (contentType.startsWith("video/")) return grid ? "bg-muted text-muted-foreground dark:bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--muted),white_12%),color-mix(in_srgb,var(--muted),black_12%))]" : "bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--muted),white_12%),color-mix(in_srgb,var(--muted),black_12%))] text-muted-foreground";
  return grid ? "bg-muted text-muted-foreground dark:bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--muted),white_12%),color-mix(in_srgb,var(--muted),black_12%))]" : "bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--muted),white_12%),color-mix(in_srgb,var(--muted),black_12%))] text-muted-foreground";
}

function FileThumbnail({ file, className, iconClassName, grid = false }) {
  const [didFail, setDidFail] = useState(false);
  const hasThumbnail = isThumbnailFile(file) && !didFail;
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden",
        placeholderSurface(file, grid),
        className,
      )}
    >
      <FileTypeIcon file={file} className={iconClassName} />
      {hasThumbnail && (
        <img
          src={file.previewUrl || driveApi.thumbnailUrl(file.id)}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          decoding="async"
          draggable="false"
          onError={() => setDidFail(true)}
        />
      )}
    </span>
  );
}

function FileActions({ file, isTrash, onDownload, onMove, onRename, onShare, onDelete, onRestore, className }) {
  return (
    <div className={className}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${file.name}`}
                  />
                }
              />
            }
          >
            <MoreHorizontalIcon />
          </TooltipTrigger>
          <TooltipContent>More actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {isTrash ? (
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => onRestore(file)}>
                <RotateCcwIcon />
                Restore
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(file)}>
                <Trash2Icon />
                Delete permanently
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : (
            <>
          {file.type === "file" && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onDownload(file)}>
                  <DownloadIcon />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onShare(file)}>
                  <Share2Icon />
                  Share
                </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRename(file)}>
                <PencilIcon />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(file)}>
                <FolderInputIcon />
                Move
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        {file.type === "folder" && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => onMove(file)}>
                <FolderInputIcon />
                Move
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(file)}
            >
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BrowserSkeleton({ view }) {
  return (
    <div
      className={cn(
        view === "grid"
          ? "grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4"
          : "flex flex-col divide-y rounded-xl border",
        view === "grid" && "",
      )}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          className={cn(
            "flex items-center gap-3",
            view === "grid" ? "relative aspect-[4/3] flex-col items-stretch gap-0 overflow-hidden rounded-xl border p-0" : "p-3",
          )}
          key={index}
        >
          {view === "grid" && <Skeleton className="absolute inset-0 size-full rounded-none" />}
          {view === "list" && <Skeleton className="size-9 rounded-lg" />}
          <div className={cn("flex flex-1 flex-col gap-2", view === "grid" && "absolute inset-x-3 bottom-3 z-10")}>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          {view === "list" && <Skeleton className="size-7 rounded-md" />}
        </div>
      ))}
    </div>
  );
}

function BrowserSurface({ children, stateKey, reduceMotion }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stateKey}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
        transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function FileBrowser({
  files,
  isLoading,
  isError,
  search,
  view,
  transitionKey,
  onOpen,
  onDownload,
  onMove,
  onMoveToFolder,
  onItemDragStart,
  onItemDragEnd,
  onRename,
  onShare,
  onDelete,
  onRestore,
  isTrash = false,
  emptyTitle,
  emptyDescription,
  onRetry,
}) {
  const reduceMotion = useReducedMotion();
  const [draggedFile, setDraggedFile] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);

  function canDropOnFolder(file) {
    return Boolean(!isTrash && draggedFile && file.type === "folder" && file.id !== draggedFile.id && file.id !== draggedFile.parentId);
  }
  if (isLoading)
    return (
      <BrowserSurface
        stateKey={`${transitionKey}-${view}-loading`}
        reduceMotion={reduceMotion}
      >
        <BrowserSkeleton view={view} />
      </BrowserSurface>
    );
  if (isError)
    return (
      <BrowserSurface
        stateKey={`${transitionKey}-${view}-error`}
        reduceMotion={reduceMotion}
      >
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpenIcon />
            </EmptyMedia>
            <EmptyTitle>We couldn’t load this folder</EmptyTitle>
            <EmptyDescription>
              Check your connection or try loading the folder again.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onRetry}>Try again</Button>
          </EmptyContent>
        </Empty>
      </BrowserSurface>
    );
  if (!files.length)
    return (
      <BrowserSurface
        stateKey={`${transitionKey}-${view}-${search ? "search-empty" : "empty"}`}
        reduceMotion={reduceMotion}
      >
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpenIcon />
            </EmptyMedia>
            <EmptyTitle>
              {search ? "No matching files" : emptyTitle || "This folder is empty"}
            </EmptyTitle>
            <EmptyDescription>
              {search
                ? "Try a different name or clear your search."
                : emptyDescription || "Upload a file or create a folder to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </BrowserSurface>
    );

  return (
    <BrowserSurface
      stateKey={`${transitionKey}-${view}-files`}
      reduceMotion={reduceMotion}
    >
      <div
        className={cn(
          view === "grid"
            ? "grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4"
            : "overflow-hidden rounded-xl border bg-card",
          view === "list" && "divide-y",
        )}
      >
        {files.map((file) => {
          const hasMediaPreview = isThumbnailFile(file);
          const isDropTarget = dropTargetId === file.id;
          return (
          <motion.article
            layout="position"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
            className={cn(
              "group relative flex items-center gap-3",
              view === "grid"
                ? cn(
                    "aspect-[4/3] flex-col items-stretch gap-0 overflow-hidden rounded-xl border shadow-xs",
                    hasMediaPreview ? "bg-black" : "bg-muted",
                  )
                : "px-3 py-3 hover:bg-muted/50",
              isDropTarget && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
            key={file.id}
            draggable={!isTrash}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", file.id);
              setDraggedFile(file);
              onItemDragStart?.(file);
            }}
            onDragEnd={() => {
              setDraggedFile(null);
              setDropTargetId(null);
              onItemDragEnd?.();
            }}
            onDragOver={(event) => {
              if (!canDropOnFolder(file)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTargetId(file.id);
            }}
            onDragLeave={() => {
              if (isDropTarget) setDropTargetId(null);
            }}
            onDrop={(event) => {
              if (!canDropOnFolder(file) || !draggedFile) return;
              event.preventDefault();
              const movingFile = draggedFile;
              setDraggedFile(null);
              setDropTargetId(null);
              onItemDragEnd?.();
              Promise.resolve(onMoveToFolder(movingFile, file.id)).catch(() => undefined);
            }}
          >
            <button
              type="button"
              onClick={() => !isTrash && onOpen(file)}
              className={cn(
                "flex min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  view === "grid"
                    ? "relative size-full"
                  : "items-center gap-3",
              )}
              aria-label={isTrash ? `${file.name}, in Trash` : `${file.type === "folder" ? "Open folder" : "Preview file"} ${file.name}`}
            >
              <FileThumbnail
                file={file}
                grid={view === "grid"}
                className={cn(
                  view === "grid"
                    ? hasMediaPreview
                      ? "absolute inset-0 size-full rounded-none after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-32 after:bg-linear-to-t after:from-black/90 after:via-black/55 after:to-transparent"
                      : "absolute inset-0 size-full rounded-none"
                    : "size-9 rounded-lg",
                )}
                iconClassName={view === "grid" ? "size-12" : "size-4"}
              />
              <span className={cn(
                "min-w-0 flex-1 text-foreground",
                view === "grid" && "absolute inset-x-0 bottom-0 z-10 px-3 pb-3 pt-10",
                view === "grid" && hasMediaPreview && "text-white",
              )}>
                <span className="block truncate text-sm font-medium">
                  {file.name}
                </span>
                <span className={cn(
                  "mt-0.5 block text-xs text-foreground",
                  view === "grid" && hasMediaPreview && "text-white",
                )}>
                  {file.type === "folder" ? "Folder" : file.size}
                </span>
              </span>
            </button>
            {view === "list" && (
              <span className="hidden w-32 text-right text-xs text-foreground sm:block">
                {file.createdAt
                  ? new Date(file.createdAt).toLocaleDateString()
                  : "—"}
              </span>
            )}
            <FileActions
              file={file}
              onDownload={onDownload}
              onMove={onMove}
              onRename={onRename}
              onShare={onShare}
              onDelete={onDelete}
              onRestore={onRestore}
              isTrash={isTrash}
              className={view === "grid" ? "absolute top-2 right-2" : undefined}
            />
          </motion.article>
          );
        })}
      </div>
    </BrowserSurface>
  );
}
