"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileUpIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { driveApi } from "@/lib/drive-api";
import { cn } from "@/lib/utils";

export function UploadDialog({ open, onOpenChange, parentId, onComplete, onUploadsChange }) {
  const inputRef = useRef(null);
  const uploadHandles = useRef(new Map());
  const cancelledUploads = useRef(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState([]);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    onUploadsChange?.(uploads);
  }, [onUploadsChange, uploads]);

  function handleOpenChange(nextOpen) {
    if (!nextOpen) setUploads((current) => current.filter((item) => item.state !== "complete"));
    onOpenChange(nextOpen);
  }

  function queueFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const queued = files.map((file) => ({ id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`, file, progress: 0, state: "uploading" }));
    setUploads((current) => [...current, ...queued]);
    queued.forEach(({ id, file }) => {
      const handle = driveApi.upload(file, parentId, (progress) => setUploads((current) => current.map((item) => item.id === id ? { ...item, progress } : item)));
      uploadHandles.current.set(id, handle);
      const { upload } = handle;
      upload.then(() => {
        uploadHandles.current.delete(id);
        setUploads((current) => current.map((item) => item.id === id ? { ...item, progress: 100, state: "complete" } : item));
        onComplete?.();
      }).catch((error) => {
        uploadHandles.current.delete(id);
        if (cancelledUploads.current.delete(id)) return;
        setUploads((current) => current.map((item) => item.id === id ? { ...item, state: "error", error: error.message } : item));
      });
    });
  }

  function cancelUpload(id) {
    cancelledUploads.current.add(id);
    uploadHandles.current.get(id)?.abort();
    uploadHandles.current.delete(id);
    setUploads((current) => current.filter((item) => item.id !== id));
  }

  return <Dialog open={open} onOpenChange={handleOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Upload files</DialogTitle><DialogDescription>Drop files here or choose them from your device. Uploads continue while this dialog is open.</DialogDescription></DialogHeader>
    <input ref={inputRef} className="sr-only" type="file" multiple onChange={(event) => queueFiles(event.target.files)} />
    <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); queueFiles(event.dataTransfer.files); }} className={cn("flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50", isDragging ? "border-primary bg-primary/5" : "bg-muted/30 hover:bg-muted/60")}>
      <span className="flex size-10 items-center justify-center rounded-lg bg-background shadow-xs"><UploadCloudIcon className="size-5 text-primary" /></span><span className="text-sm font-medium">Drop files to upload</span><span className="text-sm text-muted-foreground">or select files from your device</span><span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"><FileUpIcon className="size-4" />Choose files</span>
    </button>
    <AnimatePresence initial={false}>{uploads.length > 0 && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="flex max-h-52 flex-col gap-3 overflow-y-auto pr-1">
      {uploads.map((item) => <motion.div layout="position" className="rounded-lg border p-3" key={item.id}><div className="mb-2 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.file.name}</span>{item.state === "uploading" && <Spinner />}{item.state === "complete" && <span className="text-xs text-primary">Uploaded</span>}{item.state === "error" && <span className="text-xs text-destructive">Failed</span>}{item.state === "uploading" && <Button variant="ghost" size="sm" className="-mr-1 h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive" onClick={() => cancelUpload(item.id)}>Cancel</Button>}</div><Progress value={item.progress} aria-label={`${item.file.name} upload progress`} /><p className="mt-1 text-xs text-muted-foreground">{item.state === "error" ? item.error : `${item.progress}%`}</p></motion.div>)}
    </motion.div>}</AnimatePresence>
    <div className="flex justify-end"><Button variant="outline" onClick={() => handleOpenChange(false)}><XIcon data-icon="inline-start" />Done</Button></div>
  </DialogContent></Dialog>;
}
