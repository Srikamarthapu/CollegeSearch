import type {
  College,
  Observation,
  ObservationUnit,
} from "@/app/lib/college-data";

export type ClientObservation = Pick<
  Observation,
  "value" | "unit" | "periodLabel" | "sourceId" | "publisher" | "sourceUrl"
>;

export type ClientMajorEvidence = Pick<
  College["majors"][number],
  "name" | "share"
>;

export type ClientCollege = Pick<
  College,
  | "unitId"
  | "slug"
  | "name"
  | "aliases"
  | "city"
  | "state"
  | "ownership"
  | "setting"
> & {
  observations: {
    admitRate: ClientObservation;
    averageNetPrice: ClientObservation;
    graduationRate: ClientObservation;
    undergraduateEnrollment: ClientObservation;
    medianEarnings: ClientObservation;
    tuitionOutOfState: ClientObservation;
  };
  majors: ClientMajorEvidence[];
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");

export const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function projectObservation(observation: Observation): ClientObservation {
  return {
    value: observation.value,
    unit: observation.unit,
    periodLabel: observation.periodLabel,
    sourceId: observation.sourceId,
    publisher: observation.publisher,
    sourceUrl: observation.sourceUrl,
  };
}

export function projectCollegeForClient(college: College): ClientCollege {
  return {
    unitId: college.unitId,
    slug: college.slug,
    name: college.name,
    aliases: college.aliases,
    city: college.city,
    state: college.state,
    ownership: college.ownership,
    setting: college.setting,
    observations: {
      admitRate: projectObservation(college.observations.admitRate),
      averageNetPrice: projectObservation(
        college.observations.averageNetPrice,
      ),
      graduationRate: projectObservation(college.observations.graduationRate),
      undergraduateEnrollment: projectObservation(
        college.observations.undergraduateEnrollment,
      ),
      medianEarnings: projectObservation(
        college.observations.medianEarnings,
      ),
      tuitionOutOfState: projectObservation(
        college.observations.tuitionOutOfState,
      ),
    },
    majors: college.majors.map(({ name, share }) => ({ name, share })),
  };
}

export function projectCollegesForClient(colleges: College[]) {
  return colleges.map(projectCollegeForClient);
}

export function formatObservation(observation: {
  value: number | null;
  unit: ObservationUnit;
}) {
  if (observation.value === null) return "Not reported";
  if (observation.unit === "ratio") {
    return percentFormatter.format(observation.value);
  }
  if (observation.unit === "usd") {
    return currencyFormatter.format(observation.value);
  }
  return numberFormatter.format(observation.value);
}

export function observationSourceKind(observation: {
  sourceId: string;
  publisher: string;
}) {
  if (observation.sourceId.startsWith("uc-")) {
    return { label: "UC official", className: "uc-source", isFederal: false };
  }
  if (observation.publisher === "U.S. Department of Education") {
    return {
      label: "Federal baseline",
      className: "federal-source",
      isFederal: true,
    };
  }
  return {
    label: "College official",
    className: "official-source",
    isFederal: false,
  };
}

export function compactName(college: Pick<ClientCollege, "aliases" | "name">) {
  return (
    college.aliases.find((alias) => alias.startsWith("UC ")) ||
    college.aliases[0] ||
    college.name
  );
}

export function isUniversityOfCalifornia(
  college: Pick<ClientCollege, "observations">,
) {
  return college.observations.admitRate.sourceId.startsWith("uc-");
}

export function selectivityLabel(rate: number | null) {
  if (rate === null) return "Insufficient data";
  if (rate <= 0.1) return "10% or fewer admitted";
  if (rate <= 0.25) return "11%–25% admitted";
  if (rate <= 0.5) return "26%–50% admitted";
  return "More than 50% admitted";
}

export function majorEvidenceFor(
  college: Pick<ClientCollege, "majors">,
  major: string,
) {
  return college.majors.find((item) => item.name === major) ?? null;
}
