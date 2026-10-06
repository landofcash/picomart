import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";

export default function TempoMarketShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
  seller?: boolean;
}) {
  return (
    <section className="seller-page space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <Button asChild variant="outline" className="print:hidden">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
