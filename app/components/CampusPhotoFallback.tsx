import { ExternalLink, MapPin } from "lucide-react";
import styles from "./CampusBanner.module.css";

export function CampusPhotoFallback({ website, unavailable = false }: {
  website: string;
  unavailable?: boolean;
}) {
  return <div className={styles.fallback}>
    <span><MapPin size={16} aria-hidden="true" />
      {unavailable ? "Campus photo unavailable" : "Campus photo not yet verified"}
    </span>
    <a href={website} target="_blank" rel="noreferrer">Visit college website <ExternalLink size={14} aria-hidden="true" /></a>
  </div>;
}
