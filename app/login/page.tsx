"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { signIn, requestPasswordReset, type AuthState } from "./actions";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { Mark, PartnerStrip, PRODUCT_NAME } from "@/components/Brand";

/**
 * Lives inside the <form> on purpose - useFormStatus only reports on the form
 * it is nested within.
 */
function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending} className="w-full">
      {pending ? "Working…" : label}
    </Button>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "reset">("signin");

  const [signInState, signInAction] = useFormState<AuthState, FormData>(signIn, null);
  const [resetState, resetAction] = useFormState<AuthState, FormData>(
    requestPasswordReset,
    null
  );

  const state = mode === "signin" ? signInState : resetState;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex w-fit">
            <Mark size={44} rounded="xl" />
          </span>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">{PRODUCT_NAME}</h1>
          <p className="mt-1 text-body text-ink-muted">
            {mode === "signin" ? "Sign in to your queue" : "Reset your password"}
          </p>
        </div>

        <Card className="p-6">
          {mode === "signin" ? (
            <form action={signInAction} className="space-y-4">
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </Field>

              <Field label="Password" htmlFor="password">
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>

              <SubmitButton label="Sign in" />
            </form>
          ) : (
            <form action={resetAction} className="space-y-4">
              <Field
                label="Email"
                htmlFor="reset-email"
                hint="We'll email you a link to set a new password."
              >
                <Input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </Field>

              <SubmitButton label="Send reset link" />
            </form>
          )}

          {state?.error && (
            <div className="mt-4">
              <Notice tone="danger">{state.error}</Notice>
            </div>
          )}
          {state?.message && (
            <div className="mt-4">
              <Notice tone="success">{state.message}</Notice>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "reset" : "signin")}
            className="mt-4 w-full rounded-control py-1 text-center text-small text-ink-muted
                       underline-offset-2 transition-colors duration-fast hover:text-accent
                       hover:underline"
          >
            {mode === "signin" ? "Forgot your password?" : "Back to sign in"}
          </button>
        </Card>

        <PartnerStrip className="mt-6" />

        <p className="mt-4 text-center text-caption text-ink-subtle">
          Trouble signing in? Ask an admin to send you a reset link.
        </p>
      </div>
    </main>
  );
}
