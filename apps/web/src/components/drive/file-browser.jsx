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
  PlayIcon,
  UserRoundIcon,
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
import { Badge } from "@/components/ui/badge";
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
import { IdentityAvatar } from "@/components/identity-avatar";

const thumbnailContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/tiff",
  "application/pdf",

  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/x-matroska",
  "video/x-msvideo",
]);

function isThumbnailFile(file) {
  if (file.type !== "file") return false;

  const contentType = file.contentType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (
    contentType?.startsWith("image/") ||
    contentType?.startsWith("video/") ||
    contentType === "application/pdf"
  ) {
    return true;
  }

  return /\.(avif|gif|jpe?g|pdf|png|tiff?|webp|mp4|m4v|mov|webm|mkv|avi)$/i.test(
    file.name,
  );
}

function isVideoFile(file) {
  const contentType = file.contentType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  return (
    contentType?.startsWith("video/") ||
    /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(file.name)
  );
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

function FileThumbnail({ file, className, iconClassName, grid = false, contentUrl }) {
  const [didFail, setDidFail] = useState(false);
  const hasThumbnail = isThumbnailFile(file) && !didFail;
  const isVideo = isVideoFile(file);

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
          src={file.previewUrl || contentUrl || driveApi.thumbnailUrl(file.id)}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          decoding="async"
          draggable="false"
          onError={() => setDidFail(true)}
        />
      )}

      {hasThumbnail && isVideo && grid && (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-black/45 text-white shadow-sm backdrop-blur-[2px]">
            <PlayIcon className="size-5 fill-current" />
          </span>
        </span>
      )}
    </span>
  );
}

function FileActions({ file, isTrash, readOnly, onDownload, onMove, onRename, onShare, onDelete, onRestore, className }) {
  return (
    <div className={className}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
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
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : (
            <>
          {readOnly ? <DropdownMenuGroup><DropdownMenuItem onClick={() => onDownload(file)} disabled={file.type === "folder"}><DownloadIcon />Download</DropdownMenuItem></DropdownMenuGroup> : <>
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
              <DropdownMenuItem onClick={() => onShare(file)}>
                <Share2Icon />
                Share
              </DropdownMenuItem>
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
          </>}
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
  readOnly = false,
  hideActions = false,
  getContentUrl,
  getDownloadUrl,
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

  function durationLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return null;

    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${minutes}:${String(secs).padStart(2, "0")}`;
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
          const duration = durationLabel(file.durationSeconds);
          const collaborator = file.uploadedBy?.username ? file.uploadedBy : file.owner?.username ? file.owner : null;

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
            draggable={!isTrash && !readOnly}
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
                contentUrl={getContentUrl?.(file)}
                className={cn(
                  view === "grid"
                    ? file.type === "folder"
                      ? "absolute inset-0 size-full rounded-none after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(to_top,rgba(15,23,42,0.48)_0%,rgba(15,23,42,0.34)_22%,rgba(20,30,55,0.20)_42%,rgba(30,41,75,0.09)_60%,rgba(30,41,75,0.025)_76%,transparent_90%)]"
                      : hasMediaPreview
                        ? "absolute inset-0 size-full rounded-none after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(to_top,rgba(0,0,0,0.70)_0%,rgba(0,0,0,0.52)_22%,rgba(0,0,0,0.32)_42%,rgba(0,0,0,0.14)_60%,rgba(0,0,0,0.04)_76%,transparent_90%)]"
                        : "absolute inset-0 size-full rounded-none after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(to_top,rgba(0,0,0,0.48)_0%,rgba(0,0,0,0.34)_22%,rgba(0,0,0,0.20)_42%,rgba(0,0,0,0.09)_60%,rgba(0,0,0,0.025)_76%,transparent_90%)]"
                    : "size-9 rounded-lg",
                )}
                iconClassName={view === "grid" ? "size-12" : "size-4"}
              />
              {view === "grid" && collaborator && (
                <Badge variant="outline" className="absolute top-3 left-3 z-10 h-6 gap-1.5 border-border/50 bg-background/70 px-1.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur-sm">
                  <IdentityAvatar user={collaborator} size="sm" className="!size-4 after:!border-0" />
                  @{collaborator.username}
                </Badge>
              )}
              <span className={cn(
                "min-w-0 flex-1 text-foreground",
                view === "grid" && "absolute inset-x-0 bottom-0 z-10 px-3 pb-3 pt-10",
                view === "grid" && true && "text-white", //
              )}>
                <span className="block truncate text-sm font-medium">
                  {file.name}
                </span>
                <span className={cn(
                  "mt-1 flex flex-wrap items-center gap-1 text-xs text-foreground",
                  view === "grid" && true && "text-white", //hasMediaPreview
                )}>
                  {file.type === "folder" ? (
                    <Badge variant="outline" className={cn("h-4 px-1.5 text-[10px] font-medium leading-none", view === "grid" && "border-white/20 bg-black/30 text-white backdrop-blur-sm")}>Folder</Badge>
                  ) : (
                    <>
                      <Badge variant="outline" className={cn("h-4 px-1.5 text-[10px] font-medium leading-none", view === "grid" && "border-white/20 bg-black/30 text-white backdrop-blur-sm")}>{file.size}</Badge>
                      {duration && <Badge variant="outline" className={cn("h-4 px-1.5 text-[10px] font-medium leading-none", view === "grid" && "border-white/20 bg-black/30 text-white backdrop-blur-sm")}>{duration}</Badge>}
                    </>
                  )}
                  {file.isShared && <Badge variant="outline" className={cn("h-4 px-1.5 text-[10px] font-medium leading-none", view === "grid" ? "border-white/20 bg-black/35 text-white shadow-sm backdrop-blur-sm" : "text-primary")}>Shared</Badge>}
                </span>
              </span>
            </button>
            {view === "list" && (
              collaborator && <span className="hidden w-48 items-center justify-end gap-2 truncate text-sm text-muted-foreground sm:flex"><IdentityAvatar user={collaborator} size="sm" className="!size-6 after:!border-0" />@{collaborator.username}</span>
            )}
            {view === "list" && (
              <span className="hidden w-32 text-right text-xs text-foreground sm:block">
                {file.createdAt
                  ? new Date(file.createdAt).toLocaleDateString()
                  : "—"}
              </span>
            )}
            {!hideActions && <FileActions
              file={file}
              onDownload={onDownload}
              onMove={onMove}
              onRename={onRename}
              onShare={onShare}
              onDelete={onDelete}
              onRestore={onRestore}
              isTrash={isTrash}
              readOnly={readOnly}
              className={view === "grid" ? "absolute top-2 right-2" : undefined}
            />}
            {hideActions && getDownloadUrl && file.type === "file" && (
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                className="shrink-0"
                render={<a href={getDownloadUrl(file)} />}
              >
                <DownloadIcon />
                <span className="hidden sm:inline">Download</span>
              </Button>
            )}
          </motion.article>
          );
        })}
      </div>
    </BrowserSurface>
  );
}
