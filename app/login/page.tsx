"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { signIn, requestPasswordReset, type AuthState } from "./actions";

/**
 * Lives inside the <form> on purpose - useFormStatus only reports on the form
 * it is nested within.
 */
function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white
                 transition hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm " +
  "outline-none focus:border-navy focus:ring-1 focus:ring-navy";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "reset">("signin");

  const [signInState, signInAction] = useFormState<AuthState, FormData>(signIn, null);
  const [resetState, resetAction] = useFormState<AuthState, FormData>(
    requestPasswordReset,
    null
  );

  const state = mode === "signin" ? signInState : resetState;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-navy">Daily Gamba</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "signin" ? "Sign in to your dashboard" : "Reset your password"}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {mode === "signin" ? (
            <form action={signInAction} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className={inputClass}
                />
              </div>

              <SubmitButton label="Sign in" />
            </form>
          ) : (
            <form action={resetAction} className="space-y-4">
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={inputClass}
                />
                <p className="mt-2 text-xs text-slate-500">
                  We&apos;ll email you a link to set a new password.
                </p>
              </div>

              <SubmitButton label="Send reset link" />
            </form>
          )}

          {state?.error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
          {state?.message && (
            <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              {state.message}
            </p>
          )}

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "reset" : "signin")}
            className="mt-4 w-full text-center text-sm text-slate-500 underline
                       underline-offset-2 hover:text-navy"
          >
            {mode === "signin" ? "Forgot your password?" : "Back to sign in"}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Trouble signing in? Ask an admin to send you a reset link.
        </p>
      </div>
    </main>
  );
}
