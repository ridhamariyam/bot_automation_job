export const JOB_TYPES = [
  { id: "full-time",   label: "Full-time" },
  { id: "part-time",   label: "Part-time" },
  { id: "contract",    label: "Contract" },
  { id: "internship",  label: "Internship" },
  { id: "freelance",   label: "Freelance" },
];

export const WORK_MODES = [
  { id: "remote",  label: "Remote" },
  { id: "hybrid",  label: "Hybrid" },
  { id: "onsite",  label: "On-site" },
];

export const EXP_LEVELS = [
  { id: "fresher", label: "Fresher (0–1 yr)" },
  { id: "junior",  label: "Junior (1–3 yrs)" },
  { id: "mid",     label: "Mid (3–6 yrs)" },
  { id: "senior",  label: "Senior (6+ yrs)" },
];

export const DATE_POSTED = [
  { id: "24h",   label: "Last 24 hours" },
  { id: "week",  label: "Last week" },
  { id: "month", label: "Last month" },
  { id: "any",   label: "Any time" },
];

export const COMPANY_SIZES = [
  { id: "startup", label: "Startup  (<50)" },
  { id: "mid",     label: "Mid-size (50–500)" },
  { id: "large",   label: "Large (500+)" },
];

export type JobFilters = {
  jobTypes:      string[];
  workModes:     string[];
  experienceLevel: string;
  minSalary:     string;
  datePosted:    string;
  companySizes:  string[];
};

export const DEFAULT_FILTERS: JobFilters = {
  jobTypes:        ["full-time"],
  workModes:       ["remote", "hybrid", "onsite"],
  experienceLevel: "mid",
  minSalary:       "",
  datePosted:      "any",
  companySizes:    ["startup", "mid", "large"],
};
