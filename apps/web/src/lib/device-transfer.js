import { driveApi } from "@/lib/drive-api";

const DEFAULT_CHUNK_BYTES = 64 * 1024;
// Keep individual SCTP messages comfortably below the commonly supported
// 256 KiB ceiling. On a lossy Wi-Fi link a 256 KiB ordered message is split
// into many packets; one lost packet can then delay the following messages.
const PREFERRED_CHUNK_BYTES = 128 * 1024;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const BUFFERED_AMOUNT_LOW_BYTES = 7 * 1024 * 1024;
const CANDIDATE_BATCH_DELAY_MS = 100;
const DISCONNECT_GRACE_MS = 30_000;
const ICE_RESTART_DELAY_MS = 1_500;
const PROGRESS_UPDATE_INTERVAL_MS = 100;
const CONNECTION_SPEED_WINDOW_MS = 5_000;

function waitForBufferedAmount(channel) {
  if (channel.bufferedAmount <= MAX_BUFFERED_BYTES) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      channel.removeEventListener("bufferedamountlow", ready);
      reject(new Error("The device connection stopped responding."));
    }, 30_000);
    function ready() {
      window.clearTimeout(timeout);
      channel.removeEventListener("bufferedamountlow", ready);
      resolve();
    }
    channel.addEventListener("bufferedamountlow", ready, { once: true });
  });
}

function control(value) { return JSON.stringify(value); }

function serializableDescription(description) {
  if (!description?.type || typeof description.sdp !== "string") throw new Error("The device connection could not create a valid session description.");
  return { type: description.type, sdp: description.sdp };
}

export function supportsDeviceReceive() {
  return typeof window !== "undefined" && typeof RTCPeerConnection !== "undefined";
}

export function supportsStreamedDeviceSave() {
  // The picker is a secure-context API. A phone opening a local/LAN HTTP
  // development URL can expose partial API surface but still reject the call.
  return typeof window !== "undefined" && window.isSecureContext && typeof window.showSaveFilePicker === "function";
}

export class DeviceTransferPeer {
  constructor({ role, transfer, iceServers, receiverToken = null, onState, onProgress, onIncoming, onNetwork, onConnection, onDownload, onSavedFile }) {
    this.role = role;
    this.transfer = transfer;
    this.iceServers = iceServers;
    this.receiverToken = receiverToken;
    this.onState = onState;
    this.onProgress = onProgress;
    this.onIncoming = onIncoming;
    this.onNetwork = onNetwork;
    this.onConnection = onConnection;
    this.onDownload = onDownload;
    this.onSavedFile = onSavedFile;
    this.sequence = 0;
    this.poller = null;
    this.closed = false;
    this.writer = null;
    this.fileHandle = null;
    this.receivedBytes = 0;
    this.source = null;
    this.accepted = false;
    this.writeChain = Promise.resolve();
    this.memoryChunks = null;
    this.signalQueue = Promise.resolve();
    this.pendingCandidates = [];
    this.candidateFlushTimer = null;
    this.disconnectTimer = null;
    this.signalingFailureTimer = null;
    this.iceRestartTimer = null;
    this.iceRestartInFlight = false;
    this.pendingRecoveryOffer = null;
    this.recoveryOfferSending = false;
    this.descriptionSignaled = false;
    this.polling = false;
    this.chunkBytes = DEFAULT_CHUNK_BYTES;
    this.lastProgressAt = 0;
    this.progressTimer = null;
    this.pendingProgress = null;
    this.senderProgressTimer = null;
    this.sentBytes = 0;
    this.transferStarted = false;
    this.connectionStatsTimer = null;
    this.connectionSpeedSamples = [];
  }

  async startSender(source) {
    this.source = source;
    this.createConnection();
    this.channel = this.peer.createDataChannel("uygidrive-transfer", { ordered: true });
    this.configureChannel(this.channel);
    this.startPolling();
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    await this.signal("offer", { description: serializableDescription(offer) });
    this.descriptionSignaled = true;
    await this.flushCandidates();
    this.onState?.("Waiting for the other device");
  }

  async startReceiver() {
    this.createConnection();
    this.peer.ondatachannel = (event) => {
      this.channel = event.channel;
      this.configureChannel(this.channel);
    };
    this.startPolling();
    this.onState?.("Connecting to sender");
  }

  createConnection() {
    this.peer = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peer.onicecandidate = (event) => {
      if (event.candidate) this.queueCandidate(event.candidate.toJSON());
    };
    this.peer.onconnectionstatechange = () => {
      if (this.peer.connectionState === "connected") {
        this.clearDisconnectTimer();
        this.signal("status", { status: "connected" }).catch(() => undefined);
        this.startConnectionMetrics();
      }
      if (["disconnected", "failed"].includes(this.peer.connectionState)) {
        // Browsers commonly report a short disconnected state while changing
        // from a host candidate to TURN or during mobile network handoff. A
        // few mobile browsers jump straight to `failed`, so treat both as a
        // recoverable state first and let the original offerer restart ICE.
        this.beginConnectionRecovery();
      }
      if (this.peer.connectionState === "closed" && !this.closed) this.fail(new Error("The device connection was interrupted."));
    };
  }

  clearDisconnectTimer() {
    if (this.disconnectTimer) window.clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
    if (this.iceRestartTimer) window.clearTimeout(this.iceRestartTimer);
    this.iceRestartTimer = null;
  }

  scheduleDisconnectFailure() {
    if (this.disconnectTimer || this.closed) return;
    this.disconnectTimer = window.setTimeout(() => {
      this.disconnectTimer = null;
      if (!this.closed && ["disconnected", "failed"].includes(this.peer?.connectionState)) this.fail(new Error("The device connection was interrupted."));
    }, DISCONNECT_GRACE_MS);
  }

  clearSignalingFailureTimer() {
    if (this.signalingFailureTimer) window.clearTimeout(this.signalingFailureTimer);
    this.signalingFailureTimer = null;
  }

  signalingFailed(error) {
    if (this.closed) return;
    // Authoritative API responses cannot be repaired by waiting for a new
    // network. Everything else is commonly a short fetch failure during a
    // Wi-Fi-to-cellular handoff.
    if (["TRANSFER_NOT_FOUND", "TRANSFER_UNAVAILABLE", "UNAUTHENTICATED"].includes(error?.code)) {
      this.fail(error);
      return;
    }
    this.beginConnectionRecovery();
    if (this.signalingFailureTimer) return;
    this.signalingFailureTimer = window.setTimeout(() => {
      this.signalingFailureTimer = null;
      if (!this.closed) this.fail(new Error("The secure connection could not be restored."));
    }, DISCONNECT_GRACE_MS);
  }

  signalingRecovered() {
    this.clearSignalingFailureTimer();
    // An ICE restart offer or late candidates may have been created while the
    // sender had no route to the signaling API. Deliver them after the first
    // successful request on the new network.
    this.flushRecoveryOffer().catch((error) => this.signalingFailed(error));
    this.flushCandidates().catch((error) => this.signalingFailed(error));
  }

  beginConnectionRecovery() {
    if (this.closed) return;
    this.onState?.("Reconnecting secure connection");
    this.scheduleDisconnectFailure();
    if (this.role === "receiver") {
      // Only the sender creates offers. Asking it to restart avoids offer
      // collisions when the receiving phone is the device that changed
      // networks.
      this.signal("status", { status: "reconnecting" }).catch(() => undefined);
      return;
    }
    this.scheduleIceRestart();
  }

  scheduleIceRestart() {
    if (this.iceRestartTimer || this.iceRestartInFlight || this.closed) return;
    this.iceRestartTimer = window.setTimeout(() => {
      this.iceRestartTimer = null;
      void this.restartIce();
    }, ICE_RESTART_DELAY_MS);
  }

  async restartIce() {
    if (this.closed || this.iceRestartInFlight || !this.peer || this.peer.connectionState === "connected" || this.peer.signalingState !== "stable") return;
    this.iceRestartInFlight = true;
    try {
      // A fresh ICE offer lets the same DTLS/SCTP DataChannel survive a
      // Wi-Fi-to-cellular handoff rather than treating the first failed ICE
      // pair as a cancelled file transfer.
      this.peer.restartIce?.();
      const offer = await this.peer.createOffer({ iceRestart: true });
      if (this.closed) return;
      await this.peer.setLocalDescription(offer);
      this.pendingRecoveryOffer = { description: serializableDescription(offer) };
      await this.flushRecoveryOffer();
    } catch (error) {
      this.signalingFailed(error);
    } finally {
      this.iceRestartInFlight = false;
    }
  }

  async flushRecoveryOffer() {
    if (this.closed || this.recoveryOfferSending || !this.pendingRecoveryOffer) return;
    const payload = this.pendingRecoveryOffer;
    this.recoveryOfferSending = true;
    try {
      await this.signal("offer", payload);
      if (this.pendingRecoveryOffer === payload) this.pendingRecoveryOffer = null;
      await this.flushCandidates();
    } finally {
      this.recoveryOfferSending = false;
    }
  }

  startConnectionMetrics() {
    if (this.connectionStatsTimer) return;
    this.updateConnectionMetrics().catch(() => undefined);
    this.connectionStatsTimer = window.setInterval(() => this.updateConnectionMetrics().catch(() => undefined), 1_000);
  }

  configureChannel(channel) {
    channel.binaryType = "arraybuffer";
    // Refill after one MiB has drained instead of waiting for half of the
    // buffer. This keeps the SCTP pipe full without visible multi-second
    // progress bursts on slower Wi-Fi links.
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_BYTES;
    channel.onopen = () => {
      // Chrome commonly negotiates 256 KiB SCTP messages, while Safari can
      // negotiate a smaller limit. Keep each reliable, ordered SCTP message
      // below the advertised maximum to reduce retransmission stalls on Wi-Fi.
      const maxMessageSize = this.peer.sctp?.maxMessageSize;
      if (Number.isFinite(maxMessageSize) && maxMessageSize > 0) {
        this.chunkBytes = Math.max(16 * 1024, Math.min(PREFERRED_CHUNK_BYTES, maxMessageSize - 1024));
      } else if (maxMessageSize === 0) {
        this.chunkBytes = PREFERRED_CHUNK_BYTES;
      }
      if (this.role === "sender") {
        channel.send(control({ type: "metadata", name: this.transfer.name, contentType: this.transfer.contentType, sizeBytes: this.transfer.sizeBytes }));
        this.onState?.("Waiting for receiver approval");
      }
    };
    channel.onmessage = (event) => this.handleChannelMessage(event).catch((error) => this.fail(error));
  }

  async handleChannelMessage(event) {
    if (typeof event.data === "string") {
      const message = JSON.parse(event.data);
      if (message.type === "metadata" && this.role === "receiver") {
        this.onIncoming?.(message);
      }
      if (message.type === "end" && this.role === "receiver") {
        await this.writeChain;
        await this.finishReceive();
      }
      return;
    }
    if (this.role !== "receiver" || (!this.writer && !this.memoryChunks)) return;
    const bytes = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : new Uint8Array(await event.data.arrayBuffer());
    this.writeChain = this.writeChain.then(async () => {
      if (this.writer) await this.writer.write(bytes);
      else this.memoryChunks.push(bytes.slice());
      this.receivedBytes += bytes.byteLength;
      this.reportProgress(this.receivedBytes);
    });
    await this.writeChain;
  }

  async accept() {
    if (this.role !== "receiver") return;
    if (supportsStreamedDeviceSave()) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: this.transfer.name, types: this.transfer.contentType ? [{ description: "Transferred file", accept: { [this.transfer.contentType]: ["." + this.transfer.name.split(".").pop()] } }] : undefined });
        this.fileHandle = handle;
        // Write to a swap file which starts as a copy of the selected file.
        // The original therefore remains intact until `close()` commits the
        // fully received replacement; `abort()` leaves it untouched.
        this.writer = await handle.createWritable({ keepExistingData: true, mode: "exclusive" });
      } catch (error) {
        // A user who explicitly dismisses the desktop picker has not accepted
        // the transfer. Other browser/platform failures fall back to a Blob
        // download so Chrome and Safari on mobile can proceed.
        if (error?.name === "AbortError") throw error;
        this.memoryChunks = [];
      }
    } else {
      // iOS Safari and mobile Chrome do not consistently expose File System
      // Access. Keep chunks temporarily, then let the user explicitly start
      // the browser download once the complete Blob is ready.
      this.memoryChunks = [];
    }
    this.accepted = true;
    this.transferStarted = true;
    await this.signal("accept");
    this.onState?.("Receiving file");
  }

  async reject() {
    await this.signal("reject");
    this.onState?.("Transfer declined");
    this.close(false);
  }

  async startStream() {
    if (!this.source || !this.channel || this.channel.readyState !== "open") return;
    this.transferStarted = true;
    this.onState?.("Sending file");
    await this.signal("status", { status: "transferring" });
    const stream = await this.source.stream();
    const reader = stream.getReader();
    let sentBytes = 0;
    let pendingChunk = new Uint8Array(this.chunkBytes);
    let pendingLength = 0;
    const sendChunk = async (chunk) => {
      await waitForBufferedAmount(this.channel);
      this.channel.send(chunk);
      sentBytes += chunk.byteLength;
      this.sentBytes = sentBytes;
    };
    this.senderProgressTimer = window.setInterval(() => this.reportSenderProgress(), PROGRESS_UPDATE_INTERVAL_MS);
    try {
      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done) break;
        for (let offset = 0; offset < value.byteLength; offset += this.chunkBytes) {
          const part = value.subarray(offset, Math.min(offset + this.chunkBytes, value.byteLength));
          let partOffset = 0;
          while (partOffset < part.byteLength) {
            const length = Math.min(pendingChunk.byteLength - pendingLength, part.byteLength - partOffset);
            pendingChunk.set(part.subarray(partOffset, partOffset + length), pendingLength);
            pendingLength += length;
            partOffset += length;
            if (pendingLength === pendingChunk.byteLength) {
              await sendChunk(pendingChunk);
              pendingChunk = new Uint8Array(this.chunkBytes);
              pendingLength = 0;
            }
          }
        }
      }
      if (!this.closed && pendingLength) await sendChunk(pendingChunk.slice(0, pendingLength));
      if (!this.closed && sentBytes === this.transfer.sizeBytes) {
        this.reportSenderProgress();
        this.channel.send(control({ type: "end" }));
        this.onState?.("Waiting for receiver to finish saving");
      }
    } finally {
      reader.releaseLock();
    }
  }

  async finishReceive() {
    if (!this.writer && !this.memoryChunks) return;
    if (this.receivedBytes !== this.transfer.sizeBytes) throw new Error("The received file size does not match the sender’s file.");
    this.reportProgress(this.receivedBytes, true);
    if (this.writer) {
      // `keepExistingData` protects a replacement that is interrupted. Once
      // every byte arrived, remove any tail left by a larger previous file
      // before atomically committing the completed transfer.
      await this.writer.truncate(this.transfer.sizeBytes);
      await this.writer.close();
      this.writer = null;
      this.onSavedFile?.({ handle: this.fileHandle, name: this.transfer.name });
    } else {
      const blob = new Blob(this.memoryChunks, { type: this.transfer.contentType || "application/octet-stream" });
      this.memoryChunks = null;
      this.onDownload?.({ blob, name: this.transfer.name });
    }
    await this.signal("complete");
    this.onState?.("Transfer complete");
    this.close(false);
  }

  async handleSignal(signal) {
    if (signal.type === "offer" && this.role === "receiver") {
      const description = serializableDescription(signal.payload.description);
      await this.peer.setRemoteDescription(description);
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      await this.signal("answer", { description: serializableDescription(answer) });
      this.descriptionSignaled = true;
      await this.flushCandidates();
    } else if (signal.type === "answer" && this.role === "sender") {
      await this.peer.setRemoteDescription(serializableDescription(signal.payload.description));
      this.pendingRecoveryOffer = null;
    } else if (signal.type === "status" && signal.payload?.status === "reconnecting" && this.role === "sender") {
      this.scheduleIceRestart();
    } else if (signal.type === "candidate" && signal.payload.candidate) {
      await this.peer.addIceCandidate(signal.payload.candidate);
    } else if (signal.type === "candidates" && Array.isArray(signal.payload.candidates)) {
      for (const candidate of signal.payload.candidates) await this.peer.addIceCandidate(candidate);
    } else if (signal.type === "accept" && this.role === "sender") {
      await this.startStream();
    } else if (["reject", "cancel"].includes(signal.type)) {
      this.onState?.(signal.type === "reject" ? "Receiver declined the transfer" : "Transfer cancelled");
      this.close(false);
    } else if (signal.type === "complete" && this.role === "sender") {
      this.reportProgress(this.transfer.sizeBytes, true);
      this.onState?.("Transfer complete");
      this.close(false);
    }
  }

  async poll() {
    if (this.closed || this.polling) return;
    this.polling = true;
    try {
      const result = await driveApi.deviceTransferSignals(this.transfer.id, this.sequence, this.receiverToken);
      this.signalingRecovered();
      for (const signal of result.signals || []) {
        this.sequence = Math.max(this.sequence, signal.sequence);
        await this.handleSignal(signal);
      }
    } catch (error) {
      this.signalingFailed(error);
    } finally {
      this.polling = false;
    }
  }

  startPolling() {
    this.poll();
    this.poller = window.setInterval(() => this.poll(), 700);
  }

  signal(type, payload = {}) {
    const request = () => driveApi.sendDeviceTransferSignal(this.transfer.id, type, payload, this.receiverToken);
    const queued = this.signalQueue.then(request, request);
    // Keep the queue usable if an individual request fails; its caller still
    // receives the failure and can close the transfer deliberately.
    this.signalQueue = queued.catch(() => undefined);
    return queued;
  }

  queueCandidate(candidate) {
    this.pendingCandidates.push(candidate);
    if (this.descriptionSignaled) this.scheduleCandidateFlush();
  }

  scheduleCandidateFlush() {
    if (this.candidateFlushTimer || this.closed) return;
    this.candidateFlushTimer = window.setTimeout(() => {
      this.candidateFlushTimer = null;
      this.flushCandidates().catch((error) => this.fail(error));
    }, CANDIDATE_BATCH_DELAY_MS);
  }

  async flushCandidates() {
    if (!this.descriptionSignaled || !this.pendingCandidates.length) return;
    const candidates = this.pendingCandidates.splice(0);
    try {
      await this.signal("candidates", { candidates });
    } catch (error) {
      this.pendingCandidates.unshift(...candidates);
      throw error;
    }
  }

  selectedCandidatePair(stats) {
    const transport = [...stats.values()].find((report) => report.type === "transport" && report.selectedCandidatePairId);
    if (transport?.selectedCandidatePairId) return stats.get(transport.selectedCandidatePairId);
    return [...stats.values()].find((report) => report.type === "candidate-pair" && (report.selected || (report.nominated && report.state === "succeeded")));
  }

  selectedDataChannel(stats) {
    const channels = [...stats.values()].filter((report) => report.type === "data-channel");
    return channels.find((report) => report.label === "uygidrive-transfer") ?? channels[0] ?? null;
  }

  bytesFrom(report, field) {
    const value = report?.[field];
    if (value === null || value === undefined) return null;
    const bytes = Number(value);
    return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
  }

  async updateConnectionMetrics() {
    const stats = await this.peer.getStats();
    const selectedPair = this.selectedCandidatePair(stats);
    if (!selectedPair) return;
    const localCandidate = selectedPair?.localCandidateId ? stats.get(selectedPair.localCandidateId) : null;
    const remoteCandidate = selectedPair?.remoteCandidateId ? stats.get(selectedPair.remoteCandidateId) : null;
    const mode = localCandidate?.candidateType === "relay" || remoteCandidate?.candidateType === "relay" ? "relay" : "direct";
    const now = performance.now();
    const direction = this.role === "sender" ? "bytesSent" : "bytesReceived";
    // DataChannel stats measure the file bytes themselves. Candidate-pair
    // stats are retained as a fallback for Safari versions that do not expose
    // data-channel reports.
    const dataChannel = this.selectedDataChannel(stats);
    const bytes = this.bytesFrom(dataChannel, direction) ?? this.bytesFrom(selectedPair, direction) ?? 0;
    const pairId = selectedPair?.id || dataChannel?.id || null;
    const latestSample = this.connectionSpeedSamples.at(-1);
    if (latestSample && (latestSample.pairId !== pairId || bytes < latestSample.bytes)) this.connectionSpeedSamples = [];
    this.connectionSpeedSamples.push({ bytes, at: now, pairId });
    while (this.connectionSpeedSamples.length > 1 && now - this.connectionSpeedSamples[0].at > CONNECTION_SPEED_WINDOW_MS) this.connectionSpeedSamples.shift();
    const oldestSample = this.connectionSpeedSamples[0];
    let mbps = null;
    if (this.transferStarted && oldestSample && now > oldestSample.at && bytes > oldestSample.bytes) {
      mbps = ((bytes - oldestSample.bytes) * 8) / (now - oldestSample.at) / 1_000;
    }
    this.onNetwork?.(mode === "relay" ? "Using secure relay" : "Direct connection");
    this.onConnection?.({
      mode,
      mbps,
      localCandidateType: localCandidate?.candidateType || null,
      remoteCandidateType: remoteCandidate?.candidateType || null,
      protocol: localCandidate?.protocol || remoteCandidate?.protocol || null,
      relayProtocol: localCandidate?.relayProtocol || remoteCandidate?.relayProtocol || null,
    });
  }

  reportProgress(bytes, force = false) {
    const now = performance.now();
    const emit = (value) => {
      this.lastProgressAt = performance.now();
      this.onProgress?.(value, this.transfer.sizeBytes);
    };
    if (force || now - this.lastProgressAt >= PROGRESS_UPDATE_INTERVAL_MS) {
      if (this.progressTimer) window.clearTimeout(this.progressTimer);
      this.progressTimer = null;
      this.pendingProgress = null;
      emit(bytes);
      return;
    }
    this.pendingProgress = bytes;
    if (this.progressTimer) return;
    this.progressTimer = window.setTimeout(() => {
      this.progressTimer = null;
      const value = this.pendingProgress;
      this.pendingProgress = null;
      if (value !== null) emit(value);
    }, PROGRESS_UPDATE_INTERVAL_MS - (now - this.lastProgressAt));
  }

  reportSenderProgress() {
    if (!this.channel) return;
    // bufferedAmount is the amount not yet handed off by the browser's SCTP
    // stack. Showing sent - buffered produces a continuous, honest estimate
    // instead of jumping whenever the producer refills its queue.
    this.reportProgress(Math.max(0, Math.min(this.transfer.sizeBytes, this.sentBytes - this.channel.bufferedAmount)));
  }

  async cancel() {
    if (!this.closed) await this.signal("cancel").catch(() => undefined);
    this.onState?.("Transfer cancelled");
    this.close(false);
  }

  fail(error) {
    this.onState?.(error?.message || "The transfer failed");
    this.close();
  }

  close(sendCancel = true) {
    if (this.closed) return;
    this.closed = true;
    if (this.poller) window.clearInterval(this.poller);
    if (this.candidateFlushTimer) window.clearTimeout(this.candidateFlushTimer);
    if (this.progressTimer) window.clearTimeout(this.progressTimer);
    if (this.senderProgressTimer) window.clearInterval(this.senderProgressTimer);
    if (this.connectionStatsTimer) window.clearInterval(this.connectionStatsTimer);
    this.clearDisconnectTimer();
    this.clearSignalingFailureTimer();
    if (this.writer) this.writer.abort().catch(() => undefined);
    this.memoryChunks = null;
    if (sendCancel) this.signal("cancel").catch(() => undefined);
    this.channel?.close();
    this.peer?.close();
  }
}
