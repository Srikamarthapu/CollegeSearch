import { campusPhotos, type CampusPhotoSource } from "./campus-photos.ts";
import profileCampusPhotoAdditionsJson from "../../data/profile-campus-photo-additions.json" with { type: "json" };

const profileCampusPhotoAdditions = profileCampusPhotoAdditionsJson as CampusPhotoSource[];

/**
 * Only manually approved, locally cached campus photographs belong in this map.
 * The separate candidate manifest is an offline review queue and is never
 * imported here, so an unreviewed Wikidata P18 image cannot reach a profile.
 */
const approvedByUnitId = new Map<number, CampusPhotoSource>();
const excludedProfileUnitIds = new Set<number>();
const profileObjectPositionByUnitId = new Map<number, string>([
  [190150, "50% 60%"], // Columbia: retain Low Library's dome.
  [104151, "50% 20%"], // ASU: retain Old Main's roofline.
  [139755, "50% 65%"], // Georgia Tech: reduce empty sky and retain Tech Tower.
  [166027, "50% 20%"], // Harvard: retain Widener Library's roofline.
  [199120, "50% 5%"], // UNC: retain the Old Well dome.
]);

for (const photo of [...campusPhotos, ...profileCampusPhotoAdditions]) {
  if (approvedByUnitId.has(photo.unitId)) {
    throw new Error(`Duplicate approved campus photo for UNITID ${photo.unitId}.`);
  }
  approvedByUnitId.set(photo.unitId, photo);
}

export function getProfileCampusPhoto(unitId: number, slug: string): CampusPhotoSource | undefined {
  if (excludedProfileUnitIds.has(unitId)) return undefined;
  const photo = approvedByUnitId.get(unitId);
  if (photo?.slug !== slug) return undefined;

  const objectPosition = profileObjectPositionByUnitId.get(unitId);
  return objectPosition ? { ...photo, objectPosition } : photo;
}

export const approvedProfileCampusPhotoCount = approvedByUnitId.size - excludedProfileUnitIds.size;
