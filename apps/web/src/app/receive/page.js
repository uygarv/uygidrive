import { Suspense } from "react";
import { DeviceTransferReceiver } from "@/components/device-transfer-receiver";

export const metadata = { title: "FileFly · UygiDrive", robots: { index: false, follow: false } };

export default function ReceivePage() {
  return <Suspense fallback={<main className="min-h-svh bg-muted/30" />}><DeviceTransferReceiver /></Suspense>;
}
