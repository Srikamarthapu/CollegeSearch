// Census Bureau region memberships: https://www.census.gov/programs-surveys/economic-census/guidance-geographies/levels.html
const regionByState = Object.freeze({
  CT: "Northeast",
  ME: "Northeast",
  MA: "Northeast",
  NH: "Northeast",
  RI: "Northeast",
  VT: "Northeast",
  NJ: "Northeast",
  NY: "Northeast",
  PA: "Northeast",
  IL: "Midwest",
  IN: "Midwest",
  MI: "Midwest",
  OH: "Midwest",
  WI: "Midwest",
  IA: "Midwest",
  KS: "Midwest",
  MN: "Midwest",
  MO: "Midwest",
  NE: "Midwest",
  ND: "Midwest",
  SD: "Midwest",
  DE: "South",
  MD: "South",
  DC: "South",
  VA: "South",
  WV: "South",
  NC: "South",
  SC: "South",
  GA: "South",
  FL: "South",
  KY: "South",
  TN: "South",
  MS: "South",
  AL: "South",
  OK: "South",
  TX: "South",
  AR: "South",
  LA: "South",
  AK: "West",
  AZ: "West",
  CA: "West",
  CO: "West",
  HI: "West",
  ID: "West",
  MT: "West",
  NV: "West",
  NM: "West",
  OR: "West",
  UT: "West",
  WA: "West",
  WY: "West",
});

export const usCensusRegionCodes = Object.freeze(Object.keys(regionByState));

export function censusRegionForState(state) {
  const region = regionByState[state];
  if (!region) {
    throw new Error(`No Census region is defined for U.S. state or district ${state}.`);
  }
  return region;
}
