import type { College } from "@/app/lib/college-data";
import Image from "next/image";

type CollegeLogoVariant =
  | "card"
  | "comparison"
  | "profile"
  | "suggestion"
  | "tray";

const rasterLogoExtensions: Record<string, "jpg" | "png"> = {
  "georgia-institute-of-technology-main-campus": "jpg",
  "loyola-marymount-university": "png",
  "massachusetts-institute-of-technology": "png",
  "new-york-university": "png",
  "pomona-college": "jpg",
  "san-diego-state-university": "png",
  "university-of-virginia-main-campus": "png",
  "yale-university": "png",
};

export function collegeLogoAsset(slug: string) {
  const extension = rasterLogoExtensions[slug] ?? "svg";
  return `/college-logos/${slug}.${extension}`;
}

export function CollegeLogo({
  college,
  variant = "card",
}: {
  college: Pick<College, "name" | "slug">;
  variant?: CollegeLogoVariant;
}) {
  return (
    <span className={`college-logo college-logo-${variant}`} aria-hidden="true">
      <Image
        src={collegeLogoAsset(college.slug)}
        alt=""
        decoding="async"
        width={112}
        height={56}
        loading={variant === "card" ? "lazy" : "eager"}
        unoptimized
      />
    </span>
  );
}
