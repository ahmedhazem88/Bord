import { PrismaClient, Prisma } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Runs `fn` inside a transaction with the Postgres session variable
 * app.current_entity_id set for its duration, so row-level-security policies
 * (spec section 9.4) scope every query to that tenant — independent of
 * whether the application code itself remembers to filter by entityId.
 *
 * Platform-level operations (no entity context, e.g. entity onboarding) call
 * withoutTenantContext instead, which explicitly documents the absence of
 * scoping rather than silently running unscoped.
 */
export async function withTenantContext<T>(
  entityId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_entity_id', ${entityId}, true)`;
    return fn(tx);
  });
}

export async function withoutTenantContext<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => fn(tx));
}

/**
 * Like withTenantContext, but also sets app.current_user_id so RLS's narrow
 * self-access branch (Capacity: "see your own rows across every entity")
 * applies. Use for endpoints scoped to the caller's own profile rather than
 * to a single entity, e.g. "my capacities across all entities".
 */
export async function withUserContext<T>(userId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  });
}

/**
 * Platform Admin's onboarding/monitoring surface (PRD section 2): visibility
 * into the Entity registry itself (legal name, registration number,
 * verification status — administrative metadata) but NOT into any entity's
 * governance data. Only the Entity table's RLS policy checks
 * app.is_platform_admin; Capacity/Resolution/Meeting/Vote/Document policies
 * never do, so this context grants no access to governance records.
 */
export async function withPlatformAdminContext<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_platform_admin', 'true', true)`;
    return fn(tx);
  });
}
