import Link from "next/link";

/* The reporting section's own two-way switch.
 *
 * Reporting and setup are different kinds of work and should not share a
 * drawer. Rates, the PIN and backup are configured once and then left alone.
 * The day book is his evening reconciliation - he counts the cash against it
 * most nights - and monthly figures are what you read when you want to know
 * how the shop is doing. Those two belong together, and nowhere near a screen
 * that can change a price.
 */
const TABS = [
  { href: "/daybook", label: "Day book", hint: "Money in, by day" },
  { href: "/reports", label: "Monthly figures", hint: "How the month went" },
];

export function ReportsNav({ current }: { current: "daybook" | "reports" }) {
  return (
    <div className="no-print mb-4 flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const active =
          (current === "daybook" && tab.href === "/daybook") ||
          (current === "reports" && tab.href === "/reports");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm ${
              active
                ? "bg-ink text-bone"
                : "border border-line bg-white text-ink hover:border-gold hover:bg-gold-soft"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
