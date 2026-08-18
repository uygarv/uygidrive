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
  RotateCwIcon,
  Trash2Icon,
  Volume2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
  UserRoundIcon,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { driveApi } from "@/lib/drive-api";
import { previewKind } from "@/lib/drive-utils";
import { cn } from "@/lib/utils";
import { IdentityAvatar } from "@/components/identity-avatar";

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

export function EmptyTrashDialog({ open, onClose, onEmpty }) {
  const [isPending, setIsPending] = useState(false);
  async function confirm() {
    setIsPending(true);
    try {
      await onEmpty();
      onClose();
    } finally {
      setIsPending(false);
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete all items in Trash?</AlertDialogTitle>
          <AlertDialogDescription>
            All items in Trash will be permanently deleted. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm} disabled={isPending}>
            {isPending && <Spinner data-icon="inline-start" />}Delete all
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ShareDialog({ file, currentUserId = null, closing = false, onClose }) {
  return (
    <Dialog open={Boolean(file) && !closing} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      {file && <ShareContent key={file.id} file={file} currentUserId={currentUserId} onClose={onClose} />}
    </Dialog>
  );
}

function ShareContent({ file, currentUserId, onClose }) {
  const [visibility, setVisibility] = useState(file.accessMode || "private");
  const [linkExpiry, setLinkExpiry] = useState("7d");
  const [linkTarget, setLinkTarget] = useState("preview");
  const [createdLink, setCreatedLink] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientResults, setRecipientResults] = useState([]);
  const [newRecipientRole, setNewRecipientRole] = useState("viewer");
  const [recipients, setRecipients] = useState([]);
  const [pendingRecipient, setPendingRecipient] = useState(null);
  const initializedShareFileId = useRef(null);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (initializedShareFileId.current === file.id) return undefined;
    initializedShareFileId.current = file.id;
    driveApi
      .listShares(file.id)
      .then((result) => {
        const publicShare = result.shares?.find((share) => share.mode === "public" && !share.revokedAt);
        setVisibility(file.accessMode || (publicShare ? "public" : "private"));
        setRecipients((result.shares || []).filter((share) => share.mode === "recipient" && !share.revokedAt).map((share) => ({ ...share, username: share.recipient?.username, avatarUrl: share.recipient?.avatarUrl })));
      })
      .catch((error) =>
        {
          initializedShareFileId.current = null;
          toast.error("Couldn’t prepare sharing", { description: error.message });
        },
      )
      .finally(() => setIsLoading(false));
    return undefined;
  }, [file]);
  async function changeVisibility(value) {
    if (!file) return;
    setVisibility(value);
    try {
      await driveApi.setAccess(file.id, value);
      if (value === "private") {
        setLinkExpiry((current) => current === "never" ? "7d" : current);
      }
    } catch (error) {
      setVisibility(value === "public" ? "private" : "public");
      toast.error("Couldn’t change visibility", { description: error.message });
    }
  }
  async function createLink() {
    setIsGenerating(true);
    try {
      const isPublic = linkExpiry === "never";
      const expiryMinutes = { "1h": 60, "1d": 24 * 60, "7d": 7 * 24 * 60, "30d": 30 * 24 * 60 }[linkExpiry];
      const result = await driveApi.createShare(file.id, isPublic ? "public" : "link", { expiresAt: isPublic ? null : new Date(Date.now() + expiryMinutes * 60_000).toISOString(), linkTarget: file.type === "file" ? linkTarget : "preview" });
      setCreatedLink(result.share);
    } catch (error) {
      toast.error("Couldn’t create private link", {
        description: error.message,
      });
    } finally {
      setIsGenerating(false);
    }
  }
  useEffect(() => {
    if (visibility !== "private" || recipientQuery.trim().length < 2) return undefined;
    const timer = window.setTimeout(() => driveApi.findUsers(recipientQuery.trim()).then((result) => setRecipientResults((result.users || []).filter((user) => user.id !== currentUserId))).catch(() => setRecipientResults([])), 180);
    return () => window.clearTimeout(timer);
  }, [currentUserId, recipientQuery, visibility]);
  function addRecipient(user) {
    if (user.id === currentUserId) {
      toast.error("You can’t share an item with yourself");
      return;
    }
    if (pendingRecipient?.status === "pending" || recipients.some((share) => share.recipientId === user.id)) return;
    const pending = { user, role: newRecipientRole, status: "pending", share: null };
    setPendingRecipient(pending);
    driveApi.createShare(file.id, "recipient", { recipientId: user.id, role: newRecipientRole })
      .then((result) => {
        const share = { ...result.share, username: user.username, avatarUrl: user.avatarUrl };
        setRecipients((current) => [...current, share]);
        setPendingRecipient((current) => current?.user.id === user.id ? { ...current, status: "success", share } : current);
      })
      .catch((error) => {
        setPendingRecipient((current) => current?.user.id === user.id ? null : current);
        toast.error("Couldn’t add recipient", { description: error.message });
      });
  }
  function revokeRecipient(share) {
    if (share.pending) return;
    const previous = recipients;
    setRecipients((current) => current.filter((item) => item.id !== share.id));
    setPendingRecipient((current) => current?.share?.id === share.id ? null : current);
    driveApi.revokeShare(share.id).catch((error) => {
      setRecipients(previous);
      setPendingRecipient((current) => current ?? { user: { id: share.recipientId, username: share.username, avatarUrl: share.avatarUrl }, role: share.role, status: "success", share });
      toast.error("Couldn’t remove access", { description: error.message });
    });
  }
  async function changeRecipientRole(share, role) {
    if (share.pending) return;
    try { await driveApi.updateShareRole(share.id, role); setRecipients((current) => current.map((item) => item.id === share.id ? { ...item, role } : item)); } catch (error) { toast.error("Couldn’t update role", { description: error.message }); }
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
    visibility === "public" ? "Public" : "Private";
  return (
    <DialogContent keepMounted className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="pr-8 leading-5 break-all">Share {file.name}</DialogTitle>
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
                    Private
                  </SelectItem>
                  <SelectItem value="public">
                    <Globe2Icon />
                    Public
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {visibility === "public"
                ? "Anyone can open a public link you create."
                : "Only private links and people you add can access this item."}
            </FieldDescription>
          </Field>
          <Field className="rounded-xl border bg-muted/30 p-3">
            <FieldLabel>Link</FieldLabel>
            <FieldDescription>{visibility === "public" ? "Choose a public link that never expires or a private expiring link." : "Private links always expire."}</FieldDescription>
            <div className="mt-3 flex w-full items-center">
              <Select value={linkExpiry} onValueChange={setLinkExpiry}><SelectTrigger className="h-9 flex-1 rounded-r-none border-r-0" aria-label="Link expiration"><span>{{ never: "Never expires", "1h": "1 hour", "1d": "1 day", "7d": "7 days", "30d": "30 days" }[linkExpiry]}</span></SelectTrigger><SelectContent><SelectGroup>{visibility === "public" && <SelectItem value="never">Never expires</SelectItem>}<SelectItem value="1h">1 hour</SelectItem><SelectItem value="1d">1 day</SelectItem><SelectItem value="7d">7 days</SelectItem><SelectItem value="30d">30 days</SelectItem></SelectGroup></SelectContent></Select>
              {file.type === "file" && <Select value={linkTarget} onValueChange={setLinkTarget}><SelectTrigger className="h-9 flex-1 rounded-none border-r-0" aria-label="Link destination"><span>{linkTarget === "content" ? "File content" : "UygiDrive preview"}</span></SelectTrigger><SelectContent><SelectGroup><SelectItem value="preview">UygiDrive preview</SelectItem><SelectItem value="content">File content</SelectItem></SelectGroup></SelectContent></Select>}
              <Button type="button" className="flex-1 rounded-l-none" onClick={createLink} disabled={isGenerating}>{isGenerating ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}Create link</Button>
            </div>
            {file.type === "file" && <p className="mt-1.5 text-xs text-muted-foreground">{linkTarget === "content" ? "Opens the file directly through a UygiDrive URL." : "Opens the UygiDrive share preview."}</p>}
            {createdLink?.url && <InputGroup className="mt-3"><InputGroupInput value={createdLink.url} readOnly /><InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" onClick={() => copy(createdLink.url)} aria-label="Copy share link"><CopyIcon /></InputGroupButton></InputGroupAddon></InputGroup>}
          </Field>
          {visibility === "private" && (
            <Field>
              <FieldLabel>People</FieldLabel>
              <FieldDescription>Add registered users. {file.type === "folder" ? "Editors can manage folder contents." : "Files are view-only."}</FieldDescription>
              <div className="mt-2 flex gap-2"><Input value={recipientQuery} onChange={(event) => { const value = event.target.value; setRecipientQuery(value); if (!value.trim()) setRecipientResults([]); }} placeholder="Search by username" /><Select value={newRecipientRole} onValueChange={setNewRecipientRole}><SelectTrigger className="w-24"><span>{newRecipientRole === "editor" ? "Editor" : "Viewer"}</span></SelectTrigger><SelectContent><SelectGroup><SelectItem value="viewer">Viewer</SelectItem>{file.type === "folder" && <SelectItem value="editor">Editor</SelectItem>}</SelectGroup></SelectContent></Select></div>
              {recipientResults.length > 0 && <div className="mt-2 overflow-hidden rounded-lg border"><AnimatePresence mode="wait">{recipientResults.map((user) => {
                const selected = pendingRecipient?.user.id === user.id ? pendingRecipient : null;
                const existing = recipients.find((share) => share.recipientId === user.id);
                const access = selected?.share || existing;
                return <motion.div key={user.id} layout="position" initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4, scale: reduceMotion ? 1 : 0.98 }} transition={{ duration: reduceMotion ? 0 : 0.16 }} className="border-b last:border-b-0"><AnimatePresence initial={false} mode="wait">{access || selected ? <motion.div key="access" initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: reduceMotion ? 0 : 0.14 }} className="flex items-center gap-2 px-3 py-2"><IdentityAvatar user={user} size="sm" /><span className="min-w-0 flex-1 truncate text-sm">@{user.username}</span><Select value={access?.role || selected.role} onValueChange={(role) => access ? changeRecipientRole(access, role) : undefined}><SelectTrigger className={cn("h-8 w-24", !access && "pointer-events-none")}><span>{(access?.role || selected.role) === "editor" ? "Editor" : "Viewer"}</span></SelectTrigger><SelectContent><SelectGroup><SelectItem value="viewer">Viewer</SelectItem>{file.type === "folder" && <SelectItem value="editor">Editor</SelectItem>}</SelectGroup></SelectContent></Select><Button type="button" variant="ghost" size="sm" className={cn("text-destructive", !access && "pointer-events-none")} onClick={() => access && revokeRecipient(access)}>Remove</Button></motion.div> : <motion.button key="result" type="button" initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: reduceMotion ? 0 : 0.14 }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => addRecipient(user)}><span className="flex min-w-0 items-center gap-2 truncate"><IdentityAvatar user={user} size="sm" />@{user.username}</span><span className="text-xs text-primary">Add as {newRecipientRole}</span></motion.button>}</AnimatePresence></motion.div>;
              })}</AnimatePresence></div>}
              {recipients.filter((share) => !recipientResults.some((user) => user.id === share.recipientId)).length > 0 && <div className="mt-2 overflow-hidden rounded-lg border"><AnimatePresence initial={false}>{recipients.filter((share) => !recipientResults.some((user) => user.id === share.recipientId)).map((share) => <motion.div key={share.id} layout="position" initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }} transition={{ duration: reduceMotion ? 0 : 0.16 }} className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"><IdentityAvatar user={share} size="sm" /><span className="min-w-0 flex-1 truncate text-sm">{share.username ? `@${share.username}` : "Shared user"}</span><Select value={share.role || "viewer"} onValueChange={(role) => changeRecipientRole(share, role)}><SelectTrigger className="h-8 w-24"><span>{share.role === "editor" ? "Editor" : "Viewer"}</span></SelectTrigger><SelectContent><SelectGroup><SelectItem value="viewer">Viewer</SelectItem>{file.type === "folder" && <SelectItem value="editor">Editor</SelectItem>}</SelectGroup></SelectContent></Select><Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => revokeRecipient(share)}>Remove</Button></motion.div>)}</AnimatePresence></div>}
            </Field>
          )}
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
  const hoverResetTimer = useRef(null);
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hoverTime, setHoverTime] = useState(null);
  const [isHoverTooltipOpen, setIsHoverTooltipOpen] = useState(false);
  const bars = useMemo(() => Array.from({ length: 72 }, (_, index) => 22 + ((Math.sin(index * 1.72) + Math.sin(index * 0.37 + 1.4) + 2) / 4) * 68), []);
  useEffect(() => () => {
    audioRef.current?.pause();
    window.clearTimeout(hoverResetTimer.current);
  }, []);
  function showHoverTime(next) {
    window.clearTimeout(hoverResetTimer.current);
    setHoverTime(next);
    setIsHoverTooltipOpen(true);
  }
  function hideHoverTime() {
    setIsHoverTooltipOpen(false);
    window.clearTimeout(hoverResetTimer.current);
    hoverResetTimer.current = window.setTimeout(() => setHoverTime(null), reduceMotion ? 0 : 160);
  }
  function positionFromPointer(event) {
    if (!duration) return 0;
    const { left, width } = event.currentTarget.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((event.clientX - left) / width) * duration));
  }
  function seekFromPointer(event) {
    if (!audioRef.current || !duration) return;
    const next = positionFromPointer(event);
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
          className="relative flex h-28 cursor-pointer touch-none items-center gap-px rounded-xl bg-muted/60 px-3 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-36 sm:gap-1 sm:px-5"
          onPointerDown={(event) => {
            seekingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            showHoverTime(positionFromPointer(event));
            seekFromPointer(event);
          }}
          onPointerMove={(event) => { showHoverTime(positionFromPointer(event)); if (seekingRef.current) seekFromPointer(event); }}
          onPointerLeave={() => { if (!seekingRef.current) hideHoverTime(); }}
          onPointerUp={() => { seekingRef.current = false; }}
          onPointerCancel={() => { seekingRef.current = false; hideHoverTime(); }}
          onKeyDown={(event) => {
            if (!duration) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); const next = Math.max(0, currentTime - 5); if (audioRef.current) audioRef.current.currentTime = next; setCurrentTime(next); }
            if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); const next = Math.min(duration, currentTime + 5); if (audioRef.current) audioRef.current.currentTime = next; setCurrentTime(next); }
            if (event.key === "Home") { event.preventDefault(); if (audioRef.current) audioRef.current.currentTime = 0; setCurrentTime(0); }
            if (event.key === "End") { event.preventDefault(); if (audioRef.current) audioRef.current.currentTime = duration; setCurrentTime(duration); }
          }}
        >
          {bars.map((height, index) => {
            const played = Math.min(1, Math.max(0, (duration ? currentTime / duration : 0) * bars.length - index));
            const hovered = Math.min(1, Math.max(0, (duration && hoverTime !== null ? hoverTime / duration : 0) * bars.length - index));
            return <motion.span key={index} animate={{ height: `${playing ? Math.min(100, height + ((index * 13) % 18)) : height}%` }} transition={{ duration: reduceMotion ? 0 : 0.16 }} className="relative min-w-px flex-1 overflow-hidden rounded-full bg-muted-foreground/20"><motion.span aria-hidden="true" animate={{ opacity: hovered > 0 && played === 0 ? 1 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }} className="absolute inset-0 bg-muted-foreground/35" /><motion.span aria-hidden="true" animate={{ opacity: played > 0 ? 1 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }} className="absolute inset-0 bg-primary" /></motion.span>;
          })}
          <Tooltip open={isHoverTooltipOpen}>
            <TooltipTrigger render={<span aria-hidden="true" style={{ left: `${duration ? ((hoverTime || 0) / duration) * 100 : 0}%` }} className="pointer-events-none absolute top-0 bottom-0 w-px" />} />
            <TooltipContent side="top" sideOffset={10} className="tabular-nums">{timeLabel(hoverTime || 0)}</TooltipContent>
          </Tooltip>
        </div>
        <div className="relative mt-3 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
          <span>{timeLabel(currentTime)}</span>
          
          <span>{timeLabel(duration)}</span>
        </div>
        <div className="relative mt-5 flex items-center justify-center gap-2">
          <div className="absolute left-0">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Adjust volume" title="Adjust volume" />}><Volume2Icon /></DropdownMenuTrigger>
            <DropdownMenuContent side="top" sideOffset={8} align="start" className="w-52 p-3" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center gap-3">
                <Volume2Icon className="size-4 shrink-0 text-muted-foreground" />
                <Slider className="flex-1" value={volume} min={0} max={100} step={1} onValueChange={(value) => { if (audioRef.current) { audioRef.current.volume = value / 100; audioRef.current.muted = false; } setVolume(value); }} ariaLabel="Volume" />
                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{volume}%</span>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
          <Button variant="outline" size="icon" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); }} aria-label="Back 10 seconds" title="Back 10 seconds">
            <RotateCcwIcon />
          </Button>
          <Button size="icon-lg" onClick={togglePlayback} aria-label={playing ? "Pause audio" : "Play audio"}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10); }} aria-label="Forward 10 seconds" title="Forward 10 seconds">
            <RotateCwIcon />
          </Button>
          <div className="absolute right-0">
            <Select value={String(playbackRate)} onValueChange={(value) => { const rate = Number(value); if (audioRef.current) audioRef.current.playbackRate = rate; setPlaybackRate(rate); }}>
              <SelectTrigger className="size-10 justify-center p-0 [&>svg]:hidden" aria-label="Adjust playback speed">
                <span className="text-xs font-semibold tabular-nums">{playbackRate}×</span>
              </SelectTrigger>
              <SelectContent side="top" sideOffset={8} align="end" alignItemWithTrigger={false} className="w-24" onClick={(event) => event.stopPropagation()}>
                <SelectGroup>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => <SelectItem key={rate} value={String(rate)}>{rate}×</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
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
const PDF_RENDER_AHEAD = 1;
const PDF_MAX_CANVAS_PIXELS = 4_000_000;

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
  const startPage = Math.max(1, pageNumber - 6);
  const endPage = Math.min(pageCount, pageNumber + 6);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
      <p className="px-2 py-1 text-xs text-muted-foreground">Pages {startPage}–{endPage} of {pageCount}</p>
      {Array.from({ length: endPage - startPage + 1 }, (_, index) => (
        <PdfPageThumbnail key={startPage + index} pdf={pdf} pageNumber={startPage + index} active={pageNumber === startPage + index} onSelect={onSelect} />
      ))}
    </div>
  );
}

function PdfDocumentPage({ pdf, pageNumber, viewerWidth, zoom, onDimensions, onError }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!viewerWidth) return undefined;
    let cancelled = false;
    let renderTask;
    let canvas;
    async function render() {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const naturalViewport = page.getViewport({ scale: 1 });
        const fitScale = Math.max(0.25, Math.min(1.5, (viewerWidth - 48) / naturalViewport.width));
        const viewport = page.getViewport({ scale: fitScale * zoom });
        onDimensions(pageNumber, {
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        });
        canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        // A single high-zoom page can still be enormous on retina displays. Keep
        // its backing canvas below a practical memory ceiling.
        const requestedOutputScale = window.devicePixelRatio || 1;
        const outputScale = Math.min(requestedOutputScale, Math.sqrt(PDF_MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
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
    return () => {
      cancelled = true;
      renderTask?.cancel();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [onDimensions, onError, pageNumber, pdf, viewerWidth, zoom]);
  return (
    <canvas ref={canvasRef} className="border bg-white shadow-sm" aria-label={`Page ${pageNumber}`} />
  );
}

function PdfDocumentScroller({ pdf, pageCount, pageNumber, viewerRef, viewerWidth, zoom, onPageChange, onError }) {
  const pageRefs = useRef(new Map());
  const [pageDimensions, setPageDimensions] = useState({});
  const renderedPages = useMemo(() => {
    const startPage = Math.max(1, pageNumber - PDF_RENDER_AHEAD);
    const endPage = Math.min(pageCount, pageNumber + PDF_RENDER_AHEAD);
    return new Set(Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index));
  }, [pageCount, pageNumber]);
  const estimatedHeight = Math.max(480, Math.round(Math.max(viewerWidth - 48, 420) * 1.414 * zoom));

  const setPageRef = useCallback((page, element) => {
    if (element) pageRefs.current.set(page, element);
    else pageRefs.current.delete(page);
  }, []);
  const saveDimensions = useCallback((page, dimensions) => {
    setPageDimensions((current) => {
      const existing = current[page];
      if (existing?.width === dimensions.width && existing?.height === dimensions.height) return current;
      return { ...current, [page]: dimensions };
    });
  }, []);
  useEffect(() => {
    const root = viewerRef.current;
    if (!root) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const mostVisible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (mostVisible) onPageChange(Number(mostVisible.target.dataset.pageNumber));
    }, { root, threshold: [0.25, 0.6] });
    pageRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [onPageChange, pageCount, viewerRef]);

  return (
    <div className="mx-auto flex min-w-max flex-col items-center gap-5">
      {Array.from({ length: pageCount }, (_, index) => {
        const page = index + 1;
        const dimensions = pageDimensions[page];
        const isRendered = renderedPages.has(page);
        return (
          <section
            key={page}
            ref={(element) => setPageRef(page, element)}
            data-page-number={page}
            className="flex scroll-mt-5 justify-center"
            style={{ minHeight: dimensions?.height || estimatedHeight, minWidth: dimensions?.width || 1 }}
            aria-label={`Page ${page}`}
          >
            {isRendered ? (
              <PdfDocumentPage pdf={pdf} pageNumber={page} viewerWidth={viewerWidth} zoom={zoom} onDimensions={saveDimensions} onError={onError} />
            ) : (
              <span className="sr-only">Page {page} loads as you scroll.</span>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PdfPreview({ file, url, onReady, onError }) {
  const viewerRef = useRef(null);
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

  const setVisiblePage = useCallback((nextPage) => {
    const targetPage = Math.min(pageCount, Math.max(1, nextPage));
    setPageNumber(targetPage);
  }, [pageCount]);
  function changePage(nextPage) {
    const targetPage = Math.min(pageCount, Math.max(1, nextPage));
    setVisiblePage(targetPage);
    const viewer = viewerRef.current;
    const target = viewer?.querySelector(`[data-page-number="${targetPage}"]`);
    if (viewer && target) {
      // scrollIntoView also scrolls the preview dialog's ancestors, which can
      // move the toolbar out of view. Limit page navigation to the PDF pane.
      viewer.scrollTo({
        top: target.getBoundingClientRect().top - viewer.getBoundingClientRect().top + viewer.scrollTop,
        behavior: "smooth",
      });
    }
  }
  function selectPage(nextPage) {
    changePage(nextPage);
    setIsPagesOpen(false);
  }
  async function printDocument() {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return;
    const printUrl = URL.createObjectURL(await response.blob());
    const printWindow = window.open(printUrl, "_blank");
    printWindow?.addEventListener("load", () => printWindow.print(), { once: true });
    window.setTimeout(() => URL.revokeObjectURL(printUrl), 60_000);
  }
  const pages = pdf && pageCount > 0 && <PdfPageList pdf={pdf} pageCount={pageCount} pageNumber={pageNumber} onSelect={selectPage} />;
  return (
    <div className="flex size-full min-h-0 overflow-hidden bg-muted/30" onClick={(event) => event.stopPropagation()}>
      <aside className="hidden w-40 shrink-0 border-r bg-background/45 md:flex md:flex-col">
        <div className="shrink-0 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Pages</div>
        {pages}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background/90 px-2 py-2 backdrop-blur-sm sm:px-3">
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
          className="min-h-0 flex-1 overflow-auto overscroll-contain p-5 sm:p-8"
        >
          {pdf && <PdfDocumentScroller pdf={pdf} pageCount={pageCount} pageNumber={pageNumber} viewerRef={viewerRef} viewerWidth={viewerWidth} zoom={zoom} onPageChange={setVisiblePage} onError={onError} />}
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

const codeLanguages = {
  js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "tsx", lua: "lua", py: "python", rb: "ruby", php: "php", java: "java", c: "c", cc: "cpp", cpp: "cpp", cs: "csharp", go: "go", rs: "rust", swift: "swift", kt: "kotlin", kts: "kotlin", sh: "shellscript", bash: "shellscript", zsh: "shellscript", fish: "shellscript", html: "html", css: "css", scss: "scss", sass: "sass", less: "less", vue: "vue", svelte: "svelte", xml: "xml", yaml: "yaml", yml: "yaml", toml: "toml", sql: "sql", md: "markdown", mdx: "mdx", graphql: "graphql", gql: "graphql", dockerfile: "dockerfile",
};

function codeLanguage(file) {
  const lower = file.name.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  return codeLanguages[lower.split(".").pop()] || "text";
}

function CodePreview({ file, url, onReady, onError }) {
  const [fontSize, setFontSize] = useState(14);
  const [html, setHtml] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { credentials: "include", signal: controller.signal, headers: { Range: "bytes=0-1048575" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load code");
        setTruncated(response.status === 206);
        const [source, shiki] = await Promise.all([response.text(), import("shiki")]);
        return shiki.codeToHtml(source, { lang: codeLanguage(file), theme: "github-dark" });
      })
      .then((value) => { setHtml(value); onReady(); })
      .catch((error) => { if (error.name !== "AbortError") { setHasError(true); onError(error); } });
    return () => controller.abort();
  }, [file, onError, onReady, url]);
  if (hasError) return previewUnavailable(file);
  return <div className="flex size-full flex-col overflow-hidden bg-[#24292f]" onClick={(event) => event.stopPropagation()}><div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/15 px-3 py-2"><span className="truncate font-mono text-xs text-white/65">{codeLanguage(file)}</span><div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" className="text-white/75 hover:bg-white/10 hover:text-white" onClick={() => setFontSize((current) => Math.max(11, current - 1))} aria-label="Decrease code text size"><ZoomOutIcon /></Button><span className="w-9 text-center text-xs tabular-nums text-white/65">{fontSize}</span><Button variant="ghost" size="icon-sm" className="text-white/75 hover:bg-white/10 hover:text-white" onClick={() => setFontSize((current) => Math.min(22, current + 1))} aria-label="Increase code text size"><ZoomInIcon /></Button></div></div>{truncated && <div className="shrink-0 border-b border-white/10 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-100">Previewing the first 1 MB. Download the file to view all content.</div>}<div className="min-h-0 flex-1 overflow-auto [&>pre]:m-0 [&>pre]:min-h-full [&>pre]:p-4 [&>pre]:font-mono [&>pre]:leading-6 sm:[&>pre]:p-6" style={{ fontSize: `${fontSize}px` }} dangerouslySetInnerHTML={{ __html: html }} /></div>;
}

function PreviewMedia({ file, contentUrl, onNavigationToneChange }) {
  const reduceMotion = useReducedMotion();
  const url = contentUrl || driveApi.fileUrl(file.id);
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
    else if (kind === "code") viewer = <CodePreview file={file} url={url} onReady={complete} onError={fail} />;
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

export function PreviewDialog({ file, files = [], onClose, onSelect, getContentUrl, getDownloadUrl }) {
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
      <DialogContent keepMounted showCloseButton={false} className={cn("inset-0 top-0 left-0 z-50 grid h-dvh w-dvw max-w-[100dvw] translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none bg-background/45 p-0 backdrop-blur-sm data-open:slide-in-from-bottom-2 data-closed:slide-out-to-bottom-2 sm:max-w-[100dvw]", activeIndex >= 0 ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[auto_minmax(0,1fr)]")}>
        <DialogHeader className="w-full min-w-0 flex-row items-center gap-3 overflow-hidden border-b bg-background/40 px-3 py-2 sm:px-5">
          <Button className="shrink-0" variant="ghost" size="icon" onClick={requestClose} aria-label="Close preview" title="Close preview"><XIcon /></Button>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm sm:text-base">{activeFile.name}</DialogTitle>
            <DialogDescription className="mt-0.5 flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap"><Badge variant="outline">{activeFile.size}</Badge>{activeFile.isShared && <Badge variant="outline">Shared</Badge>}{activeFile.owner?.username && !activeFile.uploadedBy?.username && <span className="inline-flex min-w-0 items-center gap-1 truncate"><IdentityAvatar user={activeFile.owner} size="sm" className="!size-5" />@{activeFile.owner.username}</span>}{activeFile.uploadedBy?.username && <span className="inline-flex min-w-0 items-center gap-1 truncate"><IdentityAvatar user={activeFile.uploadedBy} size="sm" className="!size-5" />Uploaded by @{activeFile.uploadedBy.username}</span>}</DialogDescription>
          </div>
          <Button className="shrink-0" nativeButton={false} variant="outline" size="icon-sm" aria-label="Download" title="Download" render={<a href={getDownloadUrl?.(activeFile) || driveApi.downloadUrl(activeFile.id)} />}><DownloadIcon /></Button>
        </DialogHeader>
        <div
          className="flex min-h-0 overflow-hidden"
          onPointerDownCapture={(event) => { previewPointerTarget.current = event.target; }}
          onClick={(event) => {
            if (previewPointerTarget.current === event.target) requestClose();
          }}
        >
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <PreviewMedia key={activeFile.id} file={activeFile} contentUrl={getContentUrl?.(activeFile)} onNavigationToneChange={updateNavigationTones} />
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
