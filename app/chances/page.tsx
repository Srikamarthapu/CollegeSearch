import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { colleges } from "@/app/lib/college-data";
import { ChancesTool, type ChancesCollege } from "./ChancesTool";
import styles from "./chances.module.css";

export const metadata: Metadata = {
  title: "Admit-rate context · CollegeSearch",
  description:
    "Read historical overall college admit rates without false personalized admission probabilities.",
};

type ChancesPageProps = {
  searchParams: Promise<{
    colleges?: string | string[];
    ids?: string | string[];
  }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseUnitIds(value: string | undefined) {
  const seen = new Set<number>();
  const parsed: number[] = [];
  for (const token of value?.split(",") ?? []) {
    const unitId = Number(token.trim());
    if (!Number.isInteger(unitId) || unitId <= 0 || seen.has(unitId)) continue;
    seen.add(unitId);
    parsed.push(unitId);
    if (parsed.length === 4) break;
  }
  return parsed;
}

const chancesColleges: ChancesCollege[] = colleges.map((college) => {
  const observation = college.observations.admitRate;
  return {
    unitId: college.unitId,
    slug: college.slug,
    name: college.name,
    city: college.city,
    state: college.state,
    ownership: college.ownership,
    rate: observation.value,
    periodLabel: observation.periodLabel,
    finality: observation.finality,
    status: observation.status,
    publisher: observation.publisher,
    sourceName: observation.sourceName,
    sourceUrl: observation.sourceUrl,
    cohort: observation.cohort,
    definition: observation.definition,
  };
});

export default async function ChancesPage({ searchParams }: ChancesPageProps) {
  const query = await searchParams;
  const initialIds = parseUnitIds(first(query.colleges) ?? first(query.ids));

  return (
    <>
      <SiteHeader />
      <main id="main-content" className={`${styles.page} page-shell`}>
        <nav className="page-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/explore">
            <ArrowLeft size={15} aria-hidden="true" />
            Explore
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Admit-rate context</span>
        </nav>
        <ChancesTool colleges={chancesColleges} initialIds={initialIds} />
      </main>
      <SiteFooter />
    </>
  );
}
