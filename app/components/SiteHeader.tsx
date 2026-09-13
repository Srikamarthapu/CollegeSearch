"use client";

import {
  Bookmark,
  CalendarDays,
  CircleAlert,
  Gauge,
  GraduationCap,
  Menu,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Scale,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSavedColleges } from "./saved/SavedCollegesProvider";
import { AuthAccountControl } from "./auth/AuthAccountControl";
import { BrandMark } from "./BrandMark";

const navigation = [
  { href: "/explore", label: "Colleges", icon: Search },
  { href: "/majors", label: "Fields of study", icon: GraduationCap },
  { href: "/match", label: "Find my fit", icon: SlidersHorizontal },
  { href: "/chances", label: "Admissions", icon: Gauge },
  { href: "/compare", label: "Compare", icon: Scale },
  { href: "/saved", label: "My shortlist", icon: Bookmark },
  { href: "/plan", label: "My deadlines", icon: CalendarDays },
];

export function SiteHeader({ savedCount }: { savedCount?: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { ids: savedIds, syncPhase } = useSavedColleges();
  const pathname = usePathname();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationRef = useRef<HTMLDivElement>(null);
  const displayedSavedCount = savedCount ?? savedIds.length;
  const savedStatusLabel =
    syncPhase === "error"
      ? "Sync needs attention"
      : syncPhase === "syncing"
        ? "Waiting to sync"
        : syncPhase === "loading-account"
          ? "Checking account saves"
          : syncPhase === "synced"
            ? "Account list is up to date"
            : "Saved in this browser";

  const closeMenuAndRestoreFocus = () => {
    setMenuOpen(false);
    // The opener sits inside an inert header surface while the dialog is open.
    // Restore focus on the next frame, after the effect cleanup removes inert.
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  useEffect(() => {
    if (!menuOpen) return;

    const menuButton = menuButtonRef.current;
    const mobileNavigation = mobileNavigationRef.current;
    const backgroundSurfaces = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".site-header > .brand, .site-header > .header-actions, main, footer",
      ),
    );
    const priorInertState = backgroundSurfaces.map(
      (surface) => surface.inert,
    );
    const priorBodyOverflow = document.body.style.overflow;
    backgroundSurfaces.forEach((surface) => {
      surface.inert = true;
    });
    document.body.style.overflow = "hidden";

    const focusableSelector =
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirstControl = window.requestAnimationFrame(() => {
      mobileNavigation
        ?.querySelector<HTMLElement>(focusableSelector)
        ?.focus();
    });

    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        window.requestAnimationFrame(() => menuButton?.focus());
        return;
      }

      if (event.key !== "Tab") return;

      const navigationControls = Array.from(
        mobileNavigation?.querySelectorAll<HTMLElement>(focusableSelector) ??
          [],
      );
      const focusableControls = navigationControls;

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
    return () => {
      window.cancelAnimationFrame(focusFirstControl);
      document.removeEventListener("keydown", handleMenuKeyDown);
      backgroundSurfaces.forEach((surface, index) => {
        surface.inert = priorInertState[index];
      });
      document.body.style.overflow = priorBodyOverflow;
    };
  }, [menuOpen]);

  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Link className="brand" href="/" aria-label="CollegeSearch home">
        <BrandMark />
        <span className="brand-wordmark">CollegeSearch</span>
      </Link>

      <div className="header-actions">
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === pathname || (href === "/explore" && pathname === "/") || pathname.startsWith(`${href}/`);

            return (
              <Link
                href={href}
                key={href}
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "is-active" : undefined}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
                {href === "/saved" && displayedSavedCount > 0 ? (
                  <span className="nav-count">{displayedSavedCount}</span>
                ) : null}
                {href === "/saved" && syncPhase === "error" ? (
                  <span className="nav-sync-state is-error">
                    <CircleAlert size={15} aria-hidden="true" />
                    <span className="sr-only">{savedStatusLabel}</span>
                  </span>
                ) : href === "/saved" &&
                  (syncPhase === "syncing" ||
                    syncPhase === "loading-account") ? (
                  <span className="nav-sync-state is-pending">
                    <RefreshCw size={14} aria-hidden="true" />
                    <span className="sr-only">{savedStatusLabel}</span>
                  </span>
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
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenuAndRestoreFocus}
            />
            <motion.div
              ref={mobileNavigationRef}
              id="mobile-navigation"
              className="mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="Site navigation"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.985 }}
            >
              <div className="mobile-nav-heading">
                <span className="nav-kicker">Navigate</span>
                <button
                  className="mobile-nav-close"
                  type="button"
                  aria-label="Close navigation"
                  onClick={closeMenuAndRestoreFocus}
                >
                  <X size={19} aria-hidden="true" />
                </button>
              </div>
              <nav aria-label="Mobile navigation">
                {navigation.map(({ href, label, icon: Icon }) => (
                  <Link
                    href={href}
                    key={href}
                    aria-current={
                      href === pathname || (href === "/explore" && pathname === "/") || pathname.startsWith(`${href}/`)
                        ? "page"
                        : undefined
                    }
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                    {href === "/saved" ? (
                      <small>
                        {displayedSavedCount} saved · {savedStatusLabel.toLowerCase()}
                      </small>
                    ) : null}
                  </Link>
                ))}
              </nav>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
