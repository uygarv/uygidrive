import Link from "next/link";
import { FileQuestionIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function NotFound() {
  return <main className="flex min-h-svh flex-col p-5"><Brand /><Empty className="m-auto max-w-lg"><EmptyHeader><EmptyMedia variant="icon"><FileQuestionIcon /></EmptyMedia><EmptyTitle>We can’t find that page</EmptyTitle><EmptyDescription>The link may be out of date, or the page may have moved.</EmptyDescription></EmptyHeader><EmptyContent><Button nativeButton={false} render={<Link href="/" />}>Back home</Button></EmptyContent></Empty></main>;
}
