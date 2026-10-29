import { Button } from "@lemonsqueezy/wedges";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserSubscriptions } from "@/app/actions";
import { ChangePlans } from "@/components/dashboard/billing/plans/change-plans";
import { DashboardContent } from "@/components/dashboard/content";
import { PageTitleAction } from "@/components/dashboard/page-title-action";
import { getDb, plans } from "@/db";
import { isValidSubscription } from "@/lib/utils";
import { type SubscriptionStatusType } from "@/types/types";

export const dynamic = "force-dynamic";

export default async function ChangePlansPage({
  params,
}: {
  // A promise since Next.js 15.
  params: Promise<{ id?: string }>;
}) {
  const { id } = await params;
  if (!id) {
    notFound();
  }
  const currentPlanId = parseInt(id);

  if (isNaN(currentPlanId)) {
    notFound();
  }

  // Get user subscriptions to check the current plan.
  const userSubscriptions = await getUserSubscriptions();

  if (!userSubscriptions.length) {
    notFound();
  }

  const isCurrentPlan = userSubscriptions.find(
    (s) =>
      s.planId === currentPlanId &&
      isValidSubscription(s.status as SubscriptionStatusType),
  );

  if (!isCurrentPlan) {
    redirect("/dashboard/billing");
  }

  const db = await getDb();
  const currentPlan = await db
    .select()
    .from(plans)
    .where(eq(plans.id, currentPlanId));

  if (!currentPlan.length) {
    notFound();
  }

  return (
    <DashboardContent
      title="Change Plans"
      subtitle="Choose a plan that works for you."
      action={
        <div className="flex items-center gap-4">
          <Button asChild variant="tertiary">
            <Link href="/dashboard/billing">Back to Billing</Link>
          </Button>
          <PageTitleAction />
        </div>
      }
    >
      <ChangePlans currentPlan={currentPlan.at(0)} />
    </DashboardContent>
  );
}
