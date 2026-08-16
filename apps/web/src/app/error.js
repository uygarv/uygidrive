"use client";

import { useEffect } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function Error({ error, reset }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="flex min-h-svh p-5"><Empty className="m-auto max-w-lg"><EmptyHeader><EmptyMedia variant="icon"><TriangleAlertIcon /></EmptyMedia><EmptyTitle>Something interrupted this page</EmptyTitle><EmptyDescription>Try again. If this persists, return to your drive and retry the action.</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={reset}>Try again</Button></EmptyContent></Empty></main>;
}
