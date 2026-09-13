import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/components/SiteHeader.tsx", import.meta.url),
  "utf8",
);

test("the mobile navigation behaves as a contained modal surface", () => {
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /surface\.inert = true/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /className="mobile-nav-close"/);
  assert.match(source, /querySelectorAll<HTMLElement>\(focusableSelector\)/);
  assert.match(
    source,
    /setMenuOpen\(false\);[\s\S]*requestAnimationFrame\([\s\S]*menuButton.*\.focus\(\)/,
    "focus restoration waits until inert cleanup can complete",
  );
});
