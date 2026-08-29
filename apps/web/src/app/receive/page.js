import { Suspense } from "react";
import { DeviceTransferReceiver } from "@/components/device-transfer-receiver";
import { brandTitle } from "@/config/brand";

export const metadata = { title: brandTitle("FileFly"), robots: { index: false, follow: false } };

export default function ReceivePage() {
  return <Suspense fallback={<main className="min-h-svh bg-muted/30" />}><DeviceTransferReceiver /></Suspense>;
}
