"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { CopyIcon, InfoIcon, LaptopIcon, SendIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DeviceTransferPeer } from "@/lib/device-transfer";
import { DeviceTransferStatusCard } from "@/components/device-transfer-status-card";
import { driveApi } from "@/lib/drive-api";
import { cn } from "@/lib/utils";

const DIALOG_CLOSE_DELAY_MS = 150;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}

function sourceByteSize(source) {
  const bytes = source?.sizeBytes ?? source?.rawSize ?? source?.size;
  return typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
}

export function DeviceTransferDialog({ open, onOpenChange, driveFile = null }) {
  const [localFile, setLocalFile] = useState(null);
  const [created, setCreated] = useState(null);
  const [state, setState] = useState("");
  const [network, setNetwork] = useState("");
  const [connection, setConnection] = useState(null);
  const [sentBytes, setSentBytes] = useState(0);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const reduceMotion = useReducedMotion();
  const peerRef = useRef(null);
  const sessionRef = useRef(0);
  const resetTimerRef = useRef(null);
  const dragDepthRef = useRef(0);
  const filePickerRef = useRef(null);
  const source = localFile || driveFile;
  const isDriveSource = Boolean(driveFile && !localFile);
  const sourceBytes = sourceByteSize(source);

  useEffect(() => () => {
    sessionRef.current += 1;
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    peerRef.current?.close();
  }, []);

  function resetTransfer() {
    peerRef.current = null;
    setCreated(null);
    setState("");
    setNetwork("");
    setConnection(null);
    setSentBytes(0);
    setIsDraggingFile(false);
    dragDepthRef.current = 0;
    setLocalFile(null);
  }

  async function prepare() {
    if (!source) return;
    if (sourceBytes > 2 * 1024 * 1024 * 1024) {
      toast.error("Device transfers support files up to 2 GB.");
      return;
    }
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    sessionRef.current += 1;
    const session = sessionRef.current;
    setState("");
    setNetwork("");
    setConnection(null);
    setSentBytes(0);
    setIsPreparing(true);
    try {
      const request = isDriveSource
        ? { source: "drive", nodeId: driveFile.id }
        : { source: "local", name: localFile.name, contentType: localFile.type || null, sizeBytes: localFile.size };
      const result = await driveApi.createDeviceTransfer(request);
      if (sessionRef.current !== session) return;
      setCreated(result);
      const peer = new DeviceTransferPeer({
        role: "sender",
        transfer: result.transfer,
        iceServers: result.iceServers,
        onState: (nextState) => { if (sessionRef.current === session) setState(nextState); },
        onNetwork: (nextNetwork) => { if (sessionRef.current === session) setNetwork(nextNetwork); },
        onConnection: (nextConnection) => { if (sessionRef.current === session) setConnection(nextConnection); },
        onProgress: (bytes) => { if (sessionRef.current === session) setSentBytes(bytes); },
      });
      peerRef.current = peer;
      let streamSource = localFile;
      if (isDriveSource) {
        streamSource = {
          stream: async () => {
            const response = await fetch(driveApi.fileUrl(driveFile.id), { credentials: "include" });
            if (!response.ok || !response.body) throw new Error("The Drive file could not be opened for transfer.");
            return response.body;
          },
        };
      }
      await peer.startSender(streamSource);
    } catch (error) {
      if (sessionRef.current === session) setState(error.message || "The transfer could not be prepared.");
      toast.error("Couldn’t start device transfer", { description: error.message });
    } finally {
      if (sessionRef.current === session) setIsPreparing(false);
    }
  }

  async function copy(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn’t copy to the clipboard.");
    }
  }

  function close() {
    const peer = peerRef.current;
    const closingSession = sessionRef.current + 1;
    sessionRef.current = closingSession;
    peerRef.current = null;
    void peer?.cancel();
    onOpenChange(false);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      if (sessionRef.current === closingSession) resetTransfer();
    }, DIALOG_CLOSE_DELAY_MS);
  }

  const transferBytes = created?.transfer?.sizeBytes ?? sourceBytes;
  const progress = transferBytes > 0 ? Math.min(100, Math.round((sentBytes / transferBytes) * 100)) : 0;
  const isDeviceConnected = Boolean(connection || network);
  const isComplete = state.toLowerCase().includes("complete");
  const receiveUrl = created?.invitationUrl?.split("?")[0] || "/receive";
  return (
    <Dialog open={open} onOpenChange={(next) => next || close()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-md grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle className="flex items-center gap-1.5">FileFly <Tooltip><TooltipTrigger render={<button type="button" className="text-muted-foreground hover:text-foreground" aria-label="About FileFly" />}><InfoIcon className="size-4" /></TooltipTrigger><TooltipContent>Fast, direct file transfers between your devices. Files do not go through Drive.</TooltipContent></Tooltip></DialogTitle>
          <DialogDescription>Send files quickly and directly to another browser. Both browsers must stay open while the transfer runs.</DialogDescription>
        </DialogHeader>
        <input ref={filePickerRef} className="sr-only" type="file" onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => setLocalFile(event.target.files?.[0] || null)} />
        <div className="min-h-0 overflow-y-auto px-4 py-3">
          {!source ? (
            <label
              data-upload-drop-zone
              className={cn("flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors", isDraggingFile ? "border-primary bg-primary/5" : "bg-muted/30 hover:bg-muted/60")}
              onClick={() => filePickerRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); dragDepthRef.current += 1; setIsDraggingFile(true); }}
              onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; setIsDraggingFile(true); }}
              onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setIsDraggingFile(false); }}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); dragDepthRef.current = 0; setIsDraggingFile(false); setLocalFile(event.dataTransfer.files?.[0] || null); }}
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-background shadow-xs"><LaptopIcon className="size-5 text-primary" /></span>
              <span className="text-sm font-medium">{isDraggingFile ? "Drop file to send" : "Choose a file from this device"}</span>
              <span className="text-xs text-muted-foreground">Up to 2 GB. The file will not be uploaded to Drive.</span>
            </label>
          ) : !created ? (
            <div className="flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border bg-muted/20 p-4">
              <div className="min-w-0 flex-1"><p className="truncate font-medium" title={source.name}>{source.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{formatBytes(sourceBytes)} · {isDriveSource ? "From My Drive" : "From this device"}</p></div>
              <Button size="sm" variant="outline" onClick={() => filePickerRef.current?.click()}>Change file</Button>
            </div>
          ) : (
            <div className="grid gap-3">
              <AnimatePresence initial={false}>{!isDeviceConnected && <motion.div initial={reduceMotion ? false : { opacity: 0, height: 0, y: -6 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="grid gap-3 overflow-hidden p-1"><Card size="sm"><CardContent className="text-center">
                <QRCodeSVG value={created.invitationUrl} size={152} level="M" className="mx-auto rounded-md bg-white p-2" />
                <p className="mt-2 text-sm font-medium">Scan this code on the receiving device</p>
                <Button className="mt-2" size="sm" variant="outline" onClick={() => copy(created.invitationUrl, "Transfer link")}><CopyIcon data-icon="inline-start" />Copy link</Button>
              </CardContent></Card>
              <Card size="sm"><CardContent className="text-center">
                <p className="text-xs text-muted-foreground">Or enter this pairing code at</p>
                <a className="mt-1 block truncate text-xs text-primary underline underline-offset-3" href={receiveUrl}>{receiveUrl}</a>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.22em]">{created.code}</p>
              </CardContent></Card></motion.div>}</AnimatePresence>
              <DeviceTransferStatusCard role="sender" state={state} progress={progress} fileName={created.transfer.name} fileSize={created.transfer.sizeBytes} connection={connection || (network ? { mode: network.includes("relay") ? "relay" : "direct", mbps: null } : null)} />
            </div>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-b-xl px-4 py-3">
          <Button variant="outline" onClick={close}>{isComplete ? "Done" : <><XIcon data-icon="inline-start" />Cancel</>}</Button>
          {!created && <Button disabled={!source || isPreparing} onClick={prepare}>{isPreparing ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}Create secure transfer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
