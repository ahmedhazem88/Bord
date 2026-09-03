import type { Prisma } from "@prisma/client";

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "profile";
}

/** Appends -2, -3, ... until the slug is free. Model must have a `publicSlug` unique column. */
export async function ensureUniqueSlug(
  tx: Prisma.TransactionClient,
  model: "user" | "entity",
  base: string,
  excludeId?: string,
): Promise<string> {
  const baseSlug = slugify(base);
  let candidate = baseSlug;
  let n = 2;
  // Small tables, small n — a loop is fine; avoids a fragile single query.
  for (;;) {
    const existing =
      model === "user"
        ? await tx.user.findUnique({ where: { publicSlug: candidate }, select: { id: true } })
        : await tx.entity.findUnique({ where: { publicSlug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${baseSlug}-${n}`;
    n += 1;
  }
}
