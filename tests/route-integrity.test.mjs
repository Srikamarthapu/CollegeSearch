import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataset = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
);

function broadFieldSlug(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const staticRoutes = [
  "/",
  "/account",
  "/auth/auth-code-error",
  "/auth/update-password",
  "/chances",
  "/compare",
  "/data-health",
  "/data-sources",
  "/explore",
  "/majors",
  "/match",
  "/methodology",
  "/privacy",
  "/saved",
];
const profileRoutes = dataset.colleges.map(
  (college) => `/colleges/${college.slug}`,
);
const fieldRoutes = [
  ...new Set(
    dataset.colleges.flatMap((college) =>
      college.majors.map((major) => `/majors/${broadFieldSlug(major.name)}`),
    ),
  ),
];

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("route-integrity", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const env = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};
const context = {
  waitUntil() {},
  passThroughOnException() {},
};

async function render(pathname) {
  return worker.fetch(
    new Request(new URL(pathname, "http://localhost"), {
      headers: { accept: "text/html", host: "localhost" },
    }),
    env,
    context,
  );
}

function internalAnchorTargets(html) {
  const targets = new Set();
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = match[1];
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    const url = new URL(href, "http://localhost");
    targets.add(`${url.pathname}${url.search}`);
  }
  return targets;
}

test("every published profile, broad field, and internal app link resolves", async () => {
  const canonicalRoutes = [...staticRoutes, ...profileRoutes, ...fieldRoutes];
  const internalLinks = new Set();

  for (const route of canonicalRoutes) {
    const response = await render(route);
    assert.equal(response.status, 200, `${route} returns HTML`);
    assert.match(
      response.headers.get("content-type") ?? "",
      /text\/html/,
      `${route} is an HTML route`,
    );
    const html = await response.text();
    assert.match(html, /<main\b/, `${route} has a main landmark`);
    for (const target of internalAnchorTargets(html)) internalLinks.add(target);
  }

  for (const route of internalLinks) {
    const response = await render(route);
    assert.equal(response.status, 200, `internal link ${route} resolves`);
  }

  assert.equal(profileRoutes.length, 50);
  assert.equal(fieldRoutes.length, 12);
  assert.ok(internalLinks.size >= 70, "the crawl covers the app's linked routes");
});
