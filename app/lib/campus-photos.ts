/**
 * Genuine campus photos sourced and visually inspected September 6, 2026.
 * All local JPEGs are unchanged bytes from the source or its served thumbnail.
 * When displayed with object-fit: cover, credit the image as cropped for display.
 * Keep each CC BY-SA photograph/derivative under its stated image license.
 * These image licenses do not assert university endorsement.
 */
export type CampusPhotoSource = {
  unitId: number;
  slug: string;
  name: string;
  shortName: string;
  location: string;
  src: string;
  sourceUrl: string;
  downloadUrl: string;
  creator: string;
  credit: string;
  license: "CC BY 4.0" | "CC BY-SA 3.0" | "CC BY-SA 4.0" | "CC0 1.0";
  licenseUrl: string;
  photoDate: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  objectPosition: string;
  cropNotes: string;
};

export const campusPhotos: CampusPhotoSource[] = [
  {
    unitId: 243744,
    slug: "stanford-university",
    name: "Stanford University",
    shortName: "Stanford",
    location: "Stanford, California",
    src: "/images/campuses/stanford.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Stanford_Oval_May_2011_panorama_(long_cropped).jpg",
    downloadUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/40/Stanford_Oval_May_2011_panorama_%28long_cropped%29.jpg/1280px-Stanford_Oval_May_2011_panorama_%28long_cropped%29.jpg?utm_campaign=index&utm_content=thumbnail&utm_source=commons.wikimedia.org",
    creator: "King of Hearts",
    credit: "King of Hearts / Wikimedia Commons / CC BY-SA 3.0",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    photoDate: "2011-05-07",
    width: 1280,
    height: 720,
    alt: "Stanford's sandstone Main Quad and Memorial Church beyond the green Oval lawn.",
    caption: "The Oval · Stanford University",
    objectPosition: "50% 56%",
    cropNotes: "Source is a panoramic photograph by King of Hearts, cropped horizontally by Wikimedia user Sdkb in 2023; downloaded the Commons 1280px thumbnail unchanged. For a wider carousel window, retain the central church and main facade; note additional cropping for display.",
  },
  {
    unitId: 110662,
    slug: "university-of-california-los-angeles",
    name: "University of California-Los Angeles",
    shortName: "UCLA",
    location: "Los Angeles, California",
    src: "/images/campuses/ucla.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:UCLA_Royce_Hall.jpg",
    downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/1/1e/UCLA_Royce_Hall.jpg",
    creator: "Yanmingzhang",
    credit: "Yanmingzhang / Wikimedia Commons / CC BY-SA 3.0",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    photoDate: "2017-06-25",
    width: 1280,
    height: 960,
    alt: "The twin brick towers and arched entrance of Royce Hall at UCLA beside a green lawn.",
    caption: "Royce Hall · UCLA",
    objectPosition: "50% 10%",
    cropNotes: "Downloaded the 1280px original unchanged. Source dates the photo June 25, 2017 according to EXIF. Cropping a wide frame may trim the tower tops; use a less wide aspect ratio or adjust object-position after visual inspection. Note cropping for display.",
  },
  {
    unitId: 236948,
    slug: "university-of-washington-seattle-campus",
    name: "University of Washington-Seattle Campus",
    shortName: "Washington",
    location: "Seattle, Washington",
    src: "/images/campuses/washington.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:University_of_Washington_Cherry_Blossoms_(33800023865).jpg",
    downloadUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/University_of_Washington_Cherry_Blossoms_%2833800023865%29.jpg/960px-University_of_Washington_Cherry_Blossoms_%2833800023865%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail",
    creator: "Steve Ginn",
    credit: "Steve Ginn / Wikimedia Commons / CC0",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    photoDate: "2017-04-02",
    width: 960,
    height: 640,
    alt: "Pale pink cherry blossoms around a moss-covered tree on the University of Washington campus, with campus buildings behind.",
    caption: "Cherry blossoms · University of Washington",
    objectPosition: "50% 55%",
    cropNotes: "Downloaded the current Commons 960px thumbnail unchanged. Commons verified the original Flickr image as CC0 in 2018. This is a close view of the flowering tree, not a wide view of the Quad. Attribution is included voluntarily for source transparency; crop freely.",
  },
  {
    unitId: 190150,
    slug: "columbia-university-in-the-city-of-new-york",
    name: "Columbia University in the City of New York",
    shortName: "Columbia",
    location: "New York, New York",
    src: "/images/campuses/columbia.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Columbia_University_-_Low_Library.jpg",
    downloadUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/Columbia_University_-_Low_Library.jpg/1280px-Columbia_University_-_Low_Library.jpg?utm_campaign=index&utm_content=thumbnail&utm_source=commons.wikimedia.org",
    creator: "Bitterteayen",
    credit: "Bitterteayen / Wikimedia Commons / CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    photoDate: "2018-09-01",
    width: 1280,
    height: 960,
    alt: "Columbia University's domed Low Library and broad stone steps beneath blue sky and white clouds.",
    caption: "Low Library · Columbia University",
    objectPosition: "50% 72%",
    cropNotes: "Downloaded the Commons 1280px thumbnail unchanged. Keep the dome and library entrance visible; there is substantial sky in the top half, so bias vertical positioning toward the lower portion. Note cropping for display.",
  },
  {
    unitId: 110635,
    slug: "university-of-california-berkeley",
    name: "University of California-Berkeley",
    shortName: "Berkeley",
    location: "Berkeley, California",
    src: "/images/campuses/berkeley.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:UC_Berkeley_campus_and_surroundings_from_Berkeley_Hills_January_2026.jpg",
    downloadUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5f/UC_Berkeley_campus_and_surroundings_from_Berkeley_Hills_January_2026.jpg/1280px-UC_Berkeley_campus_and_surroundings_from_Berkeley_Hills_January_2026.jpg?utm_campaign=index&utm_content=thumbnail&utm_source=commons.wikimedia.org",
    creator: "4300streetcar",
    credit: "4300streetcar / Wikimedia Commons / CC BY 4.0",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    photoDate: "2026-01-30",
    width: 1280,
    height: 853,
    alt: "Sather Tower and the UC Berkeley campus viewed from the Berkeley Hills with San Francisco Bay behind.",
    caption: "Sather Tower and campus · UC Berkeley",
    objectPosition: "50% 40%",
    cropNotes: "Previously sourced and inspected in this task; copied the unchanged 1280px Commons thumbnail into this asset folder. Keep the tower centered. Note cropping for display. Avoid repeating the source caption's compass direction, which appears inconsistent with the visible bay.",
  },
];
