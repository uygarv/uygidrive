"use client";

/* Crop previews use a local object URL, which Next's image optimizer cannot process. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRightIcon, AtSignIcon, MenuIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { toast } from "sonner";
import { ThemeMenu } from "@/components/theme-menu";
import { Navigation } from "@/components/drive/drive-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { IdentityAvatar } from "@/components/identity-avatar";
import { driveApi } from "@/lib/drive-api";
export { UsernameCompletionDialog } from "@/components/profile/username-completion-dialog";

const usernamePattern = /^[a-z0-9_]{3,20}$/;

function AvatarCropDialog({ source, onClose, onSave }) {
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const sourceUrl = useMemo(() => source ? URL.createObjectURL(source) : null, [source]);
  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);
  function pointerDown(event) { dragRef.current = { x: event.clientX, y: event.clientY, offset }; event.currentTarget.setPointerCapture?.(event.pointerId); }
  function pointerMove(event) { if (!dragRef.current) return; setOffset({ x: dragRef.current.offset.x + event.clientX - dragRef.current.x, y: dragRef.current.offset.y + event.clientY - dragRef.current.y }); }
  async function save() {
    const image = imageRef.current;
    if (!image?.naturalWidth) return;
    const target = 512;
    const viewport = 280;
    const scale = Math.max(viewport / image.naturalWidth, viewport / image.naturalHeight) * zoom;
    const displayedWidth = image.naturalWidth * scale;
    const displayedHeight = image.naturalHeight * scale;
    const left = (viewport - displayedWidth) / 2 + offset.x;
    const top = (viewport - displayedHeight) / 2 + offset.y;
    const sourceSize = viewport / scale;
    const sourceX = Math.max(0, Math.min(image.naturalWidth - sourceSize, -left / scale));
    const sourceY = Math.max(0, Math.min(image.naturalHeight - sourceSize, -top / scale));
    const canvas = document.createElement("canvas");
    canvas.width = target; canvas.height = target;
    canvas.getContext("2d")?.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, target, target);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    if (!blob) return;
    setIsSaving(true);
    try { await onSave(blob); } finally { setIsSaving(false); }
  }
  return <Dialog open={Boolean(source)} onOpenChange={(open) => !open && onClose()}><DialogContent showCloseButton={!isSaving}><DialogHeader><DialogTitle>Crop profile photo</DialogTitle><DialogDescription>Drag to position the image, then zoom to frame your photo.</DialogDescription></DialogHeader><div className="mx-auto size-[280px] touch-none overflow-hidden rounded-full bg-muted" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { dragRef.current = null; }}><img ref={imageRef} src={sourceUrl || undefined} alt="Crop preview" draggable={false} className="pointer-events-none h-full w-full max-w-none object-cover" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }} /></div><Field><FieldLabel>Zoom</FieldLabel><Slider value={zoom} min={1} max={3} step={0.01} onValueChange={setZoom} ariaLabel="Profile photo zoom" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>Cancel</Button><Button type="button" disabled={isSaving} onClick={save}>{isSaving && <Spinner data-icon="inline-start" />}Use photo</Button></div></DialogContent></Dialog>;
}

export function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const [isAvatarUpdating, setIsAvatarUpdating] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const sessionQuery = useQuery({ queryKey: ["auth-session"], queryFn: () => driveApi.getSession(), retry: false });
  const storageQuery = useQuery({ queryKey: ["storage-usage"], queryFn: () => driveApi.getStorageUsage(), enabled: sessionQuery.isSuccess && !sessionQuery.data?.user?.needsUsername });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => driveApi.getProfile(), retry: false });

  useEffect(() => {
    if (profileQuery.isError && profileQuery.error?.code === "UNAUTHENTICATED") router.replace("/login");
  }, [profileQuery.error?.code, profileQuery.isError, router]);
  async function save(event) {
    event.preventDefault();
    const value = (usernameEdited ? username : profileQuery.data?.profile?.username || "").trim().toLowerCase();
    if (!usernamePattern.test(value)) {
      setError("Use 3–20 lowercase letters, numbers, or underscores.");
      return;
    }
    if (value === (profileQuery.data?.profile?.username || "").toLowerCase()) return;
    setError("");
    try {
      setIsSaving(true);
      await driveApi.updateProfile(value);
      await profileQuery.refetch();
      setUsernameEdited(false);
      queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      toast.success("Username updated");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t save your username.");
    } finally {
      setIsSaving(false);
    }
  }

  const profile = profileQuery.data?.profile;
  const displayedUsername = usernameEdited ? username : profile?.username || "";
  const hasUsernameChange = usernameEdited && displayedUsername.trim().toLowerCase() !== (profile?.username || "").toLowerCase();
  const signOut = useCallback(async () => {
    await driveApi.signOut();
    queryClient.clear();
    router.replace("/login");
  }, [queryClient, router]);
  const changeSection = useCallback((section) => {
    setIsMobileNavOpen(false);
    router.push(section === "trash" ? "/trash" : section === "shared" ? "/shared" : "/drive");
  }, [router]);
  const navigationProps = {
    onUpload: () => router.push("/drive"),
    onFolder: () => router.push("/drive"),
    onSignOut: signOut,
    onProfile: () => undefined,
    storage: storageQuery.data,
    storageIsError: storageQuery.isError,
    username: sessionQuery.data?.user?.username,
    email: sessionQuery.data?.user?.email,
    avatarUrl: sessionQuery.data?.user?.avatarUrl,
    userIsLoading: sessionQuery.isPending,
    activeSection: "profile",
    onSectionChange: changeSection,
    showContentActions: false,
  };
  return <div className="min-h-svh bg-background md:flex">
    <motion.aside initial={false} animate={{ width: isSidebarCollapsed ? 0 : 272, opacity: isSidebarCollapsed ? 0 : 1 }} transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }} className="hidden h-svh shrink-0 overflow-hidden border-r bg-sidebar/85 md:sticky md:top-0 md:flex md:flex-col"><div className="h-full w-[17rem] p-3"><Navigation {...navigationProps} /></div></motion.aside>
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/65 sm:px-6">
        <Button className="hidden md:inline-flex" variant="ghost" size="icon" onClick={() => setIsSidebarCollapsed((current) => !current)} aria-label={isSidebarCollapsed ? "Open sidebar" : "Close sidebar"} title={isSidebarCollapsed ? "Open sidebar" : "Close sidebar"}>{isSidebarCollapsed ? <PanelLeftOpenIcon className="size-5" /> : <PanelLeftCloseIcon className="size-5" />}</Button>
        <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}><SheetTrigger render={<Button className="md:hidden" variant="ghost" size="icon-sm" aria-label="Open navigation" />}><MenuIcon /></SheetTrigger><SheetContent side="left"><SheetHeader className="sr-only"><SheetTitle>Drive navigation</SheetTitle></SheetHeader><div className="min-h-0 flex-1 p-3"><Navigation {...navigationProps} compact /></div></SheetContent></Sheet>
        <div className="ml-auto"><ThemeMenu /></div>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 sm:p-6 lg:p-8">
        <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="w-full max-w-xl">
          <div className="mb-5"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1><p className="mt-1 text-sm text-muted-foreground">Manage the identity people see when you share and collaborate.</p></div>
          <Card className="shadow-sm"><CardContent className="pt-0">
          {profileQuery.isPending ? <div className="flex min-h-32 items-center justify-center"><Spinner /></div> : <form onSubmit={save} noValidate><FieldGroup>
            <Field><FieldLabel>Profile photo</FieldLabel><div className="flex items-center gap-4"><IdentityAvatar user={profile} size="lg" /><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={isAvatarUpdating} onClick={() => document.getElementById("profile-avatar-file")?.click()}>Choose photo</Button>{profile?.avatarUrl && <Button type="button" variant="ghost" className="text-destructive" disabled={isAvatarUpdating} onClick={async () => { try { setIsAvatarUpdating(true); await driveApi.deleteAvatar(); await Promise.all([profileQuery.refetch(), queryClient.invalidateQueries({ queryKey: ["auth-session"] })]); toast.success("Profile photo removed"); } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Couldn’t remove profile photo."); } finally { setIsAvatarUpdating(false); } }}>Remove</Button>}<Input id="profile-avatar-file" type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) { toast.error("Choose an image smaller than 10 MB."); return; } setCropSource(file); }} /></div></div><FieldDescription>Choose a square crop. Photos are optimized and only visible to signed-in users.</FieldDescription></Field>
            <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="profile-username">Username</FieldLabel><div className="flex gap-2"><div className="relative min-w-0 flex-1"><AtSignIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="profile-username" value={displayedUsername} onChange={(event) => { setUsernameEdited(true); setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); }} className="pl-9" autoComplete="username" minLength={3} maxLength={20} required aria-invalid={Boolean(error)} /><span className="sr-only">Your username is shown with an at sign.</span></div><Button type="submit" disabled={isSaving || profileQuery.isPending || !hasUsernameChange}>{isSaving && <Spinner data-icon="inline-start" />}Update username</Button></div><FieldDescription>3–20 lowercase letters, numbers, or underscores.</FieldDescription>{error && <FieldError>{error}</FieldError>}</Field>
            <Field><FieldLabel>Email address</FieldLabel><Input value={profile?.email || ""} readOnly aria-label="Private account email" /><FieldDescription>Only visible to you.</FieldDescription></Field>
          </FieldGroup></form>}
          </CardContent></Card>
        </motion.div>
      </main>
    </div>
    <AvatarCropDialog source={cropSource} onClose={() => setCropSource(null)} onSave={async (blob) => { try { setIsAvatarUpdating(true); await driveApi.uploadAvatar(blob); await Promise.all([profileQuery.refetch(), queryClient.invalidateQueries({ queryKey: ["auth-session"] })]); toast.success("Profile photo updated"); setCropSource(null); } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Couldn’t update profile photo."); } finally { setIsAvatarUpdating(false); } }} />
  </div>;
}
