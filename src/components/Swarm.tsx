import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useBalance, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { ETH_CHAIN_ID, EXPECTED_JOB_FEE, IMD_EXPLORER, IMD_INTAKE, IMD_TOKEN } from "../config";
import { declined, errMsg, etherscanAddr, etherscanTx, fmtUnits, short } from "../lib/format";
import { belongsTo, logTx, mintForProject, notify, updateTx, useStored, type Launched, type SwarmOrder } from "../lib/store";
import { PACKAGE, SERVICES, actionId, actionName, buildBody, encodeBody, fingerprint, getAdmission, getJob, getResult, getSwarm, terminal, assignments, NO_CALLBACK, type Job, type JobResult, type SwarmHealth, type TokenRef } from "../lib/swarm";
import { ERC20, INTAKE_ABI } from "../wallet/eth";
import { useWalletSheet } from "../wallet/WalletSheet";
import { Flow, type FlowItem } from "./Flow";

/** Service checkboxes with a one-tap complete package. */
export function ServicePicker({ value, onChange }: { value: string[]; onChange(v: string[]): void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const isPackage = PACKAGE.every((id) => value.includes(id)) && value.length === PACKAGE.length;
  return (
    <fieldset className="field">
      <legend>What should IMD Swarm build?</legend>
      <div className="actions">
        <button type="button" className="button button-small" aria-pressed={isPackage} onClick={() => onChange(isPackage ? [] : PACKAGE)}>{isPackage ? "Clear the package" : "Complete project package (5 jobs)"}</button>
        {value.length > 0 && !isPackage && <button type="button" className="link-button" onClick={() => onChange([])}>Clear</button>}
      </div>
      <div className="choice-grid">
        {SERVICES.map((s) => (
          <label key={s.id} className="choice">
            <input type="checkbox" checked={value.includes(s.id)} onChange={() => toggle(s.id)} />
            <span><strong>{s.label}</strong><span className="muted">{s.hint}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Pays IMD Intakev2 for each selected service, one job per service, never more than once per brief unless asked. */
/** `project` is the shared local project ID that ties these jobs to a token launched before or after them. */
export function SwarmCheckout({ serviceIds, idea, token, repo, parent, project }: { serviceIds: string[]; idea: string; token?: TokenRef; repo?: string; parent?: string; project?: string }) {
  const { open } = useWalletSheet();
  const { address, chainId, connector } = useAccount();
  const { switchChain } = useSwitchChain();
  const pc = usePublicClient({ chainId: ETH_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [orders, setOrders] = useStored<SwarmOrder[]>("swarm-orders", []);
  const [confirm, setConfirm] = useState(false);
  const [again, setAgain] = useState(false);
  const [phase, setPhase] = useState<"idle" | "approving" | "paying" | "done">("idle");
  const [paid, setPaid] = useState(0);
  const [err, setErr] = useState("");
  const busy = useRef(false);

  const action = actionName(parent);
  const services = SERVICES.filter((s) => serviceIds.includes(s.id));
  const jobs = useMemo(() => services.map((s) => { const body = buildBody(s, idea, token, repo, parent); return { svc: s, body, fp: fingerprint(action, body) }; }), [services, idea, token, repo, parent, action]);
  const dupes = jobs.filter((j) => orders.some((o) => o.fp === j.fp));

  const price = useReadContract({ address: IMD_INTAKE, abi: INTAKE_ABI, functionName: "priceOf", args: [actionId(action), IMD_TOKEN], chainId: ETH_CHAIN_ID });
  const fee = price.data as bigint | undefined;
  const feeProblem = price.isError ? "The fee couldn't be read from IMD Intakev2. Check your connection and reload." : fee == null ? null : fee === 0n ? "IMD Intakev2 doesn't sell this action right now, so nothing can be paid." : fee !== EXPECTED_JOB_FEE ? `IMD Intakev2 now asks ${fmtUnits(fee, 18)} IMD instead of 0.5 IMD. The site won't pay a different amount until it is reviewed.` : null;
  const feeOk = fee != null && !feeProblem;
  const total = feeOk ? fee! * BigInt(jobs.length) : null;
  const bal = useReadContract({ address: IMD_TOKEN, abi: ERC20, functionName: "balanceOf", args: address ? [address] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const allowance = useReadContract({ address: IMD_TOKEN, abi: ERC20, functionName: "allowance", args: address ? [address, IMD_INTAKE] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const eth = useBalance({ address, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const wrongChain = !!address && chainId !== ETH_CHAIN_ID;
  const ready = !!address && !wrongChain;
  const enough = total != null && (bal.data as bigint | undefined) != null && (bal.data as bigint) >= total;
  const approved = total != null && ((allowance.data as bigint | undefined) ?? 0n) >= total;

  async function pay() {
    if (busy.current || !pc || !address || total == null) return;
    setErr("");
    if (!jobs.length) return setErr("Pick at least one service.");
    if (idea.trim().length < 20) return setErr("Describe the project in at least one full sentence.");
    if (jobs.some((j) => j.svc.needsRepo) && !/^https:\/\/\S+/.test(repo ?? "")) return setErr("An audit needs a public repository link starting with https://.");
    if (!confirm) return setErr(`Confirm the brief and the ${fmtUnits(total, 18)} IMD payment first.`);
    if (dupes.length && !again) return setErr("You already paid for part of this exact brief. Tick “Pay again” only if you want second jobs.");
    busy.current = true; setPaid(0);
    try {
      if (!approved) {
        setPhase("approving");
        const h = await writeContractAsync({ address: IMD_TOKEN, abi: ERC20, functionName: "approve", args: [IMD_INTAKE, total], chainId: ETH_CHAIN_ID });
        logTx({ id: h, chain: "ethereum", kind: "approve", label: `Approve ${fmtUnits(total, 18)} IMD for Swarm`, status: "pending", account: address });
        const r = await pc.waitForTransactionReceipt({ hash: h });
        updateTx(h, r.status === "success" ? "confirmed" : "failed");
        if (r.status !== "success") throw new Error("the approval reverted");
        await allowance.refetch();
      }
      setPhase("paying");
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        const args = [actionId(action), encodeBody(j.body), NO_CALLBACK, IMD_TOKEN, fee!] as const;
        await pc.simulateContract({ account: address, address: IMD_INTAKE, abi: INTAKE_ABI, functionName: "request", args });
        const h = await writeContractAsync({ address: IMD_INTAKE, abi: INTAKE_ABI, functionName: "request", args, chainId: ETH_CHAIN_ID });
        const order: SwarmOrder = { tx: h, fp: j.fp, service: j.svc.id, label: j.svc.label, objective: String(j.body.objective), at: Date.now(), payer: address, mint: token?.mint ?? (project ? mintForProject(project) : undefined), project };
        setOrders((o) => [order, ...o.filter((x) => x.tx !== h)]);
        logTx({ id: h, chain: "ethereum", kind: "swarm", label: `Swarm job: ${j.svc.label}`, status: "pending", account: address });
        const r = await pc.waitForTransactionReceipt({ hash: h });
        updateTx(h, r.status === "success" ? "confirmed" : "failed");
        if (r.status !== "success") { setOrders((o) => o.filter((x) => x.tx !== h)); throw new Error(`the payment for ${j.svc.label} reverted, so no IMD moved for it`); }
        setPaid(i + 1);
      }
      setPhase("done"); setAgain(false); setConfirm(false);
      notify(`Paid for ${jobs.length} Swarm job${jobs.length > 1 ? "s" : ""}. Waiting for the IMD API to admit them.`);
      bal.refetch(); allowance.refetch();
    } catch (e) {
      const m = errMsg(e);
      setErr(declined(m) ? "You declined in your wallet. Nothing more was paid." : `Payment didn't complete: ${m}`);
      setPhase("idle");
    } finally { busy.current = false; }
  }

  const steps: FlowItem[] = [
    { label: "Connect MetaMask or Rabby", detail: ready ? `${connector?.name ?? "Wallet"} on Ethereum Mainnet` : wrongChain ? "Switch the wallet to Ethereum Mainnet" : "Ethereum Mainnet, chain ID 1", state: ready ? "done" : "now" },
    { label: "Verify the official fee", detail: feeProblem ?? (feeOk ? `${fmtUnits(fee, 18)} IMD per job, read from IMD Intakev2 (${short(IMD_INTAKE)})` : "Reading priceOf from IMD Intakev2…"), state: feeProblem ? "stop" : feeOk ? "done" : "now" },
    { label: "Review the total", detail: total != null ? `${jobs.length} job${jobs.length === 1 ? "" : "s"} × ${fmtUnits(fee, 18)} IMD = ${fmtUnits(total, 18)} IMD, plus Ethereum gas` : "Pick services to see the total", state: total != null && jobs.length ? "done" : "todo" },
    { label: `Approve exactly ${total != null ? fmtUnits(total, 18) : "the total"} IMD`, detail: approved && jobs.length ? "Approved: the intake can pull this amount and no more" : "One signature, never an unlimited allowance", state: approved && jobs.length ? "done" : phase === "approving" ? "now" : "todo" },
    { label: "Pay and submit each job", detail: phase === "paying" ? `Job ${paid + 1} of ${jobs.length}: confirm in your wallet` : phase === "done" ? `All ${jobs.length} confirmed on Ethereum` : "One signature per job; the intake records each brief", state: phase === "done" ? "done" : phase === "paying" ? "now" : "todo" },
    { label: "Admitted by the IMD API, then built", detail: "Job IDs, workers and deliverables appear under Your Swarm jobs", state: phase === "done" ? "now" : "todo" },
  ];
  const label = phase === "approving" ? "Approving IMD…" : phase === "paying" ? `Paying job ${paid + 1} of ${jobs.length}…` : total != null && jobs.length ? `Build with IMD Swarm: pay ${fmtUnits(total, 18)} IMD` : "Build with IMD Swarm";

  return (
    <div className="stack-tight">
      <details className="details"><summary>See the exact requests</summary><pre className="code">{JSON.stringify(jobs.map((j) => ({ action: `${action}@job-1`, body: j.body })), null, 2)}</pre></details>
      <Flow items={steps} label="Swarm payment steps" />
      {ready && <p className="hint num">Balance: {fmtUnits(bal.data as bigint | undefined, 18)} IMD · {eth.data ? fmtUnits(eth.data.value, 18, 5) : "…"} ETH</p>}
      {ready && total != null && bal.data != null && !enough && <p className="error">This wallet holds less than {fmtUnits(total, 18)} IMD. <a href="#/swap?to=IMD">Swap for IMD</a></p>}
      <label className="check"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> I've checked the brief. Pay {total != null ? fmtUnits(total, 18) : "the fee in"} IMD on Ethereum to start {jobs.length > 1 ? `these ${jobs.length} jobs` : "it"}.</label>
      {dupes.length > 0 && <label className="check hint-warn"><input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} /> You already paid for {dupes.map((d) => d.svc.label).join(", ")} with this exact brief. Pay again for second jobs.</label>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="actions">
        {!address ? <button type="button" className="button button-primary button-wide" onClick={() => open("ethereum")}>Connect MetaMask or Rabby</button>
          : wrongChain ? <button type="button" className="button button-primary button-wide" onClick={() => switchChain({ chainId: ETH_CHAIN_ID })}>Switch to Ethereum Mainnet</button>
          : <button type="button" className="button button-primary button-wide" onClick={pay} disabled={phase === "approving" || phase === "paying" || !feeOk || !jobs.length || !enough}>{label}</button>}
      </div>
      <p className="hint">Payment goes only to IMD Intakev2 at <a href={etherscanAddr(IMD_INTAKE)} target="_blank" rel="noreferrer">{short(IMD_INTAKE)}</a>, in IMD at <a href={etherscanAddr(IMD_TOKEN)} target="_blank" rel="noreferrer">{short(IMD_TOKEN)}</a>.</p>
    </div>
  );
}

/** Every paid order with its admission, job state, workers and deliverables. */
export function JobsBoard({ mint, empty }: { mint?: string; empty?: string }) {
  const [orders] = useStored<SwarmOrder[]>("swarm-orders", []);
  const [launched] = useStored<Launched[]>("launched", []);
  const l = mint ? launched.find((x) => x.mint === mint) : undefined;
  const list = mint ? orders.filter((o) => belongsTo(o, mint, l)) : orders;
  if (!list.length) return <p className="muted">{empty ?? "No Swarm jobs paid from this device yet."}</p>;
  return <ul className="stack-tight">{list.map((o) => <OrderRow key={o.tx} order={o} />)}</ul>;
}

function OrderRow({ order }: { order: SwarmOrder }) {
  const [, setOrders] = useStored<SwarmOrder[]>("swarm-orders", []);
  const [adm, setAdm] = useState<string>(order.jobId ? "admitted" : "Waiting for the IMD API to read the payment…");
  const [job, setJob] = useState<Job | null>(null);
  const [res, setRes] = useState<JobResult | null>(null);
  const [resErr, setResErr] = useState("");
  const jobId = order.jobId;
  useEffect(() => {
    if (jobId) return;
    let live = true;
    const tick = async () => {
      try {
        const a = await getAdmission(order.tx);
        if (!live) return;
        if (a.kind === "admitted") setOrders((os) => os.map((x) => (x.tx === order.tx ? { ...x, jobId: a.jobId } : x)));
        else setAdm(a.kind === "refused" ? `Refused by the intake: ${a.reason}` : a.kind === "seen" ? "Payment seen; admitting the job…" : "Waiting for the IMD API to read the payment…");
      } catch { if (live) setAdm("The IMD API didn't answer; retrying."); }
    };
    void tick(); const t = setInterval(tick, 15000);
    return () => { live = false; clearInterval(t); };
  }, [jobId, order.tx, setOrders]);
  useEffect(() => {
    if (!jobId) return;
    let live = true; let t: ReturnType<typeof setInterval> | undefined;
    const tick = async () => {
      let j: Job | null;
      try { j = await getJob(jobId); } catch { return; /* retry next tick */ }
      if (!live || !j) return;
      setJob(j);
      if (!terminal(j.state)) return;
      // Stop polling only once the deliverables have actually loaded; a failed read retries next tick.
      try {
        const r = await getResult(jobId);
        if (!live) return;
        if (r || j.state !== "completed") { clearInterval(t); setRes(r); setResErr(""); }
        else setResErr("Deliverables aren't published yet. Retrying…");
      } catch { if (live) setResErr("Deliverables could not load. Retrying…"); }
    };
    void tick(); t = setInterval(tick, 15000);
    return () => { live = false; clearInterval(t); };
  }, [jobId]);
  const tasks = assignments(job);
  return (
    <li className="card">
      <div className="section-head"><h3>{order.label}</h3><span className={`pill state-${job?.state ?? "executing"}`}>{job?.state ?? (jobId ? "admitted" : "paid")}</span></div>
      <dl className="facts">
        <div><dt>Payment</dt><dd><a href={etherscanTx(order.tx)} target="_blank" rel="noreferrer" className="num">{short(order.tx, 6)}</a></dd></div>
        <div><dt>Job ID</dt><dd className="num">{jobId ? <a href={`${IMD_EXPLORER}/jobs/${jobId}`} target="_blank" rel="noreferrer">{short(jobId, 6)}</a> : adm}</dd></div>
        {job?.template && <div><dt>Skill</dt><dd>{job.template.replace(/^skill:/, "")}</dd></div>}
        {job?.updatedAt && <div><dt>Updated</dt><dd>{new Date(job.updatedAt).toLocaleString()}</dd></div>}
        {job?.blockedReason && <div><dt>Blocked</dt><dd className="error">{job.blockedReason}</dd></div>}
      </dl>
      {tasks.length > 0 && (
        <ul className="job-steps" aria-label="Worker assignments">
          {tasks.map((t) => <li key={t.id}><span>{t.label}{t.seat ? ` · seat #${t.seat}` : " · no seat yet"}{t.agent ? ` · agent ${t.agent}` : ""}{t.failure ? <span className="error"> · {t.failure}</span> : null}</span><span className={`state-${t.state}`}>{t.state}</span></li>)}
        </ul>
      )}
      {res && (res.files?.length || res.delivery?.repoUrl || res.delivery?.siteUrl || res.source?.length) ? (
        <div className="stack-tight"><h3>Deliverables</h3><ul className="link-list">
          {res.files?.map((f) => <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer">{f.path}</a> <span className="muted num">{(f.bytes / 1024).toFixed(1)} KB</span></li>)}
          {res.delivery?.siteUrl && <li><a href={res.delivery.siteUrl} target="_blank" rel="noreferrer">Published site</a>{res.delivery.ensName && <span className="muted"> {res.delivery.ensName}</span>}</li>}
          {res.delivery?.repoUrl && <li><a href={res.delivery.repoUrl} target="_blank" rel="noreferrer">Delivered repository</a>{res.delivery.commit && <span className="muted num"> {res.delivery.commit.slice(0, 7)}</span>}</li>}
          {res.source?.filter((s) => s.url).map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">Source bundle: {s.node.replace(/_/g, " ")}</a></li>)}
        </ul></div>
      ) : res && job?.state === "completed" ? <p className="muted">The job completed without published files.</p> : null}
      {resErr && !res && <p className="hint hint-warn" role="status">{resErr}</p>}
      {jobId && <div className="actions"><a className="button button-small" href={`#/swarm?parent=${jobId}${order.mint ? `&mint=${order.mint}` : ""}`}>Continue this job</a><a className="button button-small button-quiet" href={`${IMD_EXPLORER}/jobs/${jobId}`} target="_blank" rel="noreferrer">Open in IMD Explorer</a></div>}
    </li>
  );
}

export function SwarmStats() {
  const [s, setS] = useState<SwarmHealth | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let live = true;
    const f = () => getSwarm().then((x) => live && (setS(x), setBad(false))).catch(() => live && setBad(true));
    f(); const t = setInterval(f, 30000);
    return () => { live = false; clearInterval(t); };
  }, []);
  return (
    <div className="card">
      <h2>IMD Swarm right now</h2>
      {bad && !s ? <p className="muted">Live figures didn't load. Try again shortly.</p> : s ? (
        <dl className="stats">
          <div><dt>Agents online</dt><dd className="num">{s.health.agentsOnline.toLocaleString()}</dd></div>
          <div><dt>Working now</dt><dd className="num">{s.health.workingNow.toLocaleString()}</dd></div>
          <div><dt>Jobs done today</dt><dd className="num">{s.health.jobsDoneLastDay.toLocaleString()}</dd></div>
          <div><dt>Sites shipped</dt><dd className="num">{s.counts.sites.toLocaleString()}</dd></div>
        </dl>
      ) : <p className="muted">Loading live figures…</p>}
      <p className="hint">From api.imd.fun, refreshed every 30 seconds.</p>
    </div>
  );
}
