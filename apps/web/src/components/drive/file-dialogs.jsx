"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CopyIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  EyeIcon,
  FolderIcon,
  Globe2Icon,
  HouseIcon,
  LinkIcon,
  LockIcon,
  Maximize2Icon,
  Minimize2Icon,
  PanelLeftOpenIcon,
  PauseIcon,
  PlayIcon,
  PrinterIcon,
  RotateCcwIcon,
  Trash2Icon,
  Volume2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Slider } from "@/components/ui/slider";
import { driveApi } from "@/lib/drive-api";
import { previewKind } from "@/lib/drive-utils";
import { cn } from "@/lib/utils";

function fileExtension(name) {
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 && lastDot < name.length - 1 ? name.slice(lastDot) : "";
}

function preserveFileExtension(nextName, originalName) {
  const extension = fileExtension(originalName);
  if (!extension || fileExtension(nextName)) return nextName;
  const trimmedName = nextName.replace(/\.+$/, "");
  return trimmedName ? `${trimmedName}${extension}` : nextName;
}

export function FolderDialog({ open, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const [isPending, setIsPending] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setIsPending(true);
    try {
      await onCreate(name);
      setName("");
      onOpenChange(false);
    } finally {
      setIsPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create folder</DialogTitle>
          <DialogDescription>
            Give this folder a recognizable name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="folder-name">Folder name</FieldLabel>
              <Input
                id="folder-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Project files"
                required
              />
            </Field>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner data-icon="inline-start" />}Create folder
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameDialog({ file, onClose, onRename }) {
  const [isPending, setIsPending] = useState(false);
  const originalExtension = fileExtension(file?.name || "");
  async function submit(event) {
    event.preventDefault();
    const name = String(
      new FormData(event.currentTarget).get("name") || "",
    ).trim();
    if (!file || !name) return;
    const finalName = preserveFileExtension(name, file.name);
    setIsPending(true);
    try {
      await onRename(file, finalName);
      onClose();
    } finally {
      setIsPending(false);
    }
  }
  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
          <DialogDescription>
            Choose a new name for {file?.name}.
          </DialogDescription>
        </DialogHeader>
        <form key={file?.id} onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="file-name">Name</FieldLabel>
              <Input
                id="file-name"
                name="name"
                autoFocus
                defaultValue={file?.name || ""}
                required
              />
              {originalExtension && (
                <FieldDescription>
                  {originalExtension} will be kept unless you enter a new
                  extension.
                </FieldDescription>
              )}
            </Field>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner data-icon="inline-start" />}Save name
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MoveDialog({ file, onClose, onMove }) {
  const [isOpen, setIsOpen] = useState(Boolean(file));
  const closeTimer = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function requestClose() {
    if (!isOpen) return;
    setIsOpen(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(onClose, reduceMotion ? 0 : 130);
  }

  return (
    <Dialog open={Boolean(file) && isOpen} onOpenChange={(open) => !open && requestClose()}>
      {file && <MoveContent key={file.id} file={file} onClose={requestClose} onMove={onMove} />}
    </Dialog>
  );
}

function MoveContent({ file, onClose, onMove }) {
  const [destinationId, setDestinationId] = useState(file.parentId || null);
  const [folders, setFolders] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      driveApi
        .list({ parentId: destinationId, pageSize: 100 })
        .then((result) => {
          if (!active) return;
          setFolders(result.files.filter((item) => item.type === "folder" && item.id !== file.id));
          setBreadcrumbs(result.breadcrumbs);
        })
        .catch(() => {
          if (active) {
            setFolders([]);
            setBreadcrumbs([]);
          }
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [destinationId, file.id]);

  async function submit() {
    if (destinationId === file.parentId) return;
    setIsPending(true);
    try {
      await onMove(file, destinationId);
      onClose();
    } finally {
      setIsPending(false);
    }
  }

  const destinationName = breadcrumbs.length ? breadcrumbs.at(-1)?.name : "My Drive";
  return (
    <DialogContent
      keepMounted
      className="overflow-hidden"
      render={<motion.div layout transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }} />}
    >
      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
        className="grid gap-4"
      >
        <DialogHeader>
          <DialogTitle>Move {file.type === "folder" ? "folder" : "file"}</DialogTitle>
          <DialogDescription>
            Choose where to place {file.name}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Destination: <AnimatePresence mode="wait" initial={false}><motion.span key={destinationName} initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -3 }} transition={{ duration: reduceMotion ? 0 : 0.14 }} className="inline-block font-medium text-foreground">{destinationName}</motion.span></AnimatePresence>
          </p>
          <div className="max-h-64 overflow-y-auto rounded-lg border p-1">
            <button
              type="button"
              onClick={() => setDestinationId(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                destinationId === null && "bg-muted",
              )}
            >
              <HouseIcon className="size-4 text-primary" />
              My Drive
            </button>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${destinationId || "root"}-${isLoading ? "loading" : "folders"}`}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted-foreground">
                    <Spinner className="size-4" /> Loading folders
                  </div>
                ) : folders.length ? (
                  folders.map((folder, index) => (
                    <motion.button
                      type="button"
                      key={folder.id}
                      initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.14, delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.12) }}
                      onClick={() => setDestinationId(folder.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <FolderIcon className="size-4 text-primary" />
                      <span className="truncate">{folder.name}</span>
                    </motion.button>
                  ))
                ) : (
                  <p className="px-2.5 py-3 text-sm text-muted-foreground">No folders here.</p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={isPending || destinationId === file.parentId}>
            {isPending && <Spinner data-icon="inline-start" />}Move here
          </Button>
        </DialogFooter>
      </motion.div>
    </DialogContent>
  );
}

export function DeleteDialog({ file, onClose, onDelete, permanent = false }) {
  const [isPending, setIsPending] = useState(false);
  async function confirm() {
    if (!file) return;
    setIsPending(true);
    try {
      await onDelete(file);
      onClose();
    } finally {
      setIsPending(false);
    }
  }
  return (
    <AlertDialog
      open={Boolean(file)}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className={permanent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {permanent ? "Delete permanently" : "Move to Trash"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {permanent
              ? file?.type === "folder"
                ? "This folder and everything in it will be permanently deleted. This can’t be undone."
                : "This file will be permanently deleted. This can’t be undone."
              : file?.type === "folder"
                ? "This folder and everything in it will stay in Trash for 30 days. You can restore it anytime before then."
                : "This file will stay in Trash for 30 days. You can restore it anytime before then."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={permanent ? "destructive" : "default"}
            onClick={confirm}
            disabled={isPending}
          >
            {isPending && <Spinner data-icon="inline-start" />}{permanent ? "Delete permanently" : "Move to Trash"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ShareDialog({ file, onClose }) {
  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
      {file && <ShareContent key={file.id} file={file} onClose={onClose} />}
    </Dialog>
  );
}

function ShareContent({ file, onClose }) {
  const [visibility, setVisibility] = useState("private");
  const [privateUrl, setPrivateUrl] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [publicShareId, setPublicShareId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    let active = true;
    driveApi
      .listShares(file.id)
      .then((result) => {
        if (!active) return;
        const publicShare = result.shares?.find(
          (share) => share.mode === "public" && !share.revokedAt,
        );
        setVisibility(publicShare ? "public" : "private");
        setPublicUrl(publicShare?.url || "");
        setPublicShareId(publicShare?.id || "");
      })
      .catch((error) =>
        toast.error("Couldn’t prepare sharing", { description: error.message }),
      )
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [file]);
  async function changeVisibility(value) {
    if (!file) return;
    setVisibility(value);
    try {
      if (value === "public" && !publicUrl) {
        const result = await driveApi.createShare(file.id, "public");
        setPublicUrl(result.share.url || "");
        setPublicShareId(result.share.id);
      }
      if (value === "private" && publicShareId) {
        await driveApi.revokeShare(publicShareId);
        setPublicShareId("");
        setPublicUrl("");
      }
    } catch (error) {
      setVisibility(value === "public" ? "private" : "public");
      toast.error("Couldn’t change visibility", { description: error.message });
    }
  }
  async function generatePrivateLink() {
    setIsGenerating(true);
    try {
      const result = await driveApi.createShare(file.id, "link");
      setPrivateUrl(result.share.url || "");
    } catch (error) {
      toast.error("Couldn’t create private link", {
        description: error.message,
      });
    } finally {
      setIsGenerating(false);
    }
  }
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn’t copy the link");
    }
  }
  const accessLabel =
    visibility === "public" ? "Anyone with the link" : "Private link";
  const linkField = (url, placeholder) => (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <Field>
        <FieldLabel htmlFor="share-link">Share link</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="share-link"
            value={url}
            readOnly
            placeholder={placeholder}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={() => copy(url)}
              aria-label="Copy share link"
            >
              <CopyIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </motion.div>
  );
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Share {file.name}</DialogTitle>
        <DialogDescription>
          Control who can open this file, then copy a link to share it.
        </DialogDescription>
      </DialogHeader>
      {isLoading ? (
        <div className="flex min-h-32 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="share-access">Access</FieldLabel>
            <Select value={visibility} onValueChange={changeVisibility}>
              <SelectTrigger id="share-access">
                <span className="flex flex-1 items-center gap-1.5 text-left">
                  {visibility === "public" ? (
                    <Globe2Icon className="size-4" />
                  ) : (
                    <LockIcon className="size-4" />
                  )}
                  {accessLabel}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="private">
                    <LockIcon />
                    Private link
                  </SelectItem>
                  <SelectItem value="public">
                    <Globe2Icon />
                    Anyone with the link
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {visibility === "public"
                ? "Anyone who has this link can access the file."
                : "Create a private, revocable link only when you are ready to share."}
            </FieldDescription>
          </Field>
          <AnimatePresence initial={false} mode="wait">
            {visibility === "public" ? (
              <motion.div
                key={publicUrl ? "public-link" : "public-pending"}
                initial={{ opacity: 0, height: 0, y: reduceMotion ? 0 : 4 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0, y: reduceMotion ? 0 : -4 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
                className="overflow-hidden"
              >
                {publicUrl ? (
                  linkField(publicUrl, "Creating link…")
                ) : (
                  <div className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
                    <Spinner />
                    Creating public link…
                  </div>
                )}
              </motion.div>
            ) : privateUrl ? (
              <motion.div
                key="private-link"
                initial={{ opacity: 0, height: 0, y: 4 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
                className="overflow-hidden"
              >
                {linkField(privateUrl, "")}
              </motion.div>
            ) : (
              <motion.div
                key="private-action"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
                className="rounded-xl border bg-muted/30 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Create a private link that you can revoke later.
                  </p>
                  <Button
                    type="button"
                    onClick={generatePrivateLink}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <LinkIcon data-icon="inline-start" />
                    )}
                    Create private link
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </FieldGroup>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function previewUnavailable(file) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 text-center">
      <EyeIcon className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        This file can’t be previewed in your browser.
      </p>
      <Button className="border-border/50 bg-background/25 backdrop-blur-sm hover:bg-background/50" nativeButton={false} variant="outline" onClick={(event) => event.stopPropagation()} render={<a href={driveApi.downloadUrl(file.id)} />}>
        <DownloadIcon data-icon="inline-start" />
        Download file
      </Button>
    </div>
  );
}

function timeLabel(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function defaultNavigationTone() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function sampleNavigationTones(canvas, sourceRect, rootRect) {
  const fallback = defaultNavigationTone();
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !sourceRect.width || !sourceRect.height) return { left: fallback, right: fallback };
  const toneAt = (x) => {
    const y = rootRect.top + rootRect.height / 2;
    if (x < sourceRect.left || x > sourceRect.right || y < sourceRect.top || y > sourceRect.bottom) return fallback;
    const sourceX = Math.max(0, Math.min(canvas.width - 1, Math.floor(((x - sourceRect.left) / sourceRect.width) * canvas.width)));
    const sourceY = Math.max(0, Math.min(canvas.height - 1, Math.floor(((y - sourceRect.top) / sourceRect.height) * canvas.height)));
    const [red, green, blue] = context.getImageData(sourceX, sourceY, 1, 1).data;
    return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 145 ? "dark" : "light";
  };
  return {
    left: toneAt(rootRect.left + 42),
    right: toneAt(rootRect.right - 42),
  };
}

function ImagePreview({ file, url, onReady, onError, onNavigationToneChange }) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef(null);
  const imageRef = useRef(null);
  const samplingCanvasRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef(null);
  const updateZoom = (nextZoom) => {
    const next = Math.min(3, Math.max(0.5, nextZoom));
    setZoom(next);
    if (next === 1) setOffset({ x: 0, y: 0 });
  };
  const updateNavigationTone = useCallback(() => {
    if (!samplingCanvasRef.current || !imageRef.current || !rootRef.current) return;
    onNavigationToneChange(sampleNavigationTones(samplingCanvasRef.current, imageRef.current.getBoundingClientRect(), rootRef.current.getBoundingClientRect()));
  }, [onNavigationToneChange]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(updateNavigationTone);
    return () => window.cancelAnimationFrame(frame);
  }, [offset, updateNavigationTone, zoom]);
  return (
    <div ref={rootRef} className="relative size-full overflow-hidden">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border bg-background/85 p-1 shadow-sm backdrop-blur" onClick={(event) => event.stopPropagation()}>
        <Button variant="ghost" size="icon-sm" onClick={() => updateZoom(zoom - 0.25)} disabled={zoom <= 0.5} aria-label="Zoom out" title="Zoom out">
          <ZoomOutIcon />
        </Button>
        <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Slider className="w-20" value={Math.round(zoom * 100)} min={50} max={300} step={1} onValueChange={(value) => updateZoom(value / 100)} ariaLabel="Image zoom" />
        <Button variant="ghost" size="icon-sm" onClick={() => updateZoom(zoom + 0.25)} disabled={zoom >= 3} aria-label="Zoom in" title="Zoom in">
          <ZoomInIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} aria-label="Fit image" title="Fit image">
          <Maximize2Icon />
        </Button>
      </div>
      <div
        className="flex size-full items-center justify-center bg-muted/40"
        onWheel={(event) => {
          event.preventDefault();
          updateZoom(zoom * Math.exp(-event.deltaY * 0.0015));
        }}
      >
        <motion.img
          ref={imageRef}
          draggable={false}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          className="max-h-full max-w-full cursor-grab select-none object-contain active:cursor-grabbing"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          src={url}
          alt={file.name}
          onLoad={async () => {
            onReady();
            try {
              const response = await fetch(url, { credentials: "include" });
              const bitmap = await createImageBitmap(await response.blob());
              const canvas = document.createElement("canvas");
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
              samplingCanvasRef.current = canvas;
              bitmap.close();
              window.requestAnimationFrame(updateNavigationTone);
            } catch {
              onNavigationToneChange({ left: defaultNavigationTone(), right: defaultNavigationTone() });
            }
          }}
          onError={onError}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStart.current = { x: event.clientX, y: event.clientY, offset };
          }}
          onPointerMove={(event) => {
            if (!dragStart.current) return;
            setOffset({
              x: dragStart.current.offset.x + event.clientX - dragStart.current.x,
              y: dragStart.current.offset.y + event.clientY - dragStart.current.y,
            });
          }}
          onPointerUp={() => { dragStart.current = null; }}
          onPointerCancel={() => { dragStart.current = null; }}
        />
      </div>
    </div>
  );
}

function AudioPreview({ url, onReady, onError }) {
  const audioRef = useRef(null);
  const seekingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const bars = useMemo(() => Array.from({ length: 72 }, (_, index) => 22 + ((Math.sin(index * 1.72) + Math.sin(index * 0.37 + 1.4) + 2) / 4) * 68), []);
  useEffect(() => () => audioRef.current?.pause(), []);
  function seekFromPointer(event) {
    if (!audioRef.current || !duration) return;
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const next = Math.min(duration, Math.max(0, ((event.clientX - left) / width) * duration));
    audioRef.current.currentTime = next;
    setCurrentTime(next);
  }
  async function togglePlayback() {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      try {
        await audioRef.current.play();
      } catch {
        setPlaying(false);
      }
    } else audioRef.current.pause();
  }
  return (
    <div className="flex size-full items-center justify-center p-5 sm:p-10">
      <audio
        ref={audioRef}
        src={url}
        onCanPlay={onReady}
        onError={onError}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <div className="w-full max-w-2xl rounded-2xl border bg-card/85 p-5 shadow-sm backdrop-blur-sm sm:p-7" onClick={(event) => event.stopPropagation()}>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Audio progress"
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={currentTime}
          aria-valuetext={`${timeLabel(currentTime)} of ${timeLabel(duration)}`}
          className="flex h-28 cursor-pointer touch-none items-center gap-px rounded-xl bg-muted/60 px-3 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-36 sm:gap-1 sm:px-5"
          onPointerDown={(event) => {
            seekingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            seekFromPointer(event);
          }}
          onPointerMove={(event) => { if (seekingRef.current) seekFromPointer(event); }}
          onPointerUp={() => { seekingRef.current = false; }}
          onPointerCancel={() => { seekingRef.current = false; }}
          onKeyDown={(event) => {
            if (!duration) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); const next = Math.max(0, currentTime - 5); if (audioRef.current) audioRef.current.currentTime = next; setCurrentTime(next); }
            if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); const next = Math.min(duration, currentTime + 5); if (audioRef.current) audioRef.current.currentTime = next; setCurrentTime(next); }
            if (event.key === "Home") { event.preventDefault(); if (audioRef.current) audioRef.current.currentTime = 0; setCurrentTime(0); }
            if (event.key === "End") { event.preventDefault(); if (audioRef.current) audioRef.current.currentTime = duration; setCurrentTime(duration); }
          }}
        >
          {bars.map((height, index) => {
            const active = index / bars.length <= (duration ? currentTime / duration : 0);
            return <motion.span key={index} animate={{ height: `${playing ? Math.min(100, height + ((index * 13) % 18)) : height}%` }} transition={{ duration: 0.16 }} className={cn("min-w-px flex-1 rounded-full", active ? "bg-primary" : "bg-border")} />;
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
          <span>{timeLabel(currentTime)}</span>
          <span>{timeLabel(duration)}</span>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); }} aria-label="Back 10 seconds" title="Back 10 seconds">
            <RotateCcwIcon />
          </Button>
          <Button size="icon-lg" onClick={togglePlayback} aria-label={playing ? "Pause audio" : "Play audio"}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Adjust volume" title="Adjust volume" />}><Volume2Icon /></DropdownMenuTrigger>
            <DropdownMenuContent side="right" sideOffset={8} align="center" className="w-52 p-3" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center gap-3">
                <Volume2Icon className="size-4 shrink-0 text-muted-foreground" />
                <Slider className="flex-1" value={volume} min={0} max={100} step={1} onValueChange={(value) => { if (audioRef.current) { audioRef.current.volume = value / 100; audioRef.current.muted = false; } setVolume(value); }} ariaLabel="Volume" />
                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{volume}%</span>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function VideoPreview({ url, onReady, onError, onNavigationToneChange }) {
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const controlsTimer = useRef(null);
  const samplingCanvasRef = useRef(null);
  const sampledSecondRef = useRef(-1);
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const revealControls = useCallback(() => {
    setShowControls(true);
    window.clearTimeout(controlsTimer.current);
    if (videoRef.current && !videoRef.current.paused) {
      controlsTimer.current = window.setTimeout(() => setShowControls(false), 1800);
    }
  }, []);
  useEffect(() => () => window.clearTimeout(controlsTimer.current), []);
  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const updateNavigationTone = useCallback(() => {
    const video = videoRef.current;
    const player = playerRef.current;
    if (!video || !player || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    try {
      const canvas = samplingCanvasRef.current || document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d", { willReadFrequently: true })?.drawImage(video, 0, 0);
      samplingCanvasRef.current = canvas;
      onNavigationToneChange(sampleNavigationTones(canvas, video.getBoundingClientRect(), player.getBoundingClientRect()));
    } catch {
      onNavigationToneChange({ left: defaultNavigationTone(), right: defaultNavigationTone() });
    }
  }, [onNavigationToneChange]);

  async function togglePlayback() {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      try {
        await videoRef.current.play();
      } catch {
        setPlaying(false);
      }
    } else videoRef.current.pause();
    revealControls();
  }
  async function toggleFullscreen() {
    if (!playerRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await playerRef.current.requestFullscreen();
  }
  return (
    <div
      ref={playerRef}
      data-video-player
      tabIndex={0}
      aria-label="Video player"
      className="group/video relative size-full overflow-hidden bg-black"
      onPointerMove={revealControls}
      onPointerLeave={() => { if (playing) { window.clearTimeout(controlsTimer.current); controlsTimer.current = window.setTimeout(() => setShowControls(false), 450); } }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") { event.preventDefault(); togglePlayback(); }
        if (event.key === "ArrowLeft") { event.preventDefault(); if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5); }
        if (event.key === "ArrowRight") { event.preventDefault(); if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5); }
      }}
    >
      <video
        ref={videoRef}
        playsInline
        className="size-full object-contain"
        src={url}
        onLoadedData={() => { onReady(); updateNavigationTone(); }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => {
          const nextTime = event.currentTarget.currentTime;
          setCurrentTime(nextTime);
          if (Math.floor(nextTime) !== sampledSecondRef.current) {
            sampledSecondRef.current = Math.floor(nextTime);
            updateNavigationTone();
          }
        }}
        onPlay={() => { setPlaying(true); revealControls(); }}
        onPause={() => { setPlaying(false); setShowControls(true); }}
        onEnded={() => { setPlaying(false); setShowControls(true); }}
        onError={onError}
        onClick={(event) => { event.stopPropagation(); togglePlayback(); }}
      />
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.14 }}
            className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/45 to-transparent px-3 pt-14 pb-3 sm:px-5 sm:pb-4"
            onClick={(event) => event.stopPropagation()}
          >
            <Slider className="w-full" value={Math.min(currentTime, duration || 0)} min={0} max={duration || 0.01} step={0.01} onValueChange={(value) => { if (videoRef.current) videoRef.current.currentTime = value; setCurrentTime(value); }} ariaLabel="Video progress" />
            <div className="mt-2 flex items-center gap-2 text-white">
              <Button className="border-white/20 bg-black/20 text-white hover:bg-white/15 hover:text-white" variant="outline" size="icon" onClick={togglePlayback} aria-label={playing ? "Pause video" : "Play video"}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </Button>
              <span className="min-w-20 text-xs tabular-nums text-white/80">{timeLabel(currentTime)} / {timeLabel(duration)}</span>
              <div className="ml-auto flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button className="border-white/20 bg-black/20 text-white hover:bg-white/15 hover:text-white" variant="outline" size="icon" aria-label="Adjust volume" />}><Volume2Icon /></DropdownMenuTrigger>
                  <DropdownMenuContent side="right" sideOffset={8} align="center" className="w-52 p-3" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center gap-3">
                      <Volume2Icon className="size-4 shrink-0 text-muted-foreground" />
                      <Slider className="flex-1" value={volume} min={0} max={100} step={1} onValueChange={(value) => { if (videoRef.current) { videoRef.current.volume = value / 100; videoRef.current.muted = false; } setVolume(value); }} ariaLabel="Volume" />
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{volume}%</span>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button className="border-white/20 bg-black/20 text-white hover:bg-white/15 hover:text-white" variant="outline" size="icon" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
                  {isFullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const pdfWorkerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

function PdfPageThumbnail({ pdf, pageNumber, active, onSelect }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let renderTask;
    async function render() {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const viewport = page.getViewport({ scale: 0.22 });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error) {
        if (error?.name !== "RenderingCancelledException") return;
      }
    }
    render();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pageNumber, pdf]);
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      className="h-auto w-full flex-col gap-1.5 p-2"
      onClick={() => onSelect(pageNumber)}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? "page" : undefined}
    >
      <canvas ref={canvasRef} className="max-w-full border bg-white shadow-xs" />
      <span className="text-xs text-muted-foreground">Page {pageNumber}</span>
    </Button>
  );
}

function PdfPageList({ pdf, pageCount, pageNumber, onSelect }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
      {Array.from({ length: pageCount }, (_, index) => (
        <PdfPageThumbnail key={index + 1} pdf={pdf} pageNumber={index + 1} active={pageNumber === index + 1} onSelect={onSelect} />
      ))}
    </div>
  );
}

function PdfDocumentPage({ pdf, pageNumber, viewerWidth, zoom, onError, pageRef }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!viewerWidth) return undefined;
    let cancelled = false;
    let renderTask;
    async function render() {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const naturalViewport = page.getViewport({ scale: 1 });
        const fitScale = Math.max(0.25, Math.min(1.5, (viewerWidth - 48) / naturalViewport.width));
        const viewport = page.getViewport({ scale: fitScale * zoom });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;
      } catch (error) {
        if (error?.name !== "RenderingCancelledException" && !cancelled) onError(error);
      }
    }
    render();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [onError, pageNumber, pdf, viewerWidth, zoom]);
  return (
    <section ref={pageRef} data-page-number={pageNumber} className="flex scroll-mt-5 justify-center">
      <canvas ref={canvasRef} className="border bg-white shadow-sm" aria-label={`Page ${pageNumber}`} />
    </section>
  );
}

function PdfPreview({ file, url, onReady, onError }) {
  const viewerRef = useRef(null);
  const pageRefs = useRef(new Map());
  const [pdf, setPdf] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [viewerWidth, setViewerWidth] = useState(0);
  const [isPagesOpen, setIsPagesOpen] = useState(false);

  useEffect(() => {
    let disposed = false;
    let loadingTask;
    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjs.getDocument({ url, withCredentials: true });
        const document = await loadingTask.promise;
        if (disposed) return;
        setPdf(document);
        setPageCount(document.numPages);
        setPageNumber(1);
        onReady();
      } catch (error) {
        if (!disposed) onError(error);
      }
    }
    load();
    return () => { disposed = true; loadingTask?.destroy(); };
  }, [onError, onReady, url]);

  useEffect(() => {
    if (!viewerRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setViewerWidth(entry.contentRect.width));
    observer.observe(viewerRef.current);
    return () => observer.disconnect();
  }, []);

  function changePage(nextPage) {
    const targetPage = Math.min(pageCount, Math.max(1, nextPage));
    setPageNumber(targetPage);
    pageRefs.current.get(targetPage)?.scrollIntoView({ block: "start", behavior: "auto" });
  }
  async function printDocument() {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return;
    const printUrl = URL.createObjectURL(await response.blob());
    const printWindow = window.open(printUrl, "_blank");
    printWindow?.addEventListener("load", () => printWindow.print(), { once: true });
    window.setTimeout(() => URL.revokeObjectURL(printUrl), 60_000);
  }
  const pages = pdf && pageCount > 0 && <PdfPageList pdf={pdf} pageCount={pageCount} pageNumber={pageNumber} onSelect={changePage} />;
  return (
    <div className="flex size-full min-h-0 overflow-hidden bg-muted/30" onClick={(event) => event.stopPropagation()}>
      <aside className="hidden w-40 shrink-0 border-r bg-background/45 md:flex md:flex-col">
        <div className="shrink-0 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Pages</div>
        {pages}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background/45 px-2 py-2 sm:px-3">
          <div className="flex items-center gap-1">
            <Button className="md:hidden" variant="ghost" size="icon-sm" onClick={() => setIsPagesOpen(true)} aria-label="Open page list"><PanelLeftOpenIcon /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => changePage(pageNumber - 1)} disabled={pageNumber <= 1} aria-label="Previous page"><ChevronLeftIcon /></Button>
            <input className="h-7 w-10 rounded-md border bg-background px-1 text-center text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" type="number" min="1" max={pageCount || 1} value={pageNumber} onChange={(event) => changePage(Number(event.target.value) || 1)} aria-label="Current page" />
            <span className="px-1 text-sm text-muted-foreground">/ {pageCount || "—"}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => changePage(pageNumber + 1)} disabled={!pageCount || pageNumber >= pageCount} aria-label="Next page"><ChevronRightIcon /></Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom((current) => Math.max(0.5, current - 0.15))} disabled={zoom <= 0.5} aria-label="Zoom out"><ZoomOutIcon /></Button>
            <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom((current) => Math.min(3, current + 0.15))} disabled={zoom >= 3} aria-label="Zoom in"><ZoomInIcon /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom(1)} aria-label="Fit page"><Maximize2Icon /></Button>
            <Button variant="ghost" size="icon-sm" onClick={printDocument} aria-label="Print document"><PrinterIcon /></Button>
          </div>
        </div>
        <div
          ref={viewerRef}
          className="min-h-0 flex-1 overflow-auto p-5 sm:p-8"
          onScroll={(event) => {
            const containerTop = event.currentTarget.getBoundingClientRect().top;
            const visiblePages = [...event.currentTarget.querySelectorAll("[data-page-number]")];
            const closestPage = visiblePages.reduce((closest, element) => {
              const distance = Math.abs(element.getBoundingClientRect().top - containerTop);
              return distance < closest.distance ? { distance, page: Number(element.dataset.pageNumber) } : closest;
            }, { distance: Number.POSITIVE_INFINITY, page: pageNumber });
            if (closestPage.page !== pageNumber) setPageNumber(closestPage.page);
          }}
        >
          <div className="flex min-h-full min-w-max flex-col items-center gap-5">
            {pdf && Array.from({ length: pageCount }, (_, index) => (
              <PdfDocumentPage
                key={index + 1}
                pdf={pdf}
                pageNumber={index + 1}
                viewerWidth={viewerWidth}
                zoom={zoom}
                onError={onError}
                pageRef={(node) => {
                  if (node) pageRefs.current.set(index + 1, node);
                  else pageRefs.current.delete(index + 1);
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <Sheet open={isPagesOpen} onOpenChange={setIsPagesOpen}>
        <SheetContent side="left" className="w-64 gap-0 p-0 md:hidden">
          <SheetHeader className="border-b"><SheetTitle>Pages</SheetTitle></SheetHeader>
          {pages}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DocumentPreview({ file, url, onReady, onError }) {
  const isText = /\.(txt|json)$/i.test(file.name);
  const [fontSize, setFontSize] = useState(14);
  const [content, setContent] = useState("");
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    if (!isText) return undefined;
    const controller = new AbortController();
    fetch(url, { credentials: "include", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load document");
        return response.text();
      })
      .then((value) => { setContent(value); onReady(); })
      .catch((error) => {
        if (error.name !== "AbortError") { setHasError(true); onError(error); }
      });
    return () => controller.abort();
  }, [isText, onError, onReady, url]);
  if (!isText) return <PdfPreview file={file} url={url} onReady={onReady} onError={onError} />;
  if (hasError) return previewUnavailable(file);
  return (
    <div className="flex size-full flex-col overflow-hidden bg-muted/30" onClick={(event) => event.stopPropagation()}>
      <div className="flex shrink-0 justify-end border-b bg-background/45 px-3 py-2">
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setFontSize((current) => Math.max(11, current - 1))} aria-label="Decrease text size"><ZoomOutIcon /></Button>
          <span className="w-9 text-center text-xs tabular-nums text-muted-foreground">{fontSize}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setFontSize((current) => Math.min(22, current + 1))} aria-label="Increase text size"><ZoomInIcon /></Button>
        </div>
      </div>
      <pre className="m-0 min-h-0 flex-1 overflow-auto p-4 font-mono leading-6 whitespace-pre-wrap text-foreground sm:p-6" style={{ fontSize: `${fontSize}px` }}>{content}</pre>
    </div>
  );
}

function PreviewMedia({ file, onNavigationToneChange }) {
  const reduceMotion = useReducedMotion();
  const url = driveApi.fileUrl(file.id);
  const kind = previewKind(file.name);
  const previewable = kind !== "download";
  const [isLoading, setIsLoading] = useState(previewable);
  const [isViewerVisible, setIsViewerVisible] = useState(!previewable);
  const [hasError, setHasError] = useState(false);
  const complete = useCallback(() => setIsLoading(false), []);
  const fail = useCallback(() => { setHasError(true); setIsLoading(false); }, []);
  let viewer = previewUnavailable(file);
  if (previewable && !hasError) {
    if (kind === "image") viewer = <ImagePreview file={file} url={url} onReady={complete} onError={fail} onNavigationToneChange={onNavigationToneChange} />;
    else if (kind === "video") viewer = <VideoPreview url={url} onReady={complete} onError={fail} onNavigationToneChange={onNavigationToneChange} />;
    else if (kind === "audio") viewer = <AudioPreview url={url} onReady={complete} onError={fail} />;
    else viewer = <DocumentPreview file={file} url={url} onReady={complete} onError={fail} />;
  }
  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/30">
      <motion.div initial={false} animate={{ opacity: isViewerVisible ? 1 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.16 }} className="size-full">
        {viewer}
      </motion.div>
      <AnimatePresence onExitComplete={() => setIsViewerVisible(true)}>
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14 }} className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-muted/30 text-sm text-muted-foreground">
            <Spinner />
            <span>Preparing preview…</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PreviewDialog({ file, files = [], onClose, onSelect }) {
  const [closingFile, setClosingFile] = useState(null);
  const previewPointerTarget = useRef(null);
  const activeFile = file || closingFile;
  const [sampledNavigationTones, setSampledNavigationTones] = useState(null);
  const previewFiles = files.filter((item) => item.type === "file" && previewKind(item.name) !== "download");
  const activeIndex = previewFiles.findIndex((item) => item.id === activeFile?.id);
  const isDocumentPreview = previewKind(activeFile?.name || "") === "embed";
  const fallbackNavigationTone = isDocumentPreview ? "light" : defaultNavigationTone();
  const navigationTones = sampledNavigationTones && sampledNavigationTones.fileId === activeFile?.id
    ? sampledNavigationTones.tones
    : { left: fallbackNavigationTone, right: fallbackNavigationTone };
  const updateNavigationTones = useCallback((tones) => {
    setSampledNavigationTones({ fileId: activeFile?.id, tones });
  }, [activeFile?.id]);
  const previewNavigationClass = (tone) => tone === "dark"
    ? "border-transparent bg-transparent text-white opacity-80 hover:border-transparent hover:bg-transparent hover:text-white hover:opacity-100 dark:border-transparent dark:bg-transparent"
    : "border-transparent bg-transparent text-black opacity-80 hover:border-transparent hover:bg-transparent hover:text-black hover:opacity-100 dark:border-transparent dark:bg-transparent";
  const previousFile = activeIndex > 0 ? previewFiles[activeIndex - 1] : null;
  const nextFile = activeIndex >= 0 && activeIndex < previewFiles.length - 1 ? previewFiles[activeIndex + 1] : null;
  useEffect(() => {
    if (!file) return undefined;
    const onKeyDown = (event) => {
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(event.target?.tagName) || event.target?.closest?.("[data-video-player]")) return;
      if (event.key === "ArrowLeft" && previousFile) { event.preventDefault(); onSelect?.(previousFile); }
      if (event.key === "ArrowRight" && nextFile) { event.preventDefault(); onSelect?.(nextFile); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [file, nextFile, onSelect, previousFile]);
  if (!activeFile) return null;
  function requestClose() {
    if (!file || closingFile) return;
    setClosingFile(file);
    window.setTimeout(() => { onClose(); setClosingFile(null); }, 180);
  }
  return (
    <Dialog open={Boolean(file) && !closingFile} onOpenChange={(open) => !open && requestClose()}>
      <DialogContent keepMounted showCloseButton={false} className={cn("inset-0 top-0 left-0 z-50 grid h-svh w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none bg-background/45 p-0 backdrop-blur-sm data-open:slide-in-from-bottom-2 data-closed:slide-out-to-bottom-2 sm:max-w-none", activeIndex >= 0 ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[auto_minmax(0,1fr)]")}>
        <DialogHeader className="flex-row items-center gap-3 border-b bg-background/40 px-3 py-2 sm:px-5">
          <Button variant="ghost" size="icon" onClick={requestClose} aria-label="Close preview" title="Close preview"><XIcon /></Button>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm sm:text-base">{activeFile.name}</DialogTitle>
            <DialogDescription className="mt-0.5 flex items-center gap-2"><Badge variant="secondary">{activeFile.size}</Badge></DialogDescription>
          </div>
          <Button nativeButton={false} variant="outline" size="sm" render={<a href={driveApi.downloadUrl(activeFile.id)} />}><DownloadIcon /> <span className="hidden sm:inline">Download</span></Button>
        </DialogHeader>
        <div
          className="flex min-h-0 overflow-hidden"
          onPointerDownCapture={(event) => { previewPointerTarget.current = event.target; }}
          onClick={(event) => {
            if (previewPointerTarget.current === event.target) requestClose();
          }}
        >
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <PreviewMedia key={activeFile.id} file={activeFile} onNavigationToneChange={updateNavigationTones} />
            <div className={cn("absolute top-1/2 left-2 -translate-y-1/2 sm:left-4", isDocumentPreview && "md:left-44")}>
              <Button className={previewNavigationClass(navigationTones.left)} variant="outline" size="icon-lg" onClick={(event) => { event.stopPropagation(); onSelect?.(previousFile); }} disabled={!previousFile} aria-label="Previous preview" title="Previous preview"><ChevronLeftIcon /></Button>
            </div>
            <div className="absolute top-1/2 right-2 -translate-y-1/2 sm:right-4">
              <Button className={previewNavigationClass(navigationTones.right)} variant="outline" size="icon-lg" onClick={(event) => { event.stopPropagation(); onSelect?.(nextFile); }} disabled={!nextFile} aria-label="Next preview" title="Next preview"><ChevronRightIcon /></Button>
            </div>
          </div>
        </div>
        {activeIndex >= 0 && <div className="flex min-h-12 items-center justify-center border-t bg-background/40 px-3 text-xs text-muted-foreground">{activeIndex + 1} of {previewFiles.length} previewable files</div>}
      </DialogContent>
    </Dialog>
  );
}
