"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, AtSignIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { driveApi } from "@/lib/drive-api";

const usernamePattern = /^[a-z0-9_]{3,20}$/;

export function UsernameCompletionDialog({ open, onCompleted }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => driveApi.getProfile(), enabled: open, retry: false });
  async function save(event) {
    event.preventDefault();
    const value = username.trim().toLowerCase();
    if (!usernamePattern.test(value)) {
      setError("Use 3–20 lowercase letters, numbers, or underscores.");
      return;
    }
    setError("");
    try {
      setIsSaving(true);
      await driveApi.updateProfile(value);
      toast.success("Username saved");
      onCompleted?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t save your username.");
    } finally {
      setIsSaving(false);
    }
  }
  return <Dialog open={open} onOpenChange={() => undefined}><DialogContent showCloseButton={false} className="sm:max-w-md"><DialogHeader><DialogTitle>Choose your username</DialogTitle><DialogDescription>Choose the name people will see when you share and collaborate.</DialogDescription></DialogHeader>{profileQuery.isPending ? <div className="flex min-h-28 items-center justify-center"><Spinner /></div> : <form onSubmit={save} noValidate><FieldGroup><Field data-invalid={Boolean(error)}><FieldLabel htmlFor="completion-username">Username</FieldLabel><div className="relative"><AtSignIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="completion-username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} className="pl-9" autoComplete="username" minLength={3} maxLength={20} required aria-invalid={Boolean(error)} autoFocus /></div><FieldDescription>3–20 lowercase letters, numbers, or underscores.</FieldDescription></Field><Field><FieldLabel>Email address</FieldLabel><Input value={profileQuery.data?.profile?.email || ""} readOnly aria-label="Private account email" /><FieldDescription>This is private and visible only to you.</FieldDescription></Field>{error && <FieldError>{error}</FieldError>}<Field><Button type="submit" size="lg" disabled={isSaving || profileQuery.isPending}>{isSaving && <Spinner data-icon="inline-start" />}Continue<ArrowRightIcon data-icon="inline-end" /></Button></Field></FieldGroup></form>}</DialogContent></Dialog>;
}
