import { CitrusIcon } from "lucide-react";
import Link from "next/link";
import { signIn } from "@/auth";
import { ConnectNotice } from "@/components/connect-notice";
import { GithubIcon } from "@/components/icons/github";
import { LemonSqueezyIcon } from "@/components/icons/lemonsqueezy";
import { SubmitButton } from "@/components/submit-button";
import { appUrl, githubMissing } from "@/lib/connections";
import { SITE_NAME } from "@/lib/site";

// The proxy decides who sees this page; what it shows depends on whether a
// GitHub OAuth app is connected, so it is rendered per request.
export const dynamic = "force-dynamic";

export default function Home() {
  const missing = githubMissing();

  return (
    <div className="grid min-h-lvh auto-rows-[1fr_auto] grid-cols-1 items-center justify-center gap-10 lg:auto-rows-auto lg:grid-cols-2">
      <main className="container w-full max-w-xl space-y-8 py-24 text-center lg:text-start">
        <div className="inline-flex size-20 items-center justify-center rounded-3xl border border-surface-100 text-primary shadow-wg-xs backdrop-blur-sm">
          <CitrusIcon size={32} strokeWidth={1.5} />
        </div>

        <h1 className="text-balance text-3xl text-surface-900 lg:text-4xl">
          Sign in to {SITE_NAME}
        </h1>

        <p className="text-balance text-lg text-surface-500">
          {SITE_NAME} is a Next.js billing app template powered by Lemon
          Squeezy.
        </p>

        {missing.length > 0 ? (
          <>
            <ConnectNotice title="Sign-in is not connected" missing={missing}>
              <p>
                They are the client id and a client secret of a GitHub OAuth
                app whose callback URL is{" "}
                <code>{`${appUrl()}/api/auth/callback/github`}</code>.
              </p>
            </ConnectNotice>

            <p className="text-surface-500">
              Until then the dashboard is open as a preview:{" "}
              <Link href="/dashboard/billing" className="underline">
                see the billing page
              </Link>
              .
            </p>
          </>
        ) : null}

        <form
          className="pt-2"
          action={async () => {
            "use server";
            await signIn("github");
          }}
        >
          <SubmitButton
            before={<GithubIcon />}
            className="py-2.5 text-base"
            shape="pill"
            variant="primary"
            disabled={missing.length > 0}
          >
            Sign in with GitHub
          </SubmitButton>
        </form>
      </main>

      <aside className="relative isolate flex size-full flex-col items-center justify-center gap-10 overflow-hidden p-3 text-surface-900 lg:p-6">
        <div className="flex size-full flex-col items-center justify-center gap-10 rounded-xl p-8 pt-10 lg:bg-surface-100/70">
          <a
            className="mt-auto text-black"
            href="https://www.lemonsqueezy.com"
            rel="noreferrer noopener"
            target="_blank"
          >
            <LemonSqueezyIcon className="h-6 lg:h-8" />
          </a>

          <footer className="mt-auto flex flex-wrap items-center justify-center gap-4 text-sm text-surface-400">
            <a
              href="https://github.com/lmsqueezy/nextjs-billing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-surface-400 hover:text-surface-600 hover:underline"
            >
              View on GitHub ↗
            </a>

            <span>&bull;</span>

            <a
              href="https://docs.lemonsqueezy.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-surface-400 hover:text-surface-600 hover:underline"
            >
              Lemon Squeezy Docs ↗
            </a>
          </footer>
        </div>
      </aside>
    </div>
  );
}
