"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

/**
 * Login / MFA. Two-step form (credentials, then MFA code) rather than one
 * long form -- MFA is mandatory for every bord user (ARCHITECTURE.md
 * Section 8), so it's modeled as its own deliberate step, not a bolted-on
 * field, consistent with the same "separable step, not one blocking form"
 * principle Journey I applies to onboarding (PRD.md Section 9).
 */
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [email, setEmail] = useState("");

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-3xl font-extrabold tracking-tight text-ink-900">bord</span>
          <p className="mt-2 text-sm text-ink-500">Egyptian corporate governance, managed.</p>
        </div>

        <Card className="p-6">
          {step === "credentials" ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setStep("mfa");
              }}
            >
              <Input
                id="email"
                label="Email"
                type="email"
                placeholder="you@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input id="password" label="Password" type="password" required />
              <Button type="submit" fullWidth className="mt-2">
                Continue
              </Button>
            </form>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                router.push("/capacity-switch");
              }}
            >
              <div>
                <p className="text-sm font-semibold text-ink-900">Verify it&apos;s you</p>
                <p className="mt-1 text-sm text-ink-500">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
              <Input
                id="mfa"
                label="Verification code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                required
                className="text-center text-lg tracking-[0.5em]"
              />
              <Button type="submit" fullWidth className="mt-2">
                Verify and continue
              </Button>
              <button
                type="button"
                onClick={() => setStep("credentials")}
                className="text-sm font-semibold text-ink-500 hover:text-ink-900"
              >
                Back
              </button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
