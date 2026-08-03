"use client";

import {
  Bookmark,
  Compass,
  Database,
  Menu,
  Search,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthAccountControl } from "./auth/AuthAccountControl";

const navigation = [
  { href: "/explore", label: "Explore", icon: Search },
  { href: "/methodology", label: "How it works", icon: Compass },
  { href: "/data-sources", label: "Sources", icon: Database },
  { href: "/explore?saved=1", label: "Saved", icon: Bookmark },
];

export function SiteHeader({ savedCount = 0 }: { savedCount?: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="CollegeSearch home">
        <span className="brand-mark" aria-hidden="true">
          <Compass size={19} strokeWidth={1.8} />
        </span>
        <span className="brand-wordmark">CollegeSearch</span>
      </Link>

      <div className="header-actions">
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const isActive = href === pathname;

            return (
              <Link
                href={href}
                key={href}
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "is-active" : undefined}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
                {label === "Saved" && savedCount > 0 ? (
                  <span className="nav-count">{savedCount}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <AuthAccountControl />

        <button
          className="menu-button"
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <>
            <motion.button
              className="mobile-nav-scrim"
              type="button"
              aria-label="Close navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.nav
              id="mobile-navigation"
              className="mobile-nav"
              aria-label="Mobile navigation"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.985 }}
            >
              <span className="nav-kicker">Navigate</span>
              {navigation.map(({ href, label, icon: Icon }) => (
                <Link
                  href={href}
                  key={href}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                  {label === "Saved" ? (
                    <small>{savedCount} on this device</small>
                  ) : null}
                </Link>
              ))}
            </motion.nav>
          </>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
