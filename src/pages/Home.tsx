import { useState } from "react";
import { EMPTY, LaunchForm, type LaunchFields } from "../components/Launch";
import { JobsBoard, ServicePicker, SwarmCheckout, SwarmStats } from "../components/Swarm";
import type { Launched } from "../lib/store";
import { TrendingList } from "./Discover";

/** LAUNCH + BUILD WITH SWARM: two independent tracks sharing one brief. */
export function Home() {
  const [f, setF] = useState<LaunchFields>(EMPTY);
  const [launched, setLaunched] = useState<Launched | null>(null);
  const [services, setServices] = useState<string[]>(["website", "image"]);
  const [idea, setIdea] = useState("");
  const [repo, setRepo] = useState("");
  const token = f.name ? { name: f.name, symbol: f.symbol, mint: launched?.mint } : undefined;
  const brief = idea || f.description;
  return (
    <>
      <section className="wrap hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Idea in. Ecosystem out.</h1>
          <p className="lede">Launch a Solana token in one step while IMD Swarm builds the rest.</p>
          <div className="actions">
            <a className="button button-small" href="#build">Build with IMD Swarm</a>
            <a className="button button-small hide-sm" href="#/swap">Swap IMD, ETH, SOL</a>
          </div>
        </div>
        <div className="card launch-card">
          <h2 id="launch-title">Launch + build</h2>
          <LaunchForm f={f} setF={setF} onLaunched={setLaunched} />
        </div>
      </section>

      <section className="wrap section" id="build" aria-labelledby="build-title">
        <div className="section-head"><h2 id="build-title" className="page-title">Build with IMD Swarm</h2><span className="pill">0.5 IMD per job</span></div>
        <p className="muted">Runs on its own track: the token launch never waits for these jobs, and these jobs never wait for the launch.</p>
        <div className="token-grid">
          <div className="card stack">
            <ServicePicker value={services} onChange={setServices} />
            <div className="field">
              <label htmlFor="b-idea">Describe the project</label>
              <textarea id="b-idea" rows={4} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={f.description || "A cat-themed community token for harbour towns, playful and warm, with a site that explains how to buy."} />
              {!idea && f.description && <p className="hint">Using the token description until you write a brief.</p>}
            </div>
            {services.includes("audit") && <div className="field"><label htmlFor="b-repo">Repository to audit</label><input id="b-repo" value={repo} onChange={(e) => setRepo(e.target.value.trim())} placeholder="https://github.com/…" inputMode="url" /></div>}
          </div>
          <div className="stack">
            <div className="card"><h2>Pay and start</h2><SwarmCheckout serviceIds={services} idea={brief} token={token} repo={repo} /></div>
          </div>
        </div>
      </section>

      <section className="wrap section" aria-labelledby="jobs-title">
        <h2 id="jobs-title">Your Swarm jobs</h2>
        <JobsBoard empty="Paid jobs appear here with their job ID, workers and deliverables." />
      </section>

      <section className="wrap section" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          <li className="card"><h3>Create</h3><p className="muted">Name, ticker, image and an optional first buy. The metadata is written for you.</p></li>
          <li className="card"><h3>Trade on the curve</h3><p className="muted">Price follows a Raydium LaunchLab bonding curve as people buy and sell.</p></li>
          <li className="card"><h3>Graduate</h3><p className="muted">At 85 SOL raised, liquidity moves to a Raydium pool and DexScreener lists it.</p></li>
          <li className="card"><h3>Build with Swarm</h3><p className="muted">AI workers build the website, contracts, art, audio, video and posts, paid in IMD.</p></li>
        </ol>
      </section>
      <section className="wrap section" aria-labelledby="trend-title">
        <div className="section-head"><h2 id="trend-title">Trending on Solana</h2><a href="#/discover">See all</a></div>
        <TrendingList limit={6} />
      </section>
      <section className="wrap section"><SwarmStats /></section>
    </>
  );
}
