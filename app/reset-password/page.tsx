"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { setNewPassword, type ResetState } from "./actions";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { Mark } from "@/components/Brand";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending} className="w-full">
      {pending ? "Saving…" : "Set new password"}
    </Button>
  );
}

/**
 * Where the emailed reset link lands.
 *
 * Reached with a one-time session already established by /auth/callback, so
 * there is nothing to verify here beyond the new password itself.
 */
export default function ResetPasswordPage() {
  const [state, formAction] = useFormState<ResetState, FormData>(setNewPassword, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex w-fit">
            <Mark size={44} rounded="xl" />
          </span>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">
            Choose a new password
          </h1>
          <p className="mt-1 text-body text-ink-muted">
            You&rsquo;ll be signed in straight after.
          </p>
        </div>

        <Card className="p-6">
          <form action={formAction} className="space-y-4">
            <Field
              label="New password"
              htmlFor="password"
              hint="At least 10 characters. A few unrelated words beats a short one with symbols."
            >
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                autoFocus
              />
            </Field>

            <Field label="Type it again" htmlFor="confirm">
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
              />
            </Field>

            <Submit />
          </form>

          {state?.error && (
            <div className="mt-4">
              <Notice tone="danger">{state.error}</Notice>
            </div>
          )}

          <p className="mt-4 text-center text-small">
            <Link
              href="/login"
              className="text-ink-muted underline-offset-2 hover:text-accent hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
