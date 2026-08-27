import { authenticator } from "otplib";

/**
 * TOTP-based MFA (authenticator app), per spec section 9.2: Chairman,
 * Compliance Officer, and Platform Admin require a stronger factor than SMS.
 * Phase 1 supports authenticator-app TOTP; hardware-key (WebAuthn) is a
 * near-term hardening candidate, not built in this pass.
 */
export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

export function otpAuthUrl(secret: string, email: string): string {
  return authenticator.keyuri(email, "Bord Governance Platform", secret);
}

export function verifyMfaToken(secret: string, token: string): boolean {
  return authenticator.check(token, secret);
}
