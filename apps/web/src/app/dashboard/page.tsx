import Link from "next/link";
import { DashboardContent } from "@/components/dashboard/content";
import { PageTitleAction } from "@/components/dashboard/page-title-action";
import { SetupWebhookButton } from "@/components/dashboard/setup-webhook-button";
import { ConnectNotice } from "@/components/connect-notice";
import { lemonSqueezyMissing, webhookUrl } from "@/lib/connections";
import { hasWebhook } from "../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  // Lemon Squeezy is asked about only once it is connected; until then the
  // page says what to connect instead of upstream's webhook setup.
  const missing = lemonSqueezyMissing();
  const hasWh = missing.length === 0 && Boolean(await hasWebhook());

  return (
    <DashboardContent title="Dashboard" action={<PageTitleAction />}>
      <p>
        This page is protected by the <code>auth</code> proxy. Navigate to
        the <Link href="/dashboard/billing">Billing page</Link> to get started.
      </p>

      {missing.length > 0 && (
        <ConnectNotice title="Lemon Squeezy is not connected" missing={missing}>
          <p>
            The API key and store id come from your Lemon Squeezy dashboard
            (Settings → API, Settings → Stores). The webhook secret is any
            string you choose: once connected, this page creates the webhook
            at <code>{webhookUrl()}</code> with it.
          </p>
        </ConnectNotice>
      )}

      {missing.length === 0 && !hasWh && (
        <>
          <h2>Webhook Setup</h2>

          <p>
            This app relies on webhooks to listen for changes made on Lemon
            Squeezy. This section is an example of how
            you'd use the Lemon Squeezy API to interact with webhooks.
          </p>

          <p className="mb-6">
            Configure the webhook on{" "}
            <a
              href="https://app.lemonsqueezy.com/settings/webhooks"
              target="_blank"
            >
              Lemon Squeezy
            </a>
            , or simply click the button below to do that automatically with the
            Lemon Squeezy SDK.
          </p>

          <SetupWebhookButton disabled={hasWh} />
        </>
      )}
    </DashboardContent>
  );
}
