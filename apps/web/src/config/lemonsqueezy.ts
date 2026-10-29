import { lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";
import { lemonSqueezyMissing } from "@/lib/connections";

/** Thrown when a page or action needs Lemon Squeezy and it is not connected. */
export class LemonSqueezyNotConnectedError extends Error {
  constructor(readonly missing: string[]) {
    super(
      `Lemon Squeezy is not connected: store ${missing.join(", ")} as Orun secrets and redeploy.`,
    );
    this.name = "LemonSqueezyNotConnectedError";
  }
}

/**
 * Ensures that required environment variables are set and sets up the Lemon
 * Squeezy JS SDK. Throws LemonSqueezyNotConnectedError if any are missing
 * (upstream threw a plain Error naming the .env file), or an error if the
 * SDK reports one.
 */
export function configureLemonSqueezy() {
  const missingVars = lemonSqueezyMissing();

  if (missingVars.length > 0) {
    throw new LemonSqueezyNotConnectedError(missingVars);
  }

  lemonSqueezySetup({
    apiKey: process.env.LEMONSQUEEZY_API_KEY,
    onError: (error) => {
      // eslint-disable-next-line no-console -- allow logging
      console.error(error);
      throw new Error(`Lemon Squeezy API error: ${error.message}`);
    },
  });
}
