"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  EllipsisVerticalIcon,
  FilesIcon,
  FolderPlusIcon,
  Grid2X2Icon,
  HardDriveIcon,
  LayoutListIcon,
  LogOutIcon,
  MenuIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  CheckIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Brand } from "@/components/brand";
import { ThemeMenu } from "@/components/theme-menu";
import { FileBrowser } from "@/components/drive/file-browser";
import {
  DeleteDialog,
  FolderDialog,
  MoveDialog,
  PreviewDialog,
  RenameDialog,
  ShareDialog,
} from "@/components/drive/file-dialogs";
import { UploadDialog } from "@/components/drive/upload-dialog";
import { driveApi } from "@/lib/drive-api";
import { errorMessage } from "@/lib/drive-utils";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 24;
const sortOptions = [
  ["date:new-first", "Newest first"],
  ["date:old-first", "Oldest first"],
  ["size:largest-first", "Largest first"],
  ["size:smallest-first", "Smallest first"],
];
const rootBreadcrumb = { id: "drive-root", name: "My Drive" };
const trashBreadcrumb = { id: "trash-root", name: "Trash" };

function initials(value) {
  return value ? value.slice(0, 2).toUpperCase() : "UD";
}
function optionLabel(options, value) {
  return options.find(([option]) => option === value)?.[1] || value;
}

function StorageUsage({ storage, isError = false }) {
  if (!storage && !isError) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading storage usage"
        className="rounded-xl border bg-background/80 p-3 shadow-xs"
      >
        <span className="sr-only">Loading storage usage</span>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-14" />
        </div>
        <Skeleton className="mt-1.5 h-4 w-36" />
        <Skeleton className="mt-3 h-2 w-full rounded-full" />
      </section>
    );
  }

  const percent = Math.min(100, storage?.percentUsed || 0);
  const usage = storage
    ? `${storage.usedDisplay} used${storage.isUnlimited ? "" : ` of ${storage.limitDisplay}`}`
    : isError
      ? "Storage usage is unavailable"
      : "Storage usage is unavailable";
  return (
    <section
      aria-label="Storage usage"
      className="rounded-xl border bg-background/80 p-3 shadow-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <HardDriveIcon className="size-3.5 text-primary" />
          Storage
        </span>
        <Badge variant="secondary" className="shrink-0 text-[11px]">
          {storage?.isUnlimited
            ? "Unlimited"
            : isError
              ? "Unavailable"
              : `${percent}% used`}
        </Badge>
      </div>
      <p
        className="mt-1.5 truncate text-xs text-muted-foreground"
        title={usage}
      >
        {usage}
      </p>
      <Progress className="mt-3" value={percent}>
        <ProgressLabel className="sr-only">Storage used</ProgressLabel>
        <ProgressValue className="sr-only" />
      </Progress>
    </section>
  );
}

function AccountDetailsSkeleton() {
  const shimmer =
    "relative overflow-hidden bg-muted after:absolute after:inset-0 after:animate-[shimmer_1.45s_ease-in-out_infinite] after:bg-[linear-gradient(105deg,transparent_35%,color-mix(in_oklch,var(--background)_72%,transparent)_50%,transparent_65%)]";
  return (
    <div
      className="flex h-[52px] w-full items-center gap-2 px-2 py-2"
      aria-busy="true"
      aria-label="Loading account details"
    >
      <span className={`${shimmer} size-8 shrink-0 rounded-full border border-border`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0">
        <span className={`${shimmer} h-5 w-20 rounded-md`} />
        <span className={`${shimmer} h-4 w-32 max-w-full rounded-md`} />
      </span>
      <span className={`${shimmer} size-4 shrink-0 rounded-md`} />
    </div>
  );
}

function AccountMenu({ email, isLoading, onSignOut, side = "right" }) {
  const displayName = email?.split("@")[0] || "";
  if (isLoading) return <AccountDetailsSkeleton />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-auto w-full justify-start gap-2 px-2 py-2 text-left"
          />
        }
      >
        <Avatar>
          <AvatarFallback>{initials(email)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {displayName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {email}
          </span>
        </span>
        <EllipsisVerticalIcon className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="center" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={onSignOut}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Navigation({
  onUpload,
  onFolder,
  onSignOut,
  storage,
  storageIsError,
  userEmail,
  userIsLoading,
  activeSection,
  onSectionChange,
  compact = false,
}) {
  const isTrash = activeSection === "trash";
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Brand className="px-2 py-1" href="/drive" />
      <div className="flex flex-col gap-2 px-1">
        <Button size={compact ? "default" : "lg"} onClick={onUpload}>
          <UploadIcon data-icon="inline-start" />
          Upload files
        </Button>
        <Button
          variant="outline"
          size={compact ? "default" : "lg"}
          onClick={onFolder}
        >
          <FolderPlusIcon data-icon="inline-start" />
          New folder
        </Button>
      </div>
      <Separator />
      <nav aria-label="Drive navigation" className="flex flex-col gap-1">
        <Button
          variant="ghost"
          className={cn("justify-start gap-2 px-2.5", !isTrash && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
          onClick={() => onSectionChange("drive")}
        >
          <FilesIcon className="size-4" />
          My Drive
        </Button>
        <Button
          variant="ghost"
          className={cn("justify-start gap-2 px-2.5", isTrash && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
          onClick={() => onSectionChange("trash")}
        >
          <Trash2Icon className="size-4" />
          Trash
        </Button>
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <StorageUsage storage={storage} isError={storageIsError} />
        <Separator />
        <AccountMenu
          email={userEmail}
          isLoading={userIsLoading}
          onSignOut={onSignOut}
          side={compact ? "top" : "right"}
        />
      </div>
    </div>
  );
}

function FilePagination({ page, hasNext, isPending, onPrevious, onNext }) {
  if (page === 1 && !hasNext) return null;
  const previousDisabled = page === 1 || isPending;
  const nextDisabled = !hasNext || isPending;
  function linkAction(action, disabled) {
    return (event) => {
      event.preventDefault();
      if (!disabled) action();
    };
  }
  return (
    <Pagination className="justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={linkAction(onPrevious, previousDisabled)}
            aria-disabled={previousDisabled}
            tabIndex={previousDisabled ? -1 : undefined}
            className={
              previousDisabled ? "pointer-events-none opacity-50" : undefined
            }
          />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink
            href="#"
            isActive
            onClick={(event) => event.preventDefault()}
            aria-label={`Page ${page}`}
          >
            {page}
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={linkAction(onNext, nextDisabled)}
            aria-disabled={nextDisabled}
            tabIndex={nextDisabled ? -1 : undefined}
            className={
              nextDisabled ? "pointer-events-none opacity-50" : undefined
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function UploadStatusBadge({ status }) {
  return (
    <AnimatePresence initial={false} mode="wait">
      {status && (
        <motion.div
          key={status.state}
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.96 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <Badge variant="secondary" className="h-7 gap-1.5 px-2.5">
            {status.state === "uploading" ? (
              <>
                Uploading {status.count} {status.count === 1 ? "file" : "files"}…
                <Spinner data-icon="inline-end" className="size-3.5" />
              </>
            ) : (
              <>
                {status.count} {status.count === 1 ? "file" : "files"} uploaded
                <CheckIcon data-icon="inline-end" className="size-3.5 text-primary" />
              </>
            )}
          </Badge>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DriveWorkspace({ initialSection = "drive" }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const uploadNoticeTimer = useRef(null);
  const [folderId, setFolderId] = useState(null);
  const [activeSection, setActiveSection] = useState(initialSection);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState("date:new-first");
  const [view, setView] = useState("list");
  const [pagination, setPagination] = useState({ page: 0, cursors: [null] });
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [renameFile, setRenameFile] = useState(null);
  const [moveFile, setMoveFile] = useState(null);
  const [draggedFile, setDraggedFile] = useState(null);
  const [breadcrumbDropId, setBreadcrumbDropId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [uploadNotice, setUploadNotice] = useState(null);

  useEffect(() => () => window.clearTimeout(uploadNoticeTimer.current), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPagination({ page: 0, cursors: [null] });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("uygidrive-view");
      if (saved === "list" || saved === "grid") setView(saved);
    });
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    function syncSectionFromLocation() {
      const nextSection = window.location.pathname === "/trash" ? "trash" : "drive";
      setActiveSection(nextSection);
      setFolderId(null);
      setBreadcrumbs([]);
      setSearch("");
      setDebouncedSearch("");
      resetPagination();
    }
    window.addEventListener("popstate", syncSectionFromLocation);
    return () => window.removeEventListener("popstate", syncSectionFromLocation);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("uygidrive-sidebar-collapsed");
      setIsSidebarCollapsed(saved === "true");
    });
    return () => window.clearTimeout(timer);
  }, []);

  function toggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("uygidrive-sidebar-collapsed", String(next));
      return next;
    });
  }

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => driveApi.getSession(),
    retry: false,
  });
  const storageQuery = useQuery({
    queryKey: ["storage-usage"],
    queryFn: () => driveApi.getStorageUsage(),
    enabled: sessionQuery.isSuccess,
  });
  useEffect(() => {
    if (sessionQuery.isError && sessionQuery.error?.code === "UNAUTHENTICATED")
      router.replace("/login");
  }, [router, sessionQuery.error?.code, sessionQuery.isError]);

  function resetPagination() {
    setPagination({ page: 0, cursors: [null] });
  }
  const updateUploadNotice = useCallback((uploads) => {
    const uploading = uploads.filter((item) => item.state === "uploading").length;
    if (uploading) {
      window.clearTimeout(uploadNoticeTimer.current);
      setUploadNotice({ state: "uploading", count: uploading });
      return;
    }
    const completed = uploads.filter((item) => item.state === "complete").length;
    if (!completed) return;
    window.clearTimeout(uploadNoticeTimer.current);
    setUploadNotice({ state: "complete", count: completed });
    uploadNoticeTimer.current = window.setTimeout(() => setUploadNotice(null), 3600);
  }, []);
  function selectSection(section) {
    if (section === activeSection) return;
    setActiveSection(section);
    setFolderId(null);
    setBreadcrumbs([]);
    setSearch("");
    setDebouncedSearch("");
    resetPagination();
    setIsMobileNavOpen(false);
    window.history.pushState(null, "", section === "trash" ? "/trash" : "/drive");
  }
  function changeView(nextView) {
    setView(nextView);
    window.localStorage.setItem("uygidrive-view", nextView);
  }
  const cursor = pagination.cursors[pagination.page] || null;
  const isTrash = activeSection === "trash";
  const rawFilesQuery = useQuery({
    queryKey: isTrash
      ? ["drive-trash", cursor]
      : ["drive-list", folderId, debouncedSearch, sort, cursor],
    queryFn: () => isTrash
      ? driveApi.listTrash({ pageSize: PAGE_SIZE, cursor })
      : driveApi.list({
          parentId: folderId,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
          sort,
          cursor,
        }),
    enabled: sessionQuery.isSuccess,
  });
  const filesQuery = {
    ...rawFilesQuery,
    isLoading:
      sessionQuery.isPending ||
      (sessionQuery.isSuccess && rawFilesQuery.isPending),
  };
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["drive-list"] });
    queryClient.invalidateQueries({ queryKey: ["drive-trash"] });
    queryClient.invalidateQueries({ queryKey: ["storage-usage"] });
  };

  const createFolder = useMutation({
    mutationFn: (name) => driveApi.createFolder(name, folderId),
    onSuccess: () => {
      resetPagination();
      refresh();
      toast.success("Folder created");
    },
    onError: (error) =>
      toast.error("Couldn’t create folder", {
        description: errorMessage(error),
      }),
  });
  const rename = useMutation({
    mutationFn: ({ file, name }) => driveApi.rename(file.id, name),
    onSuccess: () => {
      refresh();
      toast.success("Name updated");
    },
    onError: (error) =>
      toast.error("Couldn’t rename file", { description: errorMessage(error) }),
  });
  const move = useMutation({
    mutationFn: ({ file, parentId }) => driveApi.move(file.id, parentId),
    onSuccess: (_item, { file }) => {
      resetPagination();
      refresh();
      toast.success(`${file.name} moved`);
    },
    onError: (error) =>
      toast.error("Couldn’t move item", { description: errorMessage(error) }),
  });
  const remove = useMutation({
    mutationFn: ({ file, permanent }) => permanent ? driveApi.delete(file.id) : driveApi.moveToTrash(file.id),
    onSuccess: (_result, { permanent }) => {
      resetPagination();
      refresh();
      toast.success(permanent ? "Item deleted permanently" : "Moved to Trash");
    },
    onError: (error) =>
      toast.error("Couldn’t delete item", { description: errorMessage(error) }),
  });
  const restore = useMutation({
    mutationFn: (file) => driveApi.restore(file.id),
    onSuccess: () => {
      resetPagination();
      refresh();
      toast.success("Item restored");
    },
    onError: (error) =>
      toast.error("Couldn’t restore item", { description: errorMessage(error) }),
  });

  function changeSort(nextSort) {
    setSort(nextSort);
    resetPagination();
  }
  function openFile(file) {
    if (isTrash) return;
    if (file.type === "folder") {
      setFolderId(file.id);
      setBreadcrumbs((current) => [...current, file]);
      setSearch("");
      setDebouncedSearch("");
      resetPagination();
    } else setPreviewFile(file);
  }
  function openPath(index) {
    if (isTrash) return;
    const nextCrumbs = index < 0 ? [] : breadcrumbs.slice(0, index + 1);
    setFolderId(index < 0 ? null : nextCrumbs.at(-1)?.id || null);
    setBreadcrumbs(nextCrumbs);
    setSearch("");
    setDebouncedSearch("");
    resetPagination();
  }
  function breadcrumbDestination(crumb) {
    return crumb.id === rootBreadcrumb.id ? null : crumb.id;
  }
  function canDropOnBreadcrumb(crumb) {
    const destinationId = breadcrumbDestination(crumb);
    return Boolean(!isTrash && draggedFile && destinationId !== draggedFile.parentId && destinationId !== draggedFile.id);
  }
  function dropOnBreadcrumb(event, crumb) {
    if (!canDropOnBreadcrumb(crumb) || !draggedFile) return;
    event.preventDefault();
    const movingFile = draggedFile;
    setDraggedFile(null);
    setBreadcrumbDropId(null);
    Promise.resolve(move.mutateAsync({ file: movingFile, parentId: breadcrumbDestination(crumb) })).catch(() => undefined);
  }
  function nextPage() {
    const nextCursor = filesQuery.data?.nextCursor;
    if (!nextCursor) return;
    setPagination((current) => ({
      page: current.page + 1,
      cursors: [...current.cursors.slice(0, current.page + 1), nextCursor],
    }));
  }
  function previousPage() {
    setPagination((current) => ({
      ...current,
      page: Math.max(0, current.page - 1),
    }));
  }
  async function signOut() {
    try {
      await driveApi.logout();
    } finally {
      router.push("/");
    }
  }
  function downloadFile(file) {
    const link = document.createElement("a");
    link.href = driveApi.downloadUrl(file.id);
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
  }

  const navigationProps = {
    storage: storageQuery.data,
    storageIsError: storageQuery.isError,
    userEmail: sessionQuery.data?.user?.email,
    userIsLoading: sessionQuery.isPending,
    onSignOut: signOut,
    activeSection,
    onSectionChange: selectSection,
  };
  const pathBreadcrumbs = isTrash
    ? [trashBreadcrumb]
    : [rootBreadcrumb, ...breadcrumbs];
  const files = isTrash && debouncedSearch
    ? (filesQuery.data?.files || []).filter((file) =>
        file.name.toLocaleLowerCase().includes(debouncedSearch.toLocaleLowerCase()),
      )
    : filesQuery.data?.files || [];
  return (
    <div className="min-h-svh bg-background md:flex">
      <AnimatePresence initial={false}>
        {!isSidebarCollapsed && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            className="hidden h-svh shrink-0 overflow-hidden border-r bg-sidebar/85 md:sticky md:top-0 md:flex md:flex-col"
          >
            <div className="h-full w-[17rem] p-3">
              <Navigation
                {...navigationProps}
                onUpload={() => setIsUploadOpen(true)}
                onFolder={() => setIsFolderOpen(true)}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/65 sm:px-6">
          <Button
            className="hidden md:inline-flex"
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label={isSidebarCollapsed ? "Open sidebar" : "Close sidebar"}
            title={isSidebarCollapsed ? "Open sidebar" : "Close sidebar"}
          >
            {isSidebarCollapsed ? <PanelLeftOpenIcon className="size-5" /> : <PanelLeftCloseIcon className="size-5" />}
          </Button>
          <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
            <SheetTrigger
              render={
                <Button
                  className="md:hidden"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open navigation"
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader className="sr-only">
                <SheetTitle>Drive navigation</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 p-3">
                <Navigation
                  {...navigationProps}
                  compact
                  onUpload={() => {
                    setIsMobileNavOpen(false);
                    setIsUploadOpen(true);
                  }}
                  onFolder={() => {
                    setIsMobileNavOpen(false);
                    setIsFolderOpen(true);
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>
          <div className="ml-auto flex items-center gap-2">
            <UploadStatusBadge status={uploadNotice} />
            <ThemeMenu />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="min-h-12 max-w-full overflow-hidden">
                  <AnimatePresence initial={false} mode="wait">
                    <motion.div
                      key={activeSection}
                      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: reduceMotion ? 0 : 5 }}
                      transition={{ duration: reduceMotion ? 0 : 0.11, ease: "easeOut" }}
                    >
                      <Breadcrumb>
                        <BreadcrumbList className="h-12 flex-nowrap gap-0 overflow-x-auto text-2xl font-semibold text-foreground sm:text-3xl">
                          <AnimatePresence initial={false}>
                        {pathBreadcrumbs.flatMap((crumb, index) => [
                          ...(index > 0
                            ? [
                                <BreadcrumbSeparator
                                  key={`${crumb.id}-separator`}
                                  className="size-12 self-center justify-center [&>svg]:size-6"
                                  render={
                                    <motion.li
                                      layout="position"
                                      initial={{ opacity: 0, x: reduceMotion ? 0 : -5 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      exit={{
                                        opacity: 0,
                                        x: reduceMotion ? 0 : -5,
                                        transition: {
                                          duration: reduceMotion ? 0 : 0.14,
                                          delay: reduceMotion ? 0 : 0.055,
                                        },
                                      }}
                                      transition={{ duration: reduceMotion ? 0 : 0.14 }}
                                    />
                                  }
                                />,
                              ]
                            : []),
                          <BreadcrumbItem
                            key={crumb.id}
                            className="h-12 self-center"
                            render={
                              <motion.li
                                layout="position"
                                initial={{ opacity: 0, x: reduceMotion ? 0 : -5 }}
                                animate={{
                                  opacity: 1,
                                  x: 0,
                                  y: 0,
                                  transition: {
                                    duration: reduceMotion ? 0 : 0.14,
                                    delay: index > 0 && !reduceMotion ? 0.055 : 0,
                                  },
                                }}
                                exit={{
                                  opacity: 0,
                                  x: reduceMotion ? 0 : -5,
                                  transition: { duration: reduceMotion ? 0 : 0.14 },
                                }}
                              />
                            }
                          >
                            <BreadcrumbLink
                              className={cn(
                                "flex h-full items-center rounded-md text-foreground/85 transition-colors",
                                breadcrumbDropId === crumb.id && "bg-primary/10 px-2 text-primary",
                              )}
                              render={
                                <button
                                  type="button"
                                  onClick={() => openPath(index - 1)}
                                  onDragOver={(event) => {
                                    if (!canDropOnBreadcrumb(crumb)) return;
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                    setBreadcrumbDropId(crumb.id);
                                  }}
                                  onDragLeave={(event) => {
                                    if (event.currentTarget.contains(event.relatedTarget)) return;
                                    if (breadcrumbDropId === crumb.id) setBreadcrumbDropId(null);
                                  }}
                                  onDrop={(event) => dropOnBreadcrumb(event, crumb)}
                                />
                              }
                            >
                              {crumb.name}
                            </BreadcrumbLink>
                          </BreadcrumbItem>,
                        ])}
                          </AnimatePresence>
                        </BreadcrumbList>
                      </Breadcrumb>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="sm:hidden"
                  onClick={() => setIsUploadOpen(true)}
                >
                  <UploadIcon data-icon="inline-start" />
                  Upload
                </Button>
                <Button
                  className="sm:hidden"
                  variant="outline"
                  onClick={() => setIsFolderOpen(true)}
                >
                  <FolderPlusIcon data-icon="inline-start" />
                  New folder
                </Button>
                <Button
                  className="hidden sm:inline-flex"
                  onClick={() => setIsUploadOpen(true)}
                >
                  <UploadIcon data-icon="inline-start" />
                  Upload
                </Button>
                <Button
                  className="hidden sm:inline-flex"
                  variant="outline"
                  onClick={() => setIsFolderOpen(true)}
                >
                  <FolderPlusIcon data-icon="inline-start" />
                  New folder
                </Button>
              </div>
            </div>
          </motion.div>
          <section aria-label="File browser" className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <InputGroup>
                <InputGroupInput
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={isTrash ? "Search Trash" : "Search this folder"}
                  aria-label={isTrash ? "Search Trash" : "Search this folder"}
                />
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
              </InputGroup>
              <div className="flex gap-2">
                {!isTrash && <Select value={sort} onValueChange={changeSort}>
                  <SelectTrigger aria-label="Sort files">
                    <span className="flex flex-1 truncate text-left">
                      {optionLabel(sortOptions, sort)}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {sortOptions.map(([value, label]) => (
                        <SelectItem value={value} key={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>}
                <ToggleGroup
                  value={view}
                  onValueChange={(value) => {
                    const nextView = Array.isArray(value)
                      ? value.at(-1)
                      : value;
                    if (nextView) changeView(nextView);
                  }}
                  spacing={0}
                  variant="outline"
                  aria-label="File view"
                >
                  <ToggleGroupItem value="list" aria-label="List view">
                    <LayoutListIcon />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="grid" aria-label="Grid view">
                    <Grid2X2Icon />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            <FileBrowser
              files={files}
              isLoading={filesQuery.isLoading}
              isError={filesQuery.isError}
              search={debouncedSearch}
              view={view}
              transitionKey={isTrash ? "trash" : folderId || "root"}
              onOpen={openFile}
              onDownload={downloadFile}
              onMove={setMoveFile}
              onMoveToFolder={(file, parentId) =>
                move.mutateAsync({ file, parentId })
              }
              onItemDragStart={setDraggedFile}
              onItemDragEnd={() => {
                setDraggedFile(null);
                setBreadcrumbDropId(null);
              }}
              onRename={setRenameFile}
              onShare={setShareFile}
              onDelete={(file) => setDeleteTarget({ file, permanent: isTrash })}
              onRestore={(file) => restore.mutateAsync(file)}
              isTrash={isTrash}
              emptyTitle={isTrash ? "Trash is empty" : undefined}
              emptyDescription={isTrash ? "Items you delete stay here for 30 days." : undefined}
              onRetry={() => filesQuery.refetch()}
            />
            <FilePagination
              page={pagination.page + 1}
              hasNext={Boolean(filesQuery.data?.nextCursor)}
              isPending={filesQuery.isFetching}
              onPrevious={previousPage}
              onNext={nextPage}
            />
          </section>
        </main>
      </div>
      <UploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        parentId={folderId}
        onComplete={refresh}
        onUploadsChange={updateUploadNotice}
      />
      <FolderDialog
        open={isFolderOpen}
        onOpenChange={setIsFolderOpen}
        onCreate={(name) => createFolder.mutateAsync(name)}
      />
      <RenameDialog
        file={renameFile}
        onClose={() => setRenameFile(null)}
        onRename={(file, name) => rename.mutateAsync({ file, name })}
      />
      <MoveDialog
        key={moveFile?.id || "move-dialog"}
        file={moveFile}
        onClose={() => setMoveFile(null)}
        onMove={(file, parentId) => move.mutateAsync({ file, parentId })}
      />
      <DeleteDialog
        file={deleteTarget?.file || null}
        permanent={Boolean(deleteTarget?.permanent)}
        onClose={() => setDeleteTarget(null)}
        onDelete={(file) => remove.mutateAsync({ file, permanent: Boolean(deleteTarget?.permanent) })}
      />
      <ShareDialog file={shareFile} onClose={() => setShareFile(null)} />
      <PreviewDialog
        file={previewFile}
        files={isTrash ? [] : filesQuery.data?.files || []}
        onClose={() => setPreviewFile(null)}
        onSelect={setPreviewFile}
      />
    </div>
  );
}
