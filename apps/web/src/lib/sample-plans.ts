import { type NewPlan } from "@/db";

// What the billing page shows while Lemon Squeezy is not connected: two
// plans shaped like the ones syncPlans() copies from a store, so the page
// renders its real layout. Their sign-up buttons are disabled; nothing here
// is written to the database.
export const SAMPLE_PLANS: NewPlan[] = [
  {
    id: -1,
    productId: 0,
    productName: "Sample product",
    variantId: -1,
    name: "Monthly",
    description:
      "<p>A sample subscription. Connect Lemon Squeezy to sell your own.</p>",
    price: "900",
    isUsageBased: false,
    interval: "month",
    intervalCount: 1,
    trialInterval: null,
    trialIntervalCount: null,
    sort: 1,
  },
  {
    id: -2,
    productId: 0,
    productName: "Sample product",
    variantId: -2,
    name: "Yearly",
    description: "<p>The same sample, billed once a year.</p>",
    price: "9000",
    isUsageBased: false,
    interval: "year",
    intervalCount: 1,
    trialInterval: null,
    trialIntervalCount: null,
    sort: 2,
  },
];
