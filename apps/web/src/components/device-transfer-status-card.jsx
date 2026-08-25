"use client";

import { CheckCircle2Icon, FileIcon, XCircleIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  const exponent = bytes ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0;
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}

function phaseFor(state, progress, role) {
  const value = (state || "").toLowerCase();
  if (value.includes("complete")) return "complete";
  if (value.includes("declined") || value.includes("rejected")) return "declined";
  if (value.includes("cancelled")) return "cancelled";
  if (value.includes("too many attempts")) return "rate-limited";
  if (value.includes("invalid pairing code")) return "invalid-code";
  if (value.includes("not found")) return "not-found";
  if (value.includes("unavailable") || value.includes("failed") || value.includes("interrupted") || value.includes("could not") || value.includes("stopped responding") || value.includes("error")) return "error";
  if (value.includes("sending") || value.includes("receiving") || progress > 0) return "transferring";
  if (value.includes("ready") || value.includes("approval")) return "ready";
  if (value.includes("joining") || value.includes("connecting") || value.includes("secure connection")) return "connecting";
  return role === "receiver" ? "connecting" : "pairing";
}

function copyFor(phase, role) {
  const sender = role === "sender";
  if (phase === "pairing") return { title: "Pair another device", description: "Scan the QR code or enter the pairing code on the receiving device." };
  if (phase === "connecting") return { title: "Connecting securely", description: "Preparing the encrypted browser-to-browser connection." };
  if (phase === "ready") return { title: sender ? "Receiver is ready" : "Ready to receive", description: sender ? "Waiting for the receiver to confirm the file." : "Choose Receive FileFly when you are ready." };
  if (phase === "transferring") return { title: sender ? "Sending file" : "Receiving file", description: sender ? "Sending directly to the other device." : "Receiving directly from other device." };
  if (phase === "complete") return { title: "Transfer complete", description: sender ? "The receiving device saved the file." : "You can now download the received file." };
  if (phase === "declined") return { title: "Transfer declined", description: sender ? "The receiving device declined this file." : "The sender has been notified." };
  if (phase === "cancelled") return { title: "Transfer cancelled", description: "Please start a new transfer." };
  if (phase === "rate-limited") return { title: "Too many attempts", description: "Please wait a minute before trying again." };
  if (phase === "invalid-code") return { title: "Invalid pairing code", description: "Enter all 8 characters and try again." };
  if (phase === "not-found") return { title: "Transfer not found", description: "Check the pairing code and try again." };
  return { title: "Transfer unavailable", description: "The connection could not continue. Create a new transfer to try again." };
}

function connectionLabel(connection) {
  if (!connection) return null;
  const kind = connection.mode === "relay" ? "Secure relay" : "Direct connection";
  if (!Number.isFinite(connection.mbps)) return kind;
  return `${kind} · ${connection.mbps.toFixed(connection.mbps >= 10 ? 0 : 1)} Mbps`;
}

function candidatePairLabel(connection) {
  if (!connection?.localCandidateType && !connection?.remoteCandidateType) return null;
  const local = connection.localCandidateType || "unknown";
  const remote = connection.remoteCandidateType || "unknown";
  const protocol = connection.relayProtocol || connection.protocol;
  return `Selected ICE · ${local} ↔ ${remote}${protocol ? ` · ${protocol.toUpperCase()}` : ""}`;
}

export function DeviceTransferStatusCard({ role, state, progress = 0, fileName, fileSize, connection }) {
  const showIceDiagnostics = process.env.NODE_ENV === "development";
  const reduceMotion = useReducedMotion();
  const phase = phaseFor(state, progress, role);
  const copy = copyFor(phase, role);
  const isWorking = phase === "pairing" || phase === "connecting";
  const isFailure = phase === "declined" || phase === "cancelled" || phase === "rate-limited" || phase === "invalid-code" || phase === "not-found" || phase === "error";
  const isComplete = phase === "complete";
  const network = connectionLabel(connection);
  const candidatePair = candidatePairLabel(connection);
  const enter = (delay = 0) => reduceMotion ? {} : {
    initial: { opacity: 0, y: -6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.18, delay },
  };

  return <Card size="sm">
    <CardContent className="space-y-3">
      <motion.div key={phase} className="flex min-w-0 items-start gap-3" {...enter()}>
        {isWorking ? <Spinner className="mt-0.5 shrink-0" /> : isComplete ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" /> : isFailure ? <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" /> : <FileIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0"><p className="font-medium">{copy.title}</p><p className="text-sm text-muted-foreground">{copy.description}</p></div>
      </motion.div>
      {fileName && <motion.div {...enter(0.04)} className="flex min-w-0 items-center gap-2 rounded-md bg-muted px-2.5 py-2"><FileIcon className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm" title={fileName}>{fileName}</span>{fileSize != null && <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(fileSize)}</span>}</motion.div>}
      {phase === "transferring" && <motion.div {...enter(0.08)} className="space-y-1.5"><div className="flex justify-between text-xs text-muted-foreground"><span>{role === "sender" ? "Sent" : "Received"}</span><span>{progress}%</span></div><Progress value={progress} aria-label={`${role === "sender" ? "Send" : "Receive"} progress`} /></motion.div>}
      {(network || (showIceDiagnostics && candidatePair)) && !isComplete && <motion.div {...enter(0.12)} className="flex flex-wrap gap-1.5">{network && <Badge variant="outline">{network}</Badge>}{showIceDiagnostics && candidatePair && <Badge variant="outline" title="Selected ICE candidate pair">{candidatePair}</Badge>}</motion.div>}
    </CardContent>
  </Card>;
}
