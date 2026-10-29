import type { Metadata } from "next";
import Script from "next/script";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Toaster } from "@/components/toaster";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Dashboard | ${SITE_NAME}`,
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {/* Load the Lemon Squeezy's Lemon.js script before the page is interactive. */}
      <Script
        src="https://app.lemonsqueezy.com/js/lemon.js"
        strategy="beforeInteractive"
      />

      <div className="h-lvh text-sm leading-6 text-surface-500 md:grid md:grid-cols-[270px_1fr]">
        <Sidebar />
        {children}
      </div>
      <Toaster position="bottom-right" />
    </>
  );
}
