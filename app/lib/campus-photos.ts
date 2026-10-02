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
  license:
    | "CC BY 4.0"
    | "CC BY-SA 2.0"
    | "CC BY-SA 3.0"
    | "CC BY-SA 4.0"
    | "CC0 1.0";
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
  {
    unitId: 104151,
    slug: "arizona-state-university-campus-immersion",
    name: "Arizona State University Campus Immersion",
    shortName: "ASU",
    location: "Tempe, Arizona",
    src: "/images/campuses/arizona-state.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:2021_Arizona_State_University,_Tempe_Campus,_Old_Main.jpg",
    downloadUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/02/2021_Arizona_State_University%2C_Tempe_Campus%2C_Old_Main.jpg/1280px-2021_Arizona_State_University%2C_Tempe_Campus%2C_Old_Main.jpg",
    creator: "Beyond My Ken",
    credit: "Beyond My Ken / Wikimedia Commons / CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    photoDate: "2021-06-27",
    width: 1280,
    height: 744,
    alt: "Red-brick Old Main framed by lawns, a front walk, and palms on Arizona State University's Tempe campus.",
    caption: "Old Main · ASU",
    objectPosition: "50% 50%",
    cropNotes:
      "Downloaded the Commons 1280px thumbnail unchanged. Keep Old Main's roofline and front walk visible; the wide source frame loses little in the desktop crop.",
  },
  {
    unitId: 110404,
    slug: "california-institute-of-technology",
    name: "California Institute of Technology",
    shortName: "Caltech",
    location: "Pasadena, California",
    src: "/images/campuses/caltech.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Caltech_from_the_air.jpg",
    downloadUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/Caltech_from_the_air.jpg/960px-Caltech_from_the_air.jpg",
    creator: "Tobin",
    credit: "Tobin / Wikimedia Commons / CC BY-SA 2.0",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    photoDate: "2007-10-27",
    width: 960,
    height: 720,
    alt: "Aerial view from a plane over Caltech's Pasadena campus, with campus buildings and the San Gabriel Valley beyond.",
    caption: "Campus from above · Caltech",
    objectPosition: "50% 50%",
    cropNotes:
      "Downloaded the Commons 960px thumbnail unchanged. The source is an aerial photo from a Cessna; part of its wing appears in the upper-left corner. Keep the campus blocks near the center when the carousel crops the frame.",
  },
  {
    unitId: 198419,
    slug: "duke-university",
    name: "Duke University",
    shortName: "Duke",
    location: "Durham, North Carolina",
    src: "/images/campuses/duke.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Duke_University_West_Campus_academic_quad_(351118213).jpg",
    downloadUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Duke_University_West_Campus_academic_quad_%28351118213%29.jpg/960px-Duke_University_West_Campus_academic_quad_%28351118213%29.jpg",
    creator: "Brian Carlson from Overland Park, USA",
    credit: "Brian Carlson / Wikimedia Commons / CC BY-SA 2.0",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    photoDate: "2003-12-31",
    width: 960,
    height: 720,
    alt: "A tree-lined walk through Duke's West Campus academic quad, with stone academic buildings beside the lawn.",
    caption: "West Campus quad · Duke",
    objectPosition: "50% 50%",
    cropNotes:
      "Downloaded the Commons 960px thumbnail unchanged. Keep the tree-lined walk and stone facades visible in both desktop and mobile crops.",
  },
  {
    unitId: 139755,
    slug: "georgia-institute-of-technology-main-campus",
    name: "Georgia Institute of Technology-Main Campus",
    shortName: "Georgia Tech",
    location: "Atlanta, Georgia",
    src: "/images/campuses/georgia-tech.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Tech_Tower_in_Atlanta.jpg",
    downloadUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/Tech_Tower_in_Atlanta.jpg/960px-Tech_Tower_in_Atlanta.jpg",
    creator: "Tyler Lahti",
    credit: "Tyler Lahti / Wikimedia Commons / CC BY-SA 2.0",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    photoDate: "2022-01-29",
    width: 960,
    height: 720,
    alt: "Georgia Tech's Tech Tower beside a brick campus walk, lawn, flags, and nearby academic buildings.",
    caption: "Tech Tower · Georgia Tech",
    objectPosition: "50% 42%",
    cropNotes:
      "Downloaded the Commons 960px thumbnail unchanged. Bias the display crop upward slightly to retain the tower's roofline and clock.",
  },
  {
    unitId: 166027,
    slug: "harvard-university",
    name: "Harvard University",
    shortName: "Harvard",
    location: "Cambridge, Massachusetts",
    src: "/images/campuses/harvard.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Widener_Library,_Harvard_University.jpg",
    downloadUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/Widener_Library%2C_Harvard_University.jpg/960px-Widener_Library%2C_Harvard_University.jpg",
    creator: "Kenneth C. Zirkel",
    credit: "Kenneth C. Zirkel / Wikimedia Commons / CC BY 4.0",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    photoDate: "2012-09-01",
    width: 960,
    height: 618,
    alt: "Widener Library's columned facade across a lawn and walkway in Harvard Yard.",
    caption: "Widener Library · Harvard",
    objectPosition: "50% 50%",
    cropNotes:
      "Downloaded the Commons 960px thumbnail unchanged. The wide facade anchors the frame; preserve the roofline and front lawn when cropping for display.",
  },
  {
    unitId: 166683,
    slug: "massachusetts-institute-of-technology",
    name: "Massachusetts Institute of Technology",
    shortName: "MIT",
    location: "Cambridge, Massachusetts",
    src: "/images/campuses/mit.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Great_dome_of_MIT,_Feb_2021_(2)_(cropped).jpg",
    downloadUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8d/Great_dome_of_MIT%2C_Feb_2021_%282%29_%28cropped%29.jpg/1280px-Great_dome_of_MIT%2C_Feb_2021_%282%29_%28cropped%29.jpg",
    creator: "Peacearth",
    credit: "Peacearth / Wikimedia Commons / CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    photoDate: "2021-02-08",
    width: 1280,
    height: 733,
    alt: "MIT's Great Dome beyond a snow-covered Killian Court framed by bare trees.",
    caption: "Killian Court · MIT",
    objectPosition: "50% 50%",
    cropNotes:
      "The Commons file is already a losslessly cropped version of the photographer's image. Downloaded its 1280px thumbnail unchanged; keep the dome and open court visible in the display crop.",
  },
  {
    unitId: 170976,
    slug: "university-of-michigan-ann-arbor",
    name: "University of Michigan-Ann Arbor",
    shortName: "Michigan",
    location: "Ann Arbor, Michigan",
    src: "/images/campuses/michigan.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Law_Quadrangle,_University_of_Michigan,_University_Avenue_and_State_Street,_Ann_Arbor,_MI.jpg",
    downloadUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/Law_Quadrangle%2C_University_of_Michigan%2C_University_Avenue_and_State_Street,_Ann_Arbor,_MI.jpg/960px-Law_Quadrangle%2C_University_of_Michigan%2C_University_Avenue_and_State_Street,_Ann_Arbor,_MI.jpg",
    creator: "w_lemay",
    credit: "w_lemay / Wikimedia Commons / CC BY-SA 2.0",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    photoDate: "2024-09-08",
    width: 960,
    height: 720,
    alt: "The University of Michigan Law Quadrangle's stone facade and lawn beneath a bright blue sky.",
    caption: "Law Quadrangle · Michigan",
    objectPosition: "50% 28%",
    cropNotes:
      "Downloaded the Commons 960px thumbnail unchanged. Bias the crop upward to keep the full stone roofline above the quad lawn.",
  },
  {
    unitId: 186131,
    slug: "princeton-university",
    name: "Princeton University",
    shortName: "Princeton",
    location: "Princeton, New Jersey",
    src: "/images/campuses/princeton.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Cannon_Green_and_Nassau_Hall,_Princeton_University.jpg",
    downloadUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/07/Cannon_Green_and_Nassau_Hall%2C_Princeton_University.jpg/960px-Cannon_Green_and_Nassau_Hall%2C_Princeton_University.jpg",
    creator: "Ken Lund",
    credit: "Ken Lund / Wikimedia Commons / CC BY-SA 2.0",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    photoDate: "2019-03-31",
    width: 960,
    height: 655,
    alt: "Nassau Hall and its tower across Princeton University's Cannon Green, with trees beyond the lawn.",
    caption: "Cannon Green · Princeton",
    objectPosition: "50% 42%",
    cropNotes:
      "Downloaded the Commons 960px thumbnail unchanged. Preserve Nassau Hall's tower and the green foreground in the cropped display frame.",
  },
  {
    unitId: 228778,
    slug: "the-university-of-texas-at-austin",
    name: "The University of Texas at Austin",
    shortName: "UT Austin",
    location: "Austin, Texas",
    src: "/images/campuses/ut-austin.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Panorama_of_UT_campus_and_downtown_Austin.jpg",
    downloadUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/Panorama_of_UT_campus_and_downtown_Austin.jpg/1280px-Panorama_of_UT_campus_and_downtown_Austin.jpg",
    creator: "Spheroidite",
    credit: "Spheroidite / Wikimedia Commons / CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    photoDate: "2015-04-19",
    width: 1280,
    height: 428,
    alt: "A panoramic southward view across UT Austin's campus and downtown Austin from the Tower observation deck.",
    caption: "Campus & downtown · UT Austin",
    objectPosition: "50% 50%",
    cropNotes:
      "Downloaded the Commons 1280px thumbnail unchanged. This very wide image looks south from the Tower; center on the campus-to-downtown sweep so the panorama remains legible at 16:9 and 3:2.",
  },
  {
    unitId: 199120,
    slug: "university-of-north-carolina-at-chapel-hill",
    name: "University of North Carolina at Chapel Hill",
    shortName: "UNC",
    location: "Chapel Hill, North Carolina",
    src: "/images/campuses/unc-chapel-hill.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:UNC_Chapel_Hill_-_Old_Well_with_flowers.jpg",
    downloadUrl:
      "https://upload.wikimedia.org/wikipedia/commons/f/fd/UNC_Chapel_Hill_-_Old_Well_with_flowers.jpg",
    creator: "Jack a lanier",
    credit: "Jack a lanier / Wikimedia Commons / CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    photoDate: "2018-05-11",
    width: 1280,
    height: 960,
    alt: "UNC-Chapel Hill's Old Well set among flower beds and leafy trees, with Old West behind it.",
    caption: "The Old Well · UNC",
    objectPosition: "50% 48%",
    cropNotes:
      "Downloaded the original 1280px Commons file unchanged. Keep the well's dome above the flowers and retain some of the building behind it in the display crop.",
  },
];
