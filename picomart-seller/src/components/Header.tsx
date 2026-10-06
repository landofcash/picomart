import { Link, useLocation } from "react-router-dom";
import {
  Home,
  ShoppingCart,
  Store,
  Settings,
} from "lucide-react";
import WalletAuth from "./WalletAuth";
import ThemePicker from "./ThemePicker";
import { useWallet } from "@/context/WalletContext";

export default function Header() {
  const { walletAddress } = useWallet(),
    { pathname } = useLocation();
  const links = [
    { to: "/", label: "Dashboard", Icon: Home, paths: ["/"] },
    {
      to: "/my-orders",
      label: "My orders",
      Icon: ShoppingCart,
      paths: ["/my-orders", "/order-details"],
    },
    {
      to: "/storefronts",
      label: "Storefronts",
      Icon: Store,
      paths: ["/storefronts"],
    },
  ];
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-md print:hidden">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-3 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-5">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
          <Link
            to="/"
            aria-label="Picomart seller dashboard"
            className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <img
              src="/logo.svg"
              alt=""
              width="36"
              height="36"
              className="portal-logo h-7 w-7 sm:h-9 sm:w-9"
            />
          </Link>
          <div className="hidden min-w-0 min-[400px]:block">
            <Link
              to="/"
              className="block whitespace-nowrap bg-gradient-to-br from-primary via-primary/85 to-primary/65 bg-clip-text text-sm font-black tracking-tight text-transparent min-[400px]:text-base sm:text-xl"
            >
              Picomart <span className="hidden sm:inline">Portal</span>
            </Link>
          </div>
        </div>
        {walletAddress && (
          <nav
            aria-label="Seller navigation"
            className="order-3 col-span-2 mt-3 grid min-w-0 grid-cols-3 gap-1 border-t pt-3 lg:order-2 lg:col-span-1 lg:mt-0 lg:border-0 lg:pt-0"
          >
            {links.map(({ to, label, Icon, paths }) => {
              const selected = paths.includes(pathname);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={selected ? "page" : undefined}
                  className={
                    "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-xs xl:flex-row xl:gap-2 xl:text-sm " +
                    (selected
                      ? "bg-primary/8 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground")
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        )}
        <div className="order-2 flex items-center justify-end gap-1 lg:order-3">
          <ThemePicker />
          <Link
            to="/settings"
            aria-label="Settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-primary " +
              (pathname === "/settings"
                ? "bg-primary/8 text-primary"
                : "text-muted-foreground hover:bg-muted")
            }
          >
            <Settings className="h-5 w-5" />
          </Link>
          <WalletAuth />
        </div>
      </div>
    </header>
  );
}
