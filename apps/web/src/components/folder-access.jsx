"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, FolderIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { FileBrowser } from "@/components/drive/file-browser";
import { PreviewDialog } from "@/components/drive/file-dialogs";
import { Button } from "@/components/ui/button";
import { driveApi } from "@/lib/drive-api";

export function FolderAccess({ folder, accessId, isPrivate }) {
  const [parentId, setParentId] = useState(null);
  const [trail, setTrail] = useState([]);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [previewFile, setPreviewFile] = useState(null);
  const load = useCallback((nextParent = null) => {
    setStatus("loading");
    return (isPrivate ? driveApi.privateChildren(accessId, nextParent) : driveApi.publicChildren(accessId, nextParent))
      .then((nextItems) => {
        setItems(nextItems);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [accessId, isPrivate]);
  useEffect(() => {
    const timer = window.setTimeout(() => { load(parentId); });
    return () => window.clearTimeout(timer);
  }, [load, parentId]);
  const contentUrl = useCallback((item, download = false) => (
    isPrivate ? driveApi.privateNodeContentUrl(accessId, item.id, download) : driveApi.publicNodeContentUrl(accessId, item.id, download)
  ), [accessId, isPrivate]);
  const title = trail.at(-1)?.name || folder.name;
  const transitionKey = useMemo(() => `${accessId}-${parentId || folder.id}`, [accessId, folder.id, parentId]);
  function open(item) {
    if (item.type === "folder") {
      setTrail((current) => [...current, item]);
      setParentId(item.id);
      return;
    }
    setPreviewFile(item);
  }
  function back() {
    const nextTrail = trail.slice(0, -1);
    setTrail(nextTrail);
    setParentId(nextTrail.at(-1)?.id || null);
  }
  return <main className="min-h-svh bg-background"><header className="border-b bg-background/90 px-5 py-4 backdrop-blur-sm sm:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><Brand /><span className="text-sm text-muted-foreground">Read-only shared folder</span></div></header><section className="mx-auto max-w-6xl px-5 py-8 sm:px-8"><div className="mb-6 flex items-center gap-3">{trail.length > 0 && <Button variant="outline" size="icon-sm" onClick={back} aria-label="Back"><ChevronLeftIcon /></Button>}<FolderIcon className="size-6 text-primary" /><h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{title}</h1></div><FileBrowser files={items} isLoading={status === "loading"} isError={status === "error"} search="" view="list" transitionKey={transitionKey} onOpen={open} onDownload={() => undefined} onMove={() => undefined} onMoveToFolder={() => undefined} onRename={() => undefined} onShare={() => undefined} onDelete={() => undefined} onRestore={() => undefined} readOnly hideActions getContentUrl={contentUrl} getDownloadUrl={(item) => contentUrl(item, true)} emptyTitle="This folder is empty" emptyDescription="There are no items in this shared folder." onRetry={() => load(parentId)} /></section><PreviewDialog file={previewFile} files={items} onClose={() => setPreviewFile(null)} onSelect={setPreviewFile} getContentUrl={contentUrl} getDownloadUrl={(item) => contentUrl(item, true)} /></main>;
}
