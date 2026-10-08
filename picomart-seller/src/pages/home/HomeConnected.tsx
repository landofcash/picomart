import { Link } from "react-router-dom";
import { ArrowRight, PackagePlus, ShoppingBag, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import TempoCatalogsPage from "@/pages/TempoCatalogsPage";

export default function HomeConnected() {
  return (
    <div className="seller-page space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Your seller portal
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your products, storefronts, and orders.
          </p>
        </div>
        <Button asChild>
          <Link to="/edit-product-catalogue">
            <PackagePlus className="h-4 w-4" />
            Create catalog
          </Link>
        </Button>
      </header>
      <TempoCatalogsPage embedded />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            to: "/my-orders",
            Icon: ShoppingBag,
            title: "Manage orders",
            text: "View customer details and keep deliveries moving.",
          },
          {
            to: "/storefronts",
            Icon: Store,
            title: "Your storefronts",
            text: "Create, preview, and update your online shops.",
          },
        ].map(({ to, Icon, title, text }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {text}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}
