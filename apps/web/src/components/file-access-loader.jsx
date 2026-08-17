"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";
import { FileAccess } from "@/components/file-access";
import { FolderAccess } from "@/components/folder-access";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { driveApi } from "@/lib/drive-api";

export function FileAccessLoader({ type, accessId }) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  useEffect(() => {
    let active = true;
    const load = type === "public" ? driveApi.publicInfo(accessId) : driveApi.privateInfo(accessId);
    load.then((data) => {
      if (!active) return;
      const record = type === "public" ? driveApi.recordPublicOpen(accessId) : driveApi.recordPrivateOpen(accessId);
      record.catch(() => undefined);
      setState({ status: "ready", data, error: "" });
    }).catch((error) => active && setState({ status: "error", data: null, error: error.message }));
    return () => { active = false; };
  }, [accessId, type]);

  if (state.status === "ready") {
    const url = type === "public" ? driveApi.publicContentUrl(accessId) : driveApi.privateContentUrl(accessId);
    if (state.data.item.kind === "folder") return <FolderAccess folder={state.data.item} accessId={accessId} isPrivate={type === "private"} />;
    return <FileAccess fileName={state.data.item.name} url={url} isPrivate={type === "private"} />;
  }

  return <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 p-6"><Brand /><div className="max-w-sm text-center">{state.status === "loading" ? <><LoaderCircleIcon className="mx-auto size-7 animate-spin text-primary" /><h1 className="mt-4 text-lg font-semibold">Opening shared file</h1><p className="mt-1 text-sm text-muted-foreground">Checking the link and preparing the file.</p></> : <><AlertCircleIcon className="mx-auto size-7 text-destructive" /><h1 className="mt-4 text-lg font-semibold">This link isn’t available</h1><p className="mt-1 text-sm text-muted-foreground">{state.error || "It may have expired, been revoked, or no longer exist."}</p><Button className="mt-5" variant="outline" render={<Link href="/" />}>Open UygiDrive</Button></>}</div></main>;
}
