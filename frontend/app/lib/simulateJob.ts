/**
 * Dynamically generates a job application record from the user's own filters.
 * - Skips any job whose match score is below 50 (returns null)
 * - Occasionally generates off-target titles to demonstrate smart filtering
 */
import { generateApplication, detectRole } from "./generateApplication";
import { PLATFORMS } from "../questionnaire/page";

type JobPlatform = string;

export type SimulatedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  platform: JobPlatform;
  jobType: string;
  workMode: string;
  status: "Applied";
  appliedAt: string;
  appContent: ReturnType<typeof generateApplication>;
};

// Generic company name parts — no recognisable brand names
const CO_PREFIX = ["Nova", "Arc", "Apex", "Vega", "Titan", "Orbit", "Nexus", "Prism", "Pulse", "Flux", "Core", "Edge", "Byte", "Nano", "Zeta", "Alto", "Kova", "Luma", "Strata", "Crest"];
const CO_SUFFIX = ["Tech", "Labs", "Works", "Systems", "Software", "Solutions", "Digital", "Ventures", "IO", "HQ", "AI", "Cloud", "Stack", "Hub", "Base"];

function randomCompany(seed: number): string {
  const p = CO_PREFIX[seed % CO_PREFIX.length];
  const s = CO_SUFFIX[Math.floor(seed / CO_PREFIX.length) % CO_SUFFIX.length];
  return `${p} ${s}`;
}

function pickLocation(locations: string[], workModes: string[], seed: number): string {
  const hasRemote = workModes.includes("remote");
  const hasHybrid = workModes.includes("hybrid");
  const hasOnsite = workModes.includes("onsite");

  if (hasRemote && seed % 3 === 0) return "Remote";
  if (hasHybrid && seed % 3 === 1) return locations[seed % Math.max(locations.length, 1)] + " (Hybrid)";
  if (hasOnsite || locations.length) return locations[seed % Math.max(locations.length, 1)] || "Bangalore";
  return "Remote";
}

function platformLabel(id: string): string {
  return PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

// Off-target titles used to demonstrate smart skip (<50% match filter)
// These will be generated 1-in-6 times and are likely to mismatch the user's skills
const NOISE_TITLES = [
  "DevOps Engineer", "Java Spring Developer", "Data Scientist",
  "Android Developer", "iOS Engineer", "Embedded Systems Engineer",
];

let _counter = 0;

export function simulateJob(user: {
  name: string;
  summary: string;
  skills: string[];
  targetTitles: string[];
  targetLocations: string[];
  platforms: string[];
  filters: {
    jobTypes: string[];
    workModes: string[];
    experienceLevel: string;
    companySizes: string[];
  };
  projects?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;
}): SimulatedJob | null {
  const seed = _counter++;
  const now = Date.now();

  const titles    = user.targetTitles?.length ? user.targetTitles : ["Software Engineer"];
  const locations = user.targetLocations?.length ? user.targetLocations : ["Remote"];
  const platforms = user.platforms?.length ? user.platforms : ["linkedin"];
  const jobTypes  = user.filters?.jobTypes?.length ? user.filters.jobTypes : ["full-time"];
  const workModes = user.filters?.workModes?.length ? user.filters.workModes : ["remote", "hybrid", "onsite"];

  // Every 6th job is an off-target title to demonstrate the skip filter
  const useNoisyTitle = seed % 6 === 5;
  const title = useNoisyTitle
    ? NOISE_TITLES[seed % NOISE_TITLES.length]
    : titles[seed % titles.length];

  const company  = randomCompany(seed + Math.floor(now / 10000));
  const location = pickLocation(locations, workModes, seed);
  const platform = platformLabel(platforms[seed % platforms.length]);
  const jobType  = jobTypes[seed % jobTypes.length];

  const userLinks = {
    portfolio: user.portfolioUrl,
    github: user.githubUrl,
    linkedin: user.linkedinUrl,
  };

  const appContent = generateApplication(
    title, company, user.skills, user.name, user.summary, user.projects, userLinks
  );

  // Skip jobs below 50% match — bot only submits good-fit applications
  if (appContent.matchScore < 50) return null;

  return {
    id: now.toString() + seed,
    title,
    company,
    location,
    platform,
    jobType,
    workMode: workModes[seed % workModes.length],
    status: "Applied",
    appliedAt: new Date().toISOString(),
    appContent,
  };
}

export function resetSimCounter() {
  _counter = 0;
}
