"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDownIcon, ArrowRightIcon, CheckIcon, CloudIcon, FolderLockIcon, Share2Icon, UploadCloudIcon, UserPlusIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeMenu } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  [UploadCloudIcon, "Upload without friction", "Drop files into your drive, track their progress, and keep working while transfers finish."],
  [FolderLockIcon, "A private place for your files", "Every file stays scoped to your account with a clear view of your storage allowance."],
  [Share2Icon, "Share on your terms", "Create a private link or switch an individual file to public access whenever you need to."],
];

const howItWorks = [
  [UserPlusIcon, "Create an account", "Sign up and get a personal drive in moments."],
  [UploadCloudIcon, "Upload your files", "Add documents, photos, and videos from any device."],
  [Share2Icon, "Manage and share", "Organize your work and choose who can access it."],
];

function SessionActions({ hasSession, placement, transition }) {
  const isHeader = placement === "header";

  return (
    <AnimatePresence initial={false} mode="wait">
      {hasSession ? (
        <motion.div key="signed-in" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={transition}>
          <Button nativeButton={false} size={isHeader ? "default" : "lg"} render={<Link href="/drive" />}>Go to your Drive<ArrowRightIcon data-icon="inline-end" /></Button>
        </motion.div>
      ) : isHeader ? (
        <motion.div key="guest" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={transition} className="flex items-center gap-2">
          <Button nativeButton={false} variant="ghost" render={<Link href="/login" />}>Sign in</Button>
          <Button nativeButton={false} render={<Link href="/signup" />}>Get started<ArrowRightIcon data-icon="inline-end" /></Button>
        </motion.div>
      ) : (
        <motion.div key="guest" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={transition} className="flex flex-wrap gap-3">
          <Button nativeButton={false} size="lg" render={<Link href="/signup" />}>Create your drive<ArrowRightIcon data-icon="inline-end" /></Button>
          <Button nativeButton={false} size="lg" variant="outline" render={<Link href="/login" />}>Sign in to your drive</Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MarketingHome({ hasSession }) {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const cloudY = useTransform(scrollY, [0, 700], [0, 72]);
  const cloudTilt = useTransform(scrollY, [0, 700], [0, -10]);
  const cloudTurn = useTransform(scrollY, [0, 700], [0, 5]);
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.35, ease: "easeOut" };
  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Brand hideIconOnMobile />
        <div className="flex items-center gap-2">
          <ThemeMenu />
          <SessionActions hasSession={hasSession} placement="header" transition={transition} />
        </div>
      </header>
      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:pb-28 lg:pt-24">
          <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="relative isolate flex flex-col gap-7 py-10">
            <motion.div aria-hidden="true" className="pointer-events-none absolute -left-48 -top-52 z-0 size-[34rem] [transform-style:preserve-3d] sm:-left-56 sm:-top-56 sm:size-[40rem]" style={reduceMotion ? undefined : { y: cloudY, rotateX: cloudTilt, rotateY: cloudTurn, transformPerspective: 1000 }}><CloudIcon className="size-full -rotate-[18deg] stroke-1 text-primary/[0.055]" /></motion.div>
            <div className="relative z-10 flex flex-col gap-5">
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">Simpliest access to your files.</h1>
              <p className="max-w-xl text-lg leading-8 text-muted-foreground">UygiDrive is a boutique place to store your files in the easiest way possible.</p>
            </div>
            <div className="relative z-10"><SessionActions hasSession={hasSession} placement="hero" transition={transition} /></div>
            <div className="relative z-10 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {["2 GB included", "Private by default", "No credit card"].map((item) => <span className="inline-flex items-center gap-1.5" key={item}><CheckIcon className="size-4 text-primary" />{item}</span>)}
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...transition, delay: reduceMotion ? 0 : 0.08 }}>
            <section aria-labelledby="how-it-works-title" className="mx-auto max-w-md py-3 lg:mx-0 lg:pl-6">
              <h2 id="how-it-works-title" className="text-2xl font-semibold tracking-tight">How it works</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Everything you need to start storing and sharing files, without the clutter.</p>
              <ol className="mt-7 flex flex-col">
                {howItWorks.map(([Icon, title, description], index) => (
                  <li className="relative pb-10 last:pb-0" key={title}>
                    <motion.div whileHover={reduceMotion ? {} : { x: 3 }} transition={transition} className="group grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-4">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background text-primary shadow-xs"><Icon className="size-4" /></span>
                      <span className="flex flex-col gap-0.5 pt-0.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">0{index + 1}</span><span className="text-base font-medium group-hover:text-primary">{title}</span><span className="text-sm leading-5 text-muted-foreground">{description}</span></span>
                    </motion.div>
                    {index < howItWorks.length - 1 && <><span aria-hidden="true" className="absolute left-[17px] top-9 bottom-0 border-l border-dashed border-muted-foreground/60" /><ArrowDownIcon aria-hidden="true" className="absolute left-3 top-[calc(50%+1.125rem)] size-3 -translate-y-1/2 text-muted-foreground/60" /></>}
                  </li>
                ))}
              </ol>
            </section>
          </motion.div>
        </section>
        <section className="border-y bg-muted/35">
          <div className="mx-auto grid max-w-6xl gap-4 px-5 py-16 sm:px-8 md:grid-cols-3">
            {features.map(([Icon, title, description], index) => (
              <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ ...transition, delay: reduceMotion ? 0 : index * 0.06 }} key={title}>
                <Card size="sm" className="h-full bg-background">
                  <CardHeader><span className="mb-2 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="size-4" /></span><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8"><Brand hideIconOnMobile /><span>Simple storage for your important work.</span></footer>
    </div>
  );
}
