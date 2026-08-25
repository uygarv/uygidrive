"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DownloadIcon, ExternalLinkIcon, InfoIcon, SendIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DeviceTransferPeer, supportsDeviceReceive, supportsStreamedDeviceSave } from "@/lib/device-transfer";
import { DeviceTransferStatusCard } from "@/components/device-transfer-status-card";
import { driveApi } from "@/lib/drive-api";

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  const exponent = bytes ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0;
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}

export function DeviceTransferReceiver() {
  const search = useSearchParams();
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState(null);
  const [state, setState] = useState("");
  const [network, setNetwork] = useState("");
  const [connection, setConnection] = useState(null);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [isJoining, setIsJoining] = useState(false);
  const [download, setDownload] = useState(null);
  const [savedFile, setSavedFile] = useState(null);
  const [availableTransfers, setAvailableTransfers] = useState([]);
  const [isLoadingAvailableTransfers, setIsLoadingAvailableTransfers] = useState(true);
  const [hasAvailableTransferSession, setHasAvailableTransferSession] = useState(false);
  const reduceMotion = useReducedMotion();
  const peerRef = useRef(null);
  const joinInFlightRef = useRef(false);
  const invitation = search.get("invite");

  useEffect(() => () => peerRef.current?.close(), []);

  const join = useCallback(async (input) => {
    if (joinInFlightRef.current || peerRef.current || joined) return;
    if (input.code && input.code.trim().length !== 8) {
      setState("Invalid pairing code.");
      return;
    }
    joinInFlightRef.current = true;
    if (!supportsDeviceReceive()) {
      setState("This browser does not support direct device transfers. Use a current Chrome or Safari browser.");
      joinInFlightRef.current = false;
      return;
    }
    setIsJoining(true);
    setState("Joining secure transfer");
    try {
      const result = input.transferId ? await driveApi.joinOwnDeviceTransfer(input.transferId) : await driveApi.joinDeviceTransfer(input);
      setJoined(result);
      const peer = new DeviceTransferPeer({
        role: "receiver",
        transfer: result.transfer,
        iceServers: result.iceServers,
        receiverToken: result.receiverToken,
        onState: setState,
        onNetwork: setNetwork,
        onConnection: setConnection,
        onProgress: (bytes) => setReceivedBytes(bytes),
        onIncoming: () => setState(supportsStreamedDeviceSave() ? "Sender is ready. Choose where to save the file." : "Sender is ready. Start the transfer, then download the file when it is ready."),
        onDownload: setDownload,
        onSavedFile: setSavedFile,
      });
      peerRef.current = peer;
      await peer.startReceiver();
    } catch (error) {
      setState(["RATE_LIMITED", "FST_ERR_RATE_LIMITED"].includes(error?.code) ? "Too many attempts." : error?.code === "VALIDATION_ERROR" ? "Invalid pairing code." : error?.code === "TRANSFER_NOT_FOUND" ? "Transfer not found." : error.message || "This transfer could not be opened.");
      joinInFlightRef.current = false;
    } finally {
      setIsJoining(false);
    }
  }, [joined]);

  useEffect(() => {
    if (invitation || joined) return undefined;
    let active = true;
    let unauthenticated = false;
    const loadAvailable = async () => {
      if (unauthenticated) return;
      try {
        const result = await driveApi.availableDeviceTransfers();
        if (active) {
          setAvailableTransfers(result.transfers || []);
          setHasAvailableTransferSession(true);
        }
      } catch (error) {
        if (error?.code === "UNAUTHENTICATED") {
          unauthenticated = true;
          if (active) setHasAvailableTransferSession(false);
        }
      } finally {
        if (active) setIsLoadingAvailableTransfers(false);
      }
    };
    void loadAvailable();
    const timer = window.setInterval(loadAvailable, 4_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [invitation, joined]);

  useEffect(() => {
    if (!invitation || joined) return;
    // Defer joining so Strict Mode's first effect cleanup cancels its probe.
    const timer = window.setTimeout(() => join({ invitation }), 0);
    return () => window.clearTimeout(timer);
  }, [invitation, joined, join]);

  async function accept() {
    try {
      await peerRef.current?.accept();
    } catch (error) {
      setState(error.message || "Couldn’t prepare the download.");
    }
  }

  function downloadFile() {
    if (!download) return;
    const url = URL.createObjectURL(download.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = download.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function openSavedFile() {
    if (!savedFile?.handle) return;
    // Open the tab during the click event so popup blocking does not prevent
    // the file from being shown after the asynchronous handle read completes.
    const tab = window.open("", "_blank");
    try {
      const file = await savedFile.handle.getFile();
      const url = URL.createObjectURL(file);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      setState(error.message || "Couldn’t open the saved file.");
    }
  }

  function startNewReceive() {
    window.history.replaceState(null, "", "/receive");
    window.location.reload();
  }

  const transfer = joined?.transfer;
  const progress = transfer ? Math.min(100, Math.round((receivedBytes / transfer.sizeBytes) * 100)) : 0;
  const readyToAccept = state.includes("Sender is ready");
  const actionLabel = supportsStreamedDeviceSave() ? "Choose save location" : "Receive FileFly";
  const terminal = /complete|declined|cancelled|unavailable|failed|interrupted|could not/i.test(state);
  const canStartNewReceive = terminal;
  const connectionDetails = connection || (network ? { mode: network.includes("relay") ? "relay" : "direct", mbps: null } : null);
  const entrance = reduceMotion ? {} : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.18 } };
  return (
    <main className="min-h-svh bg-muted/30 p-5">
      <header className="mx-auto flex max-w-xl justify-between py-3">
        <Brand />
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          FileFly
          <Tooltip>
            <TooltipTrigger render={<button type="button" className="hover:text-foreground" aria-label="About FileFly" />}>
              <InfoIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Fast, direct file transfers between your devices. Files do not go through Drive.</TooltipContent>
          </Tooltip>
        </span>
      </header>

      <div className="mx-auto mt-12 max-w-xl">
        <Card>
          <CardHeader>
            <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <SendIcon className="size-5" />
            </span>
            <CardTitle>Receive a file</CardTitle>
            <CardDescription>Receive files quickly and directly from the sender’s browser. They are not saved to your Drive.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!invitation && !joined && (
              <>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (code.trim()) join({ code: code.trim() });
                  }}
                >
                  <Input
                    className="font-mono tracking-[0.22em] placeholder:font-sans placeholder:tracking-normal"
                    value={code}
                    maxLength={8}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    placeholder="Pairing code"
                    aria-label="Pairing code"
                  />
                  <Button disabled={isJoining} type="submit">
                    {isJoining && <Spinner data-icon="inline-start" />}
                    Join
                  </Button>
                </form>

                {isLoadingAvailableTransfers && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Spinner className="size-3.5" />
                    Loading active FileFly transfers
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {!isLoadingAvailableTransfers && hasAvailableTransferSession && availableTransfers.length === 0 && (
                    <motion.p key="no-transfers" {...entrance} className="mt-4 text-xs text-muted-foreground">
                      No active FileFly transfers found on your account.
                    </motion.p>
                  )}
                  {!isLoadingAvailableTransfers && availableTransfers.length > 0 && (
                    <motion.div key="available-transfers" {...entrance} className="mt-4 space-y-3">
                      <p className="text-sm font-medium">Your active FileFly transfers</p>
                      {availableTransfers.map((available) => (
                        <Button
                          key={available.id}
                          className="h-auto w-full justify-between px-3 py-2.5 text-left"
                          variant="outline"
                          disabled={isJoining}
                          onClick={() => join({ transferId: available.id })}
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{available.name}</span>
                            <span className="block text-xs font-normal text-muted-foreground">{formatBytes(available.sizeBytes)}</span>
                          </span>
                          <span className="shrink-0 text-muted-foreground">Join</span>
                        </Button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}

            {transfer && (
              <DeviceTransferStatusCard
                role="receiver"
                state={state}
                progress={progress}
                fileName={transfer.name}
                fileSize={transfer.sizeBytes}
                connection={connectionDetails}
              />
            )}
            {!transfer && state && <DeviceTransferStatusCard role="receiver" state={state} connection={connectionDetails} />}
          </CardContent>

          {transfer && (
            <CardFooter className="justify-end gap-2">
              {canStartNewReceive && <Button variant="outline" onClick={startNewReceive}>New receive</Button>}
              {savedFile && state.includes("complete") && (
                <Button variant="outline" onClick={openSavedFile}>
                  <ExternalLinkIcon data-icon="inline-start" />
                  Open file
                </Button>
              )}
              {!terminal && <Button variant="outline" onClick={() => peerRef.current?.cancel()}>Cancel</Button>}
              {download ? (
                <Button onClick={downloadFile}>
                  <DownloadIcon data-icon="inline-start" />
                  Download file
                </Button>
              ) : readyToAccept && !terminal && (
                <Button onClick={accept}>
                  <DownloadIcon data-icon="inline-start" />
                  {actionLabel}
                </Button>
              )}
            </CardFooter>
          )}
        </Card>
      </div>
    </main>
  );
}
