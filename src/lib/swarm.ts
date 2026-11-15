import { keccak256, stringToHex, zeroAddress } from "viem";
import { IMD_API } from "../config";

/**
 * Services map to real IMD Swarm skills listed at api.imd.fun/skills. Each selected service is one
 * job, paid separately through IMD Intakev2 at the intake's own priceOf().
 */
export interface Service { id: string; label: string; skill: string; hint: string; brief: string; needsRepo?: boolean }
export const SERVICES: Service[] = [
  { id: "website", label: "Website or landing page", skill: "build-website", hint: "Responsive site on IPFS", brief: "Build its website: a responsive landing page with the brand, token details and how to buy." },
  { id: "contracts", label: "Smart contracts", skill: "build-contract-project", hint: "Tested Foundry project", brief: "Build and test the smart contracts the project needs as a Foundry project." },
  { id: "nft", label: "NFT collection", skill: "build-contract-project", hint: "ERC-721 contract and tests", brief: "Build and test an ERC-721 NFT collection contract for the project with a mint price, a supply cap and a metadata URI setting." },
  { id: "audit", label: "Security audit or code review", skill: "audit-imported-code", hint: "Needs a public repository", needsRepo: true, brief: "Audit the contracts in the repository named below and report only reproducible findings." },
  { id: "oracle", label: "Oracle integration", skill: "build-contract-project", hint: "IMD oracle consumer contract", brief: "Build and test a contract that buys an IdentityMD oracle answer through the Intake and verifies the signed attestation." },
  { id: "game", label: "Game or mini-app", skill: "build-website", hint: "Playable on a phone", brief: "Build a small browser game themed on the project, playable on a phone." },
  { id: "image", label: "Images and logo", skill: "create-image", hint: "Square logo image", brief: "Create its logo as a square image on a plain background." },
  { id: "audio", label: "Audio and music", skill: "create-audio", hint: "Short theme track", brief: "Produce a short theme track for the project." },
  { id: "video", label: "Video or animation", skill: "create-video", hint: "Short launch video", brief: "Produce a short launch video for the project." },
  { id: "marketing", label: "Branding and marketing", skill: "research-report", hint: "Sourced go-to-market plan", brief: "Write a brand and go-to-market plan with positioning, channels, a two-week calendar and success measures." },
  { id: "social", label: "X and Telegram content", skill: "research-report", hint: "Launch posts and calendar", brief: "Write ten X posts and three Telegram announcements for the launch, plain and factual, with no price promises." },
  { id: "docs", label: "Documentation and tokenomics", skill: "research-report", hint: "Docs and allocation report", brief: "Write the project's documentation and a tokenomics report covering supply, allocation, vesting and risks." },
  { id: "app", label: "Full application or dApp", skill: "build-website", hint: "Working single-page app", brief: "Build a working single-page web app for the project." },
  { id: "research", label: "Research report", skill: "research-report", hint: "Other: any sourced question", brief: "Research the project's market and competitors and report with sources and uncertainty." },
];
export const PACKAGE = ["website", "image", "marketing", "social", "docs"];

export interface TokenRef { name: string; symbol: string; mint?: string }
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/, "") || "imd-project";

export function buildBody(svc: Service, idea: string, token?: TokenRef, repo?: string, parentJobId?: string) {
  const t = token?.name ? ` The project's Solana token is ${token.name} (${token.symbol.toUpperCase()})${token.mint ? `, mint ${token.mint}` : ""}.` : "";
  const r = svc.needsRepo && repo ? ` Repository: ${repo}.` : "";
  const body: Record<string, unknown> = { objective: `${idea.trim()}${t} ${svc.brief}${r}`.slice(0, 8000), skill: svc.skill };
  if (svc.skill === "build-website") body.ipfs = slug(token?.name || idea.split(/\s+/).slice(0, 4).join(" "));
  if (parentJobId) body.parentJobId = parentJobId;
  return body;
}
export const actionName = (parent?: string) => (parent ? "job.continue" : "job.open");
export const actionId = (a: string) => stringToHex(`${a}@job-1`, { size: 32 });
export const encodeBody = (b: unknown) => stringToHex(JSON.stringify(b));
export const fingerprint = (a: string, b: unknown) => keccak256(stringToHex(`${a}\n${JSON.stringify(b)}`));
/** No on-chain callback: the IMD API reads the request event instead. */
export const NO_CALLBACK = { target: zeroAddress, selector: "0x00000000" as `0x${string}` };

async function api<T>(path: string): Promise<T | null> {
  const r = await fetch(`${IMD_API}${path}`, { headers: { accept: "application/json" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`IMD API ${r.status}`);
  return r.json() as Promise<T>;
}
export interface SwarmHealth { health: { agentsOnline: number; workingNow: number; seatsEnrolled: number; jobsDoneLastDay: number }; counts: { jobs: number; sites: number; launchesLive: number } }
export const getSwarm = () => api<SwarmHealth>("/swarm");

export type Admission = { kind: "unseen" } | { kind: "seen" } | { kind: "refused"; reason: string } | { kind: "admitted"; jobId: string };
export async function getAdmission(tx: string): Promise<Admission> {
  const j = await api<{ entries?: { state?: string; reason?: string; admission?: { result?: { jobId?: string } } }[] }>(`/intake/1/${tx}`);
  const e = j?.entries?.[0];
  if (!e) return { kind: "unseen" };
  if (e.state === "refused") return { kind: "refused", reason: e.reason ?? "refused by the intake" };
  const id = e.admission?.result?.jobId;
  return id ? { kind: "admitted", jobId: id } : { kind: "seen" };
}
export interface JobTask { id?: string; role?: string; skill?: string; state?: string; seat?: string | number; tokenId?: number | string; agentId?: string; worker?: string }
/** One workflow node as api.imd.fun/jobs/:id returns it: the assignment, its state and the seat (IMD NFT worker) holding it. */
export interface JobNode { key: string; role?: string; state?: string; attempt?: number; failureReason?: string | null; updatedAt?: string; seat?: { tokenId?: string | number | null; agentId?: string | number | null } | null }
export interface Job { id: string; state: string; template?: string; blockedReason?: string | null; updatedAt?: string; createdAt?: string; nodes?: JobNode[] | null; tasks?: JobTask[]; workflow?: { items?: JobTask[] } | null }
/** A worker assignment ready to render, whichever shape the job used. */
export interface Assignment { id: string; label: string; state: string; seat?: string; agent?: string; failure?: string }
export function assignments(job: Job | null): Assignment[] {
  if (!job) return [];
  if (job.nodes?.length) return job.nodes.map((n) => ({
    id: n.key, label: `${n.key.replace(/_/g, " ")}${n.role ? ` (${n.role})` : ""}`, state: n.state ?? "pending",
    seat: n.seat?.tokenId != null ? String(n.seat.tokenId) : undefined, agent: n.seat?.agentId != null ? String(n.seat.agentId) : undefined, failure: n.failureReason ?? undefined,
  }));
  return (job.tasks ?? job.workflow?.items ?? []).map((t, i) => ({
    id: t.id ?? String(i), label: t.role ?? t.skill ?? "task", state: t.state ?? "pending",
    seat: t.seat != null ? String(t.seat) : t.tokenId != null ? String(t.tokenId) : undefined, agent: t.agentId,
  }));
}
export const getJob = (id: string) => api<Job>(`/jobs/${encodeURIComponent(id)}`);
export interface JobResult { state: string; complete: boolean; files: { name: string; path: string; url: string; bytes: number; mediaType: string }[]; source?: { node: string; url?: string; hash?: string }[]; delivery?: { repoUrl?: string | null; commit?: string | null; siteUrl?: string | null; ensName?: string | null } }
export const getResult = (id: string) => api<JobResult>(`/jobs/${encodeURIComponent(id)}/result`);
export const terminal = (s?: string) => s === "completed" || s === "blocked" || s === "cancelled";
