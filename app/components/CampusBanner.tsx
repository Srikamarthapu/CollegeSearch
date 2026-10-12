import type { College } from "@/app/lib/college-data";
import { getProfileCampusPhoto } from "@/app/lib/profile-campus-photos";
import { CampusBannerImage } from "./CampusBannerImage";
import { CampusPhotoFallback } from "./CampusPhotoFallback";
import styles from "./CampusBanner.module.css";

export function CampusBanner({ college }: {
  college: Pick<College, "unitId" | "slug" | "website">;
}) {
  const photo = getProfileCampusPhoto(college.unitId, college.slug);
  return <div className={styles.banner}>
    {photo
      ? <CampusBannerImage key={photo.src} photo={photo} website={college.website} />
      : <CampusPhotoFallback website={college.website} />}
  </div>;
}
