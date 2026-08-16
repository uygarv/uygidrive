"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRightIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeMenu } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { driveApi } from "@/lib/drive-api";

export function AuthPage({ mode }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const isLogin = mode === "login";
  const reduceMotion = useReducedMotion();
  const heading = isLogin ? "Welcome back" : "Create your drive";
  const description = isLogin ? "Sign in to continue where you left off." : "Start with a simple, private home for your files.";

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    try {
      setIsPending(true);
      await (isLogin ? driveApi.signIn(email, password) : driveApi.signUp(email, password));
      router.push("/drive");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replace("Firebase: ", "") : "Unable to continue.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-svh bg-muted/35">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Brand /><ThemeMenu /></header>
      <main className="flex min-h-[calc(100svh-72px)] items-center justify-center px-5 pb-14">
        <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.25 }} className="w-full max-w-sm">
          <Card className="shadow-sm"><CardHeader className="text-center"><CardTitle className="text-xl">{heading}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>
            <form onSubmit={onSubmit} noValidate>
              <FieldGroup>
                <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="email">Email address</FieldLabel><Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required aria-invalid={Boolean(error)} /></Field>
                <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} minLength={6} required aria-invalid={Boolean(error)} /><FieldDescription>Password must be at least 6 characters.</FieldDescription></Field>
                {error && <FieldError>{error}</FieldError>}
                <Field><Button type="submit" size="lg" disabled={isPending}>{isPending && <Spinner data-icon="inline-start" />}{isLogin ? "Sign in" : "Create account"}<ArrowRightIcon data-icon="inline-end" /></Button><FieldDescription className="text-center">{isLogin ? "New to UygiDrive?" : "Already have an account?"} <Link href={isLogin ? "/signup" : "/login"}> {isLogin ? "Create an account" : "Sign in"}</Link></FieldDescription></Field>
              </FieldGroup>
            </form>
          </CardContent></Card>
        </motion.div>
      </main>
    </div>
  );
}
