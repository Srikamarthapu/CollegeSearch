"use client";

import {
  Bookmark,
  Compass,
  Gauge,
  GraduationCap,
  Menu,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthAccountControl } from "./auth/AuthAccountControl";

const navigation = [
  { href: "/explore", label: "Explore", icon: Search },
  { href: "/majors", label: "Fields", icon: GraduationCap },
  { href: "/match", label: "Match", icon: Sparkles },
  { href: "/chances", label: "Chances", icon: Gauge },
  { href: "/saved", label: "Saved", icon: Bookmark },
];

export function SiteHeader({ savedCount = 0 }: { savedCount?: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const menuButton = menuButtonRef.current;
    const mobileNavigation = mobileNavigationRef.current;

    menuButton?.focus();

    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        menuButton?.focus();
        return;
      }

      if (event.key !== "Tab") return;

      const navigationControls = Array.from(
        mobileNavigation?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const focusableControls = menuButton
        ? [menuButton, ...navigationControls]
        : navigationControls;

      if (focusableControls.length === 0) return;

      const firstControl = focusableControls[0];
      const lastControl = focusableControls[focusableControls.length - 1];
      const activeControl = document.activeElement;
      const focusIsContained = focusableControls.some(
        (control) => control === activeControl,
      );

      if (
        event.shiftKey &&
        (activeControl === firstControl || !focusIsContained)
      ) {
        event.preventDefault();
        lastControl.focus();
      } else if (
        !event.shiftKey &&
        (activeControl === lastControl || !focusIsContained)
      ) {
        event.preventDefault();
        firstControl.focus();
      }
    };

    document.addEventListener("keydown", handleMenuKeyDown);
    return () => document.removeEventListener("keydown", handleMenuKeyDown);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Link className="brand" href="/" aria-label="CollegeSearch home">
        <span className="brand-mark" aria-hidden="true">
          <Compass size={19} strokeWidth={1.8} />
        </span>
        <span className="brand-wordmark">CollegeSearch</span>
      </Link>

      <div className="header-actions">
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === pathname || pathname.startsWith(`${href}/`);

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
          ref={menuButtonRef}
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
              tabIndex={-1}
              aria-label="Close navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
              }}
            />
            <motion.nav
              ref={mobileNavigationRef}
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
                  aria-current={
                    href === pathname || pathname.startsWith(`${href}/`)
                      ? "page"
                      : undefined
                  }
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
