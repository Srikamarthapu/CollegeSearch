import type { College } from "@/app/lib/college-data";
import Image from "next/image";
import {
  collegeLogoAsset,
  collegeLogoInitials,
} from "./college-logo-data.mjs";
import styles from "./CollegeLogo.module.css";

type CollegeLogoVariant =
  | "card"
  | "comparison"
  | "profile"
  | "suggestion"
  | "tray";

const fallbackVariantClass: Record<CollegeLogoVariant, string> = {
  card: "",
  comparison: styles.comparisonFallback,
  profile: styles.profileFallback,
  suggestion: styles.suggestionFallback,
  tray: styles.trayFallback,
};

export function CollegeLogo({
  college,
  variant = "card",
}: {
  college: Pick<College, "name" | "slug">;
  variant?: CollegeLogoVariant;
}) {
  const asset = collegeLogoAsset(college.slug);

  return (
    <span className={`college-logo college-logo-${variant}`} aria-hidden="true">
      {asset ? (
        <Image
          src={asset}
          alt=""
          decoding="async"
          width={112}
          height={56}
          loading={variant === "card" ? "lazy" : "eager"}
          unoptimized
        />
      ) : (
        <span className={`${styles.fallback} ${fallbackVariantClass[variant]}`}>
          {collegeLogoInitials(college.name)}
        </span>
      )}
    </span>
  );
}
