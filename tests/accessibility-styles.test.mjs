import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const globals = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const chances = await readFile(
  new URL("../app/chances/chances.module.css", import.meta.url),
  "utf8",
);
const auth = await readFile(
  new URL("../app/components/auth/auth.module.css", import.meta.url),
  "utf8",
);
const match = await readFile(
  new URL("../app/match/match.module.css", import.meta.url),
  "utf8",
);

function cssVariable(name) {
  const match = globals.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `--${name} is defined`);
  return match[1];
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((value) =>
      value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("small trust and metadata colors meet AA contrast on app surfaces", () => {
  const surfaces = ["paper", "paper-bright", "paper-deep"].map(cssVariable);

  for (const token of ["ink-faint", "ochre-ink"]) {
    const foreground = cssVariable(token);
    for (const background of surfaces) {
      assert.ok(
        contrast(foreground, background) >= 4.5,
        `--${token} stays readable on ${background}`,
      );
    }
  }
});

test("high-frequency student controls retain 44px touch targets", () => {
  for (const pattern of [
    /\.menu-button\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
    /\.search-input-shell button\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
    /\.quick-starts button\s*\{[\s\S]*?min-height:\s*44px;/,
    /\.filter-chips button\s*\{[\s\S]*?min-height:\s*44px;/,
    /\.save-button,[\s\S]*?\.compare-button\s*\{[\s\S]*?min-height:\s*44px;/,
    /\.profile-metric-disclosure summary\s*\{[\s\S]*?min-height:\s*44px;/,
    /\.comparison-remove\s*\{[\s\S]*?min-height:\s*44px;/,
  ]) {
    assert.match(globals, pattern);
  }

  assert.match(
    chances,
    /\.selectedChips button\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
  );
  assert.match(
    auth,
    /\.closeButton\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
  );
  assert.match(
    auth,
    /\.revealButton\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
  );
  assert.match(
    match,
    /\.cardFooterActions \.localSave,[\s\S]*?\.cardFooterActions a\s*\{[\s\S]*?min-height:\s*44px;/,
  );
});
