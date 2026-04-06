/**
 * Generates personalized application content for each job.
 * - Real match scores (no artificial floor — below 50% → bot skips)
 * - Highlights the user's most relevant projects for each role
 * - Attaches portfolio/GitHub/LinkedIn links in the cover note
 */

export type ApplicationContent = {
  matchedSkills: string[];
  missingSkills: string[];
  coverNote: string;
  whyCompany: string;
  experienceAnswer: string;
  strengthsAnswer: string;
  matchScore: number;
  highlightedProjects: string[];  // role-relevant projects from the user's profile
};

// Role → key skills recruiters look for
const ROLE_SKILL_MAP: Record<string, string[]> = {
  frontend:  ["React", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind", "Next.js", "Vite", "Redux", "Webpack"],
  backend:   ["Node.js", "Python", "FastAPI", "Django", "Express", "PostgreSQL", "MongoDB", "Redis", "REST", "GraphQL"],
  fullstack: ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker", "REST", "JavaScript", "Next.js"],
  mobile:    ["React Native", "Flutter", "Swift", "Kotlin", "iOS", "Android", "Expo"],
  devops:    ["Docker", "Kubernetes", "AWS", "GCP", "Azure", "CI/CD", "Linux", "Terraform"],
  data:      ["Python", "Pandas", "NumPy", "Machine Learning", "TensorFlow", "PyTorch", "SQL", "Spark"],
  ui:        ["Figma", "React", "CSS", "Tailwind", "HTML", "JavaScript", "TypeScript", "UX"],
  java:      ["Java", "Spring", "Microservices", "SQL", "Hibernate", "REST", "Maven", "Docker"],
};

// Role → content keywords for scoring which of the user's projects are most relevant
const ROLE_CONTENT_KEYWORDS: Record<string, string[]> = {
  frontend:  ["ui", "interface", "component", "dashboard", "web app", "frontend", "react", "vue", "angular", "animation", "responsive", "spa"],
  backend:   ["api", "server", "backend", "rest", "service", "microservice", "database", "endpoint", "authentication", "auth", "crud", "graphql"],
  fullstack: ["full stack", "fullstack", "end-to-end", "web application", "api", "database", "frontend", "backend"],
  mobile:    ["mobile", "app", "ios", "android", "cross-platform", "push notification", "offline", "native"],
  devops:    ["deploy", "pipeline", "ci/cd", "docker", "container", "kubernetes", "infrastructure", "monitoring", "aws", "cloud"],
  data:      ["data", "ml", "model", "prediction", "analysis", "dataset", "training", "pipeline", "nlp", "machine learning"],
  ui:        ["design", "figma", "prototype", "wireframe", "user experience", "ui", "ux", "visual", "accessibility"],
  java:      ["java", "spring", "microservice", "enterprise", "jvm", "maven", "gradle", "hibernate"],
};

export function detectRole(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("react native") || t.includes("mobile") || t.includes("flutter")) return "mobile";
  if (t.includes("full stack") || t.includes("fullstack")) return "fullstack";
  if (t.includes("frontend") || t.includes("front-end") || t.includes("react") || t.includes("vue") || t.includes("angular")) return "frontend";
  if (t.includes("backend") || t.includes("back-end") || t.includes("node") || t.includes("python") || t.includes("django") || t.includes("fastapi")) return "backend";
  if (t.includes("devops") || t.includes("cloud") || t.includes("infrastructure") || t.includes("sre")) return "devops";
  if (t.includes("data") || t.includes("ml") || t.includes("machine learning") || t.includes("ai") || t.includes("analyst")) return "data";
  if (t.includes("ui") || t.includes("ux") || t.includes("design")) return "ui";
  if (t.includes("java") || t.includes("spring")) return "java";
  return "frontend";
}

/**
 * Pick the user's most relevant projects for this specific job role.
 * Projects are pipe- or newline-separated entries in free text.
 */
function pickRelevantProjects(projectsText: string, role: string, roleSkills: string[]): string[] {
  if (!projectsText?.trim()) return [];

  const entries = projectsText
    .split(/[|\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (entries.length === 0) return [];

  const contentKeywords = ROLE_CONTENT_KEYWORDS[role] ?? [];

  const scored = entries.map((proj) => {
    const lower = proj.toLowerCase();
    // +3 for each role skill mentioned in the project description
    const skillScore = roleSkills.filter((s) => lower.includes(s.toLowerCase())).length * 3;
    // +2 for each role keyword matched
    const contentScore = contentKeywords.filter((k) => lower.includes(k)).length * 2;
    return { proj, score: skillScore + contentScore };
  });

  scored.sort((a, b) => b.score - a.score);

  // Return top 2 with any match; fallback to first entry if nothing scores
  const relevant = scored.filter((s) => s.score > 0).slice(0, 2).map((s) => s.proj);
  return relevant.length > 0 ? relevant : entries.slice(0, 1);
}

// Company-specific "why do you want to work here" answers
const COMPANY_WHY: Record<string, string> = {
  Razorpay:   "Razorpay's mission to power the new Indian economy and its engineering-first culture make it an exciting place to build impactful products",
  Zepto:      "Zepto's speed of execution and the technical challenges of building real-time 10-minute delivery at scale are genuinely exciting",
  Meesho:     "Meesho's focus on enabling small businesses and its rapid growth present real engineering challenges worth solving",
  Swiggy:     "Swiggy's scale — serving millions of orders daily — means every performance improvement I write has immediate real-world impact",
  PhonePe:    "PhonePe's ambition to become India's financial super-app and its strong engineering culture align with what I'm looking for",
  Groww:      "Groww's mission to simplify investing for millions of Indians resonates with me — fintech at scale is where I want to build",
  CRED:       "CRED's obsession with design quality and building for premium users is exactly the kind of product environment I thrive in",
  Flipkart:   "Flipkart's scale and the engineering problems that come with serving 500M+ users make it one of the most challenging and rewarding places to grow",
  Zomato:     "Zomato's platform touches food, logistics, and commerce simultaneously — the engineering complexity is unmatched",
  Ola:        "Ola's ambition to lead mobility and EV transformation in India presents fascinating technical and product problems",
  Atlassian:  "Atlassian's developer-first culture and its tools used by millions of engineering teams worldwide align perfectly with my background",
  Freshworks: "Freshworks' customer-centric approach and its rapid international expansion make it an exciting place to build B2B SaaS",
  Zoho:       "Zoho's commitment to building complete, privacy-first business software with no outside funding is a story I want to be part of",
  Postman:    "Postman sits at the center of how developers build and test APIs — working on a tool I use daily would be incredibly motivating",
  Hasura:     "Hasura's GraphQL engine is a product I've used personally and admired — contributing to it would be both challenging and fulfilling",
};

const DEFAULT_WHY = (company: string) =>
  `${company}'s reputation for engineering excellence and the technical scope of the role make it a compelling opportunity to grow and contribute`;

export function generateApplication(
  jobTitle: string,
  company: string,
  userSkills: string[],
  userName: string,
  userSummary: string,
  userProjects?: string,
  userLinks?: { portfolio?: string; github?: string; linkedin?: string },
): ApplicationContent {
  const role = detectRole(jobTitle);
  const roleSkills = ROLE_SKILL_MAP[role] ?? ROLE_SKILL_MAP.frontend;

  // Skills the user has that match this role
  const userSkillsLower = userSkills.map((s) => s.toLowerCase());
  const matchedSkills = roleSkills.filter((s) =>
    userSkillsLower.some((u) => u.includes(s.toLowerCase()) || s.toLowerCase().includes(u))
  );

  // Skills the role wants that the user didn't mention
  const missingSkills = roleSkills
    .filter((s) => !matchedSkills.includes(s))
    .slice(0, 3);

  // Real match score — no artificial floor. Bot skips anything below 50.
  const matchScore = Math.min(98, Math.round((matchedSkills.length / roleSkills.length) * 100));

  // Best projects for this specific role
  const highlightedProjects = pickRelevantProjects(userProjects ?? "", role, roleSkills);

  const primarySkill = matchedSkills[0] ?? roleSkills[0];
  const secondarySkill = matchedSkills[1] ?? roleSkills[1] ?? primarySkill;
  const firstName = userName?.split(" ")[0] ?? "I";

  const yearsMatch = userSummary?.match(/(\d+)\s*(?:\+\s*)?years?/i);
  const years = yearsMatch ? yearsMatch[1] : "3";

  const summarySnippet = userSummary
    ? userSummary.replace(/\.$/, "").slice(0, 90)
    : `a ${role} developer with ${years} years of experience`;

  // Build links line — only include links the user actually provided
  const linkParts: string[] = [];
  if (userLinks?.portfolio) linkParts.push(`Portfolio: ${userLinks.portfolio}`);
  if (userLinks?.github)    linkParts.push(`GitHub: ${userLinks.github}`);
  if (userLinks?.linkedin)  linkParts.push(`LinkedIn: ${userLinks.linkedin}`);
  const linksLine = linkParts.length ? `\n\n${linkParts.join("  ·  ")}` : "";

  // Build project highlight text for this specific role
  let projectHighlight = "";
  if (highlightedProjects.length === 1) {
    projectHighlight = ` A project directly relevant to this role: ${highlightedProjects[0]}.`;
  } else if (highlightedProjects.length >= 2) {
    projectHighlight =
      ` Relevant projects I've built: (1) ${highlightedProjects[0]}. (2) ${highlightedProjects[1]}.`;
  }

  // Personalized cover note — role-specific, project-highlighted, with links
  const coverNote =
    `${firstName} here — ${summarySnippet}. ` +
    `For the ${jobTitle} role at ${company}, my ${primarySkill}` +
    (matchedSkills.length > 1 ? ` and ${secondarySkill} expertise` : " expertise") +
    ` directly aligns with what you're looking for.` +
    projectHighlight +
    (matchedSkills.length >= 3
      ? ` My hands-on experience with ${matchedSkills.slice(0, 3).join(", ")} maps directly to this role's requirements.`
      : "") +
    linksLine;

  // Why company answer
  const whyCompany = COMPANY_WHY[company] ?? DEFAULT_WHY(company);

  // Experience answer — includes a project reference if available
  const experienceAnswer =
    `${years} years of hands-on experience with ${primarySkill}` +
    (matchedSkills.length > 1 ? `, and ${Math.max(1, parseInt(years) - 1)}+ years with ${secondarySkill}` : "") +
    ". I've shipped production applications serving real users." +
    (highlightedProjects.length > 0
      ? ` Key example: ${highlightedProjects[0].slice(0, 120)}.`
      : "");

  // Strengths — role-specific
  const strengthsMap: Record<string, string> = {
    frontend:  `Strong component architecture thinking, performance optimisation, and an eye for UI detail. I write clean, maintainable ${primarySkill} code and care deeply about user experience.`,
    backend:   `System design, API design, and writing reliable, scalable services. I'm comfortable with databases, caching layers, and building APIs that survive real production load.`,
    fullstack: `Ability to own features end-to-end — from database schema to UI. I'm equally comfortable in ${primarySkill} on the frontend and ${secondarySkill} on the backend.`,
    mobile:    `Building smooth, native-feeling mobile experiences. I understand platform nuances and write performant ${primarySkill} code that feels right on device.`,
    devops:    `Infrastructure as code, CI/CD pipeline design, and reducing toil for engineering teams. I've hands-on experience with ${matchedSkills.slice(0, 2).join(" and ")}.`,
    data:      `Translating raw data into actionable insight. Strong with ${primarySkill} for analysis and building ML pipelines that work in production, not just notebooks.`,
    ui:        `Translating design specs into pixel-perfect, accessible interfaces. I bridge design and engineering and take ownership of visual and interaction quality.`,
    java:      `Building robust, scalable Java services. I understand design patterns, JVM performance, and writing backend code that survives production traffic.`,
  };
  const strengthsAnswer = strengthsMap[role] ?? strengthsMap.frontend;

  return {
    matchedSkills,
    missingSkills,
    coverNote,
    whyCompany,
    experienceAnswer,
    strengthsAnswer,
    matchScore,
    highlightedProjects,
  };
}
