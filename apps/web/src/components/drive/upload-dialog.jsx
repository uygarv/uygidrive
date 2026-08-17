"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileUpIcon, PauseIcon, PlayIcon, Trash2Icon, UploadCloudIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { driveApi } from "@/lib/drive-api";
import { cn } from "@/lib/utils";

const UPLOAD_QUEUE_STORAGE_KEY = "uygidrive.pending-uploads.v1";

function clientUploadId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  const values = new Uint32Array(2);
  if (typeof cryptoApi?.getRandomValues === "function") cryptoApi.getRandomValues(values);
  else {
    values[0] = Math.floor(Math.random() * 0xffffffff);
    values[1] = Math.floor(Math.random() * 0xffffffff);
  }
  return `${Date.now().toString(36)}-${values[0].toString(36)}${values[1].toString(36)}`;
}

function savedUploads() {
  try {
    const value = JSON.parse(window.localStorage.getItem(UPLOAD_QUEUE_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item?.uploadId && item?.expiresAt && new Date(item.expiresAt) > new Date()) : [];
  } catch {
    return [];
  }
}

export function UploadDialog({ open, onOpenChange, parentId, onComplete, onUploadsChange, onResumeRequired }) {
  const inputRef = useRef(null);
  const uploadHandles = useRef(new Map());
  const cancelledUploads = useRef(new Set());
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [isResumeOpen, setIsResumeOpen] = useState(false);
  const [resumeTargetId, setResumeTargetId] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    onUploadsChange?.(uploads);
  }, [onUploadsChange, uploads]);

  useEffect(() => {
    let active = true;
    Promise.all([Promise.resolve(savedUploads()), driveApi.listOpenUploads().catch(() => ({ uploads: [] }))]).then(([saved, result]) => {
      if (!active) return;
      const savedByUploadId = new Map(saved.map((item) => [item.uploadId, item]));
      const restored = result.uploads.map((upload) => {
        const local = savedByUploadId.get(upload.id);
        const sizeBytes = Number(upload.expectedBytes);
        return {
          id: local?.id || `resume-${upload.id}`,
          uploadId: upload.id,
          parentId: upload.parentId,
          name: upload.name,
          sizeBytes,
          lastModified: local?.lastModified ?? null,
          contentType: upload.contentType,
          expiresAt: upload.expiresAt,
          receivedBytes: Number(upload.receivedBytes || 0),
          progress: Math.round((Number(upload.receivedBytes || 0) / sizeBytes) * 100),
          state: "needs-file",
        };
      });
      setUploads(restored);
      setQueueLoaded(true);
      if (restored.length) onResumeRequired?.();
    });
    return () => { active = false; };
  }, [onResumeRequired]);

  useEffect(() => {
    if (!queueLoaded) return;
    const pending = uploads.filter((item) => item.uploadId && !["complete", "cancelled"].includes(item.state)).map(({ file, progress, error, state, ...item }) => item);
    window.localStorage.setItem(UPLOAD_QUEUE_STORAGE_KEY, JSON.stringify(pending));
  }, [queueLoaded, uploads]);

  function handleOpenChange(nextOpen) {
    if (!nextOpen) setUploads((current) => current.filter((item) => item.state !== "complete"));
    onOpenChange(nextOpen);
  }

  function queueFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const queued = files.map((file) => ({ id: `${file.name}-${file.lastModified}-${clientUploadId()}`, file, name: file.name, sizeBytes: file.size, lastModified: file.lastModified, contentType: file.type || null, parentId, receivedBytes: 0, progress: 0, state: "uploading" }));
    setUploads((current) => [...current, ...queued]);
    queued.forEach(({ id, file }) => startUpload(id, file));
  }

  function startUpload(id, file) {
      const existing = uploads.find((item) => item.id === id);
      const handle = driveApi.upload(file, existing?.parentId ?? parentId, (progress, receivedBytes) => setUploads((current) => current.map((item) => item.id === id ? { ...item, progress, receivedBytes } : item)), {
        uploadId: existing?.uploadId,
        onCreated: (upload) => setUploads((current) => current.map((item) => item.id === id ? { ...item, uploadId: upload.id, expiresAt: upload.expiresAt } : item)),
      });
      uploadHandles.current.set(id, handle);
      const { upload } = handle;
      upload.then(() => {
        uploadHandles.current.delete(id);
        setUploads((current) => current.map((item) => item.id === id ? { ...item, progress: 100, receivedBytes: item.sizeBytes, state: "complete" } : item));
        onComplete?.();
      }).catch((error) => {
        uploadHandles.current.delete(id);
        if (cancelledUploads.current.delete(id)) return;
        if (error.code === "UPLOAD_PAUSED") {
          setUploads((current) => current.map((item) => item.id === id ? { ...item, state: "paused" } : item));
          return;
        }
        setUploads((current) => current.map((item) => item.id === id ? { ...item, state: "error", error: error.message } : item));
      });
  }

  function pauseUpload(id) {
    uploadHandles.current.get(id)?.pause();
    setUploads((current) => current.map((item) => item.id === id ? { ...item, state: "paused" } : item));
  }

  function resumePausedUpload(id) {
    const item = uploads.find((candidate) => candidate.id === id);
    if (!item?.file) {
      chooseResume(id);
      return;
    }
    setUploads((current) => current.map((candidate) => candidate.id === id ? { ...candidate, state: "uploading", error: null } : candidate));
    startUpload(id, item.file);
  }

  function chooseResume(id) {
    setResumeTargetId(id);
    setResumeFile(null);
    setIsResumeOpen(true);
  }

  function resumeSelected() {
    const id = resumeTargetId;
    const file = resumeFile;
    if (!id || !file) return;
    const item = uploads.find((candidate) => candidate.id === id);
    if (!item) return;
    if (file.name !== item.name || file.size !== item.sizeBytes || (item.lastModified !== null && file.lastModified !== item.lastModified)) {
      return;
    }
    setResumeTargetId(null);
    setIsResumeOpen(false);
    setResumeFile(null);
    setUploads((current) => current.map((candidate) => candidate.id === id ? { ...candidate, file, state: "uploading", error: null } : candidate));
    startUpload(id, file);
  }

  const resumeItem = uploads.find((item) => item.id === resumeTargetId) || null;
  const selectedFileMatches = Boolean(resumeItem && resumeFile && resumeFile.name === resumeItem.name && resumeFile.size === resumeItem.sizeBytes && (resumeItem.lastModified === null || resumeFile.lastModified === resumeItem.lastModified));

  function cancelUpload(id) {
    if (id === resumeTargetId) {
      setIsResumeOpen(false);
      setResumeTargetId(null);
      setResumeFile(null);
    }
    cancelledUploads.current.add(id);
    const handle = uploadHandles.current.get(id);
    handle?.abort();
    if (!handle) {
      const uploadId = uploads.find((item) => item.id === id)?.uploadId;
      if (uploadId) driveApi.cancelUpload(uploadId).catch(() => undefined);
    }
    uploadHandles.current.delete(id);
    setUploads((current) => current.filter((item) => item.id !== id));
  }

  return <><Dialog open={open} onOpenChange={handleOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Upload files</DialogTitle><DialogDescription>Drop files here or choose them from your device. Uploads continue while this dialog is open.</DialogDescription></DialogHeader>
    <input ref={inputRef} className="sr-only" type="file" multiple onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => queueFiles(event.target.files)} />
    <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); queueFiles(event.dataTransfer.files); }} className={cn("flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50", isDragging ? "border-primary bg-primary/5" : "bg-muted/30 hover:bg-muted/60")}>
      <span className="flex size-10 items-center justify-center rounded-lg bg-background shadow-xs"><UploadCloudIcon className="size-5 text-primary" /></span><span className="text-sm font-medium">Drop files to upload</span><span className="text-sm text-muted-foreground">or select files from your device</span><span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"><FileUpIcon className="size-4" />Choose files</span>
    </button>
    <AnimatePresence initial={false}>{uploads.length > 0 && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="flex max-h-52 flex-col gap-3 overflow-y-auto pr-1">
      {uploads.map((item) => <motion.div layout="position" className="rounded-lg border p-3" key={item.id}><div className="mb-2 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.file?.name || item.name}</span>{item.state === "uploading" && <Spinner />}{item.state === "complete" && <span className="text-xs text-primary">Uploaded</span>}{item.state === "paused" && <span className="text-xs text-muted-foreground">Paused</span>}{item.state === "needs-file" && <span className="text-xs text-muted-foreground">Choose file to resume</span>}{item.state === "error" && <span className="text-xs text-destructive">Failed</span>}{item.state === "uploading" && <Button variant="ghost" size="icon-sm" className="-mr-1 shrink-0" onClick={() => pauseUpload(item.id)} aria-label={`Pause ${item.name}`}><PauseIcon /></Button>}{item.state === "paused" && <Button variant="ghost" size="icon-sm" className="-mr-1 shrink-0" onClick={() => resumePausedUpload(item.id)} aria-label={`Resume ${item.name}`}><PlayIcon /></Button>}{item.state !== "complete" && <Button variant="ghost" size="icon-sm" className="-mr-1 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => cancelUpload(item.id)} aria-label={`Cancel ${item.name}`}><Trash2Icon /></Button>}{["needs-file", "error"].includes(item.state) && <Button variant="ghost" size="icon-sm" className="-mr-1 shrink-0" onClick={() => chooseResume(item.id)} aria-label={`Resume ${item.name}`}><PlayIcon /></Button>}</div><Progress value={item.progress} aria-label={`${item.file?.name || item.name} upload progress`} /><p className="mt-1 text-xs text-muted-foreground">{item.state === "error" ? item.error : `${item.progress}%`}</p></motion.div>)}
    </motion.div>}</AnimatePresence>
    <div className="flex justify-end"><Button variant="outline" onClick={() => handleOpenChange(false)}><XIcon data-icon="inline-start" />Done</Button></div>
  </DialogContent></Dialog>
  <Dialog open={isResumeOpen} onOpenChange={setIsResumeOpen}><DialogContent><DialogHeader><DialogTitle>Resume upload</DialogTitle><DialogDescription>Reselect the original file. Its name and byte size must match before the upload can continue.</DialogDescription></DialogHeader>{resumeItem && <div className="space-y-3"><div className="rounded-lg border bg-muted/30 p-3 text-sm"><p className="font-medium">{resumeItem.name}</p><p className="text-muted-foreground">Expected size: {resumeItem.sizeBytes.toLocaleString()} bytes</p>{resumeItem.lastModified !== null && <p className="text-muted-foreground">Original modified date will also be checked.</p>}</div><Input type="file" onChange={(event) => setResumeFile(event.target.files?.[0] || null)} /><p className={resumeFile && !selectedFileMatches ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{resumeFile ? selectedFileMatches ? `Selected file size matches. Ready to resume.` : `Selected file is ${resumeFile.size.toLocaleString()} bytes. This does not match the expected file.` : "Select the original file to resume uploading."}</p></div>}<DialogFooter><Button variant="outline" onClick={() => setIsResumeOpen(false)}>Cancel</Button><Button disabled={!selectedFileMatches} onClick={resumeSelected}><PlayIcon data-icon="inline-start" />Resume upload</Button></DialogFooter></DialogContent></Dialog></>;
}
