import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, organizations, subscriptions } from "@/db/schema";
import { TIERS, type AuditTier } from "./domain";

export interface SimulatedCheckoutResult {
  invoiceId: string;
  subscriptionId?: string;
}

/**
 * Test-mode billing. The interface mirrors what a Stripe Checkout/webhook flow
 * would call after a verified payment; no card data or live charge is involved.
 */
export async function runSimulatedCheckout({
  orgId,
  engagementId,
  tier,
}: {
  orgId: string;
  engagementId?: string | null;
  tier: AuditTier;
}): Promise<SimulatedCheckoutResult> {
  const details = TIERS[tier];
  const now = new Date();
  const isSubscription = details.cadence === "monthly";
  const periodEnd = isSubscription
    ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;

  const [invoice] = await db
    .insert(invoices)
    .values({
      orgId,
      engagementId: engagementId ?? null,
      kind: isSubscription ? "SUBSCRIPTION" : "ONE_TIME",
      tier,
      description: `${details.label} (${
        isSubscription ? "monthly subscription" : "one-time audit"
      }) — simulated test payment`,
      amountCents: details.priceCents,
      status: "PAID",
      provider: "SIMULATED",
      providerRef: `sim_${crypto.randomUUID()}`,
      paidAt: now,
      periodStart: now,
      periodEnd,
    })
    .returning();

  let subscriptionId: string | undefined;
  if (isSubscription) {
    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (existing) {
      subscriptionId = existing.id;
      await db
        .update(subscriptions)
        .set({ currentPeriodEnd: periodEnd, amountCents: details.priceCents })
        .where(eq(subscriptions.id, existing.id));
    } else {
      const [subscription] = await db
        .insert(subscriptions)
        .values({
          orgId,
          engagementId: engagementId ?? null,
          tier,
          status: "ACTIVE",
          amountCents: details.priceCents,
          currentPeriodEnd: periodEnd,
        })
        .returning();
      subscriptionId = subscription.id;
    }
    await db
      .update(organizations)
      .set({ plan: "MONITORING" })
      .where(eq(organizations.id, orgId));
  }

  return { invoiceId: invoice.id, subscriptionId };
}
