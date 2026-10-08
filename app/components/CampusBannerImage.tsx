"use client";

import Image from "next/image";
import { useState } from "react";
import type { CampusPhotoSource } from "@/app/lib/campus-photos";
import { CampusPhotoFallback } from "./CampusPhotoFallback";
import styles from "./CampusBanner.module.css";

export function CampusBannerImage({ photo, website }: {
  photo: CampusPhotoSource;
  website: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <CampusPhotoFallback website={website} unavailable />;
  const photoYear = /^\d{4}/.exec(photo.photoDate)?.[0] ?? "Date not reported";

  return <figure className={styles.figure}>
    <div className={styles.window}>
      <Image
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1328px) calc(100vw - 48px), 1280px"
        loading="eager"
        fetchPriority="high"
        decoding="async"
        onError={() => setFailed(true)}
        style={{ objectPosition: photo.objectPosition }}
      />
    </div>
    <figcaption className={styles.caption}>
      <span>{photo.caption}</span>
      <span className={styles.credit}>
        Photo: <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.creator}</a>
        {" · "}<a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a>
        {" · "}{photoYear} · cropped for display
      </span>
    </figcaption>
  </figure>;
}
