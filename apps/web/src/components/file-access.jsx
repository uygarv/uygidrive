"use client";
/* eslint-disable @next/next/no-img-element -- public/private API streams are dynamic external URLs. */

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { DownloadIcon, FileIcon, LockKeyholeIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeMenu } from "@/components/theme-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { previewKind } from "@/lib/drive-utils";

export function FileAccess({ fileName, url, isPrivate }) {
  const reduceMotion = useReducedMotion();
  const kind = previewKind(fileName);
  const viewer = kind === "image" ? <img className="max-h-[60svh] w-full object-contain" src={url} alt={fileName} /> : kind === "video" ? <video className="max-h-[60svh] w-full" controls src={url} /> : kind === "audio" ? <audio className="w-full" controls src={url} /> : kind === "embed" ? <iframe title={fileName} className="h-[55svh] w-full rounded-lg border" src={url} /> : <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center"><FileIcon className="size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">This file is ready to download.</p></div>;
  return <div className="min-h-svh bg-muted/30"><header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8"><Brand /><ThemeMenu /></header><main className="mx-auto flex max-w-5xl justify-center px-5 py-10 sm:px-8"><motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.22 }} className="w-full max-w-3xl"><Card className="shadow-sm"><CardHeader><div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileIcon className="size-5" /></span><div className="min-w-0 flex-1"><CardTitle className="truncate">{fileName}</CardTitle><CardDescription className="mt-1 flex items-center gap-2">{isPrivate ? <><LockKeyholeIcon className="size-3.5" />Private link</> : "Shared file"}</CardDescription></div><Badge variant="secondary">{isPrivate ? "Private" : "Public"}</Badge></div></CardHeader><CardContent>{viewer}</CardContent><CardFooter><Button nativeButton={false} variant="outline" render={<a href={`${url}${url.includes("?") ? "&" : "?"}download=true`} />}><DownloadIcon data-icon="inline-start" />Download</Button><Button nativeButton={false} variant="ghost" render={<Link href="/" />}>Open UygiDrive</Button></CardFooter></Card></motion.div></main></div>;
}
