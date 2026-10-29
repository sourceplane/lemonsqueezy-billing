import { getSubscriptionURLs } from "@/app/actions";
import { type NewSubscription } from "@/db";
import { isLemonSqueezyConnected } from "@/lib/connections";
import { SubscriptionActionsDropdown } from "./actions-dropdown";

export async function SubscriptionActions({
  subscription,
}: {
  subscription: NewSubscription;
}) {
  if (
    subscription.status === "expired" ||
    subscription.status === "cancelled" ||
    subscription.status === "unpaid" ||
    // The customer-portal links come from Lemon Squeezy.
    !isLemonSqueezyConnected()
  ) {
    return null;
  }

  const urls = await getSubscriptionURLs(subscription.lemonSqueezyId);

  return (
    <SubscriptionActionsDropdown subscription={subscription} urls={urls} />
  );
}
