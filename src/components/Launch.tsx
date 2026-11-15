import { useState, type ChangeEvent, type FormEvent } from "react";
import { OWNER } from "../config";
import { declined, errMsg, solscanTx, toUnits } from "../lib/format";
import { buildMetadata, createToken } from "../lib/launchlab";
import { logTx, notify, useStored, type Launched } from "../lib/store";
import { useSolana } from "../wallet/solana";
import { useWalletSheet } from "../wallet/WalletSheet";

export interface LaunchFields { name: string; symbol: string; image: string; description: string; website: string; x: string; telegram: string; buy: string; uri: string }
export const EMPTY: LaunchFields = { name: "", symbol: "", image: "", description: "", website: "", x: "", telegram: "", buy: "", uri: "" };

/** Token track: independent of Swarm. Creates the mint and its LaunchLab curve from the visitor's own wallet. */
export function LaunchForm({ f, setF, onLaunched }: { f: LaunchFields; setF(f: LaunchFields): void; onLaunched(l: Launched): void }) {
  const { address, provider, cluster } = useSolana();
  const { open } = useWalletSheet();
  const [, setLaunched] = useStored<Launched[]>("launched", []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<{ k: "form" } | { k: "review" } | { k: "signing"; msg: string } | { k: "error"; msg: string } | { k: "done"; l: Launched }>({ k: "form" });
  const [mainnetOk, setMainnetOk] = useState(false);
  const [preview, setPreview] = useState("");
  const set = (k: keyof LaunchFields) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: k === "symbol" ? e.target.value.toUpperCase() : e.target.value });
  const meta = buildMetadata(f);
  const auto = !!OWNER.metadataUploadUrl;

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" }));
    a.download = `${f.symbol || "token"}-metadata.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.name.trim() || f.name.length > 32) er.name = "Give the token a name of up to 32 characters.";
    if (!/^[A-Z0-9]{2,10}$/.test(f.symbol.trim())) er.symbol = "Use 2 to 10 letters or digits.";
    if (!/^(https|ipfs|ar):\/\//.test(f.image.trim())) er.image = "Paste an https, ipfs or ar link to the image.";
    if (f.buy && toUnits(f.buy, 9) == null) er.buy = "Enter an amount of SOL such as 0.5.";
    if (!auto && !/^(https|ipfs|ar):\/\//.test(f.uri.trim())) er.uri = "Download the metadata file, host it on IPFS or Arweave, then paste its link.";
    if (cluster === "mainnet" && !mainnetOk) er.mainnet = "Confirm that this launch spends real SOL.";
    setErrors(er);
    const first = Object.keys(er)[0];
    if (first) { document.getElementById(`f-${first}`)?.focus(); return; }
    setStage({ k: "review" });
  }
  async function launch() {
    if (!provider || !address) return open("solana");
    try {
      let uri = f.uri.trim();
      if (auto) {
        setStage({ k: "signing", msg: "Pinning the metadata…" });
        const r = await fetch(OWNER.metadataUploadUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(meta) });
        if (!r.ok) throw new Error(`metadata upload failed (${r.status})`);
        uri = (await r.json()).uri;
      }
      setStage({ k: "signing", msg: "Approve the launch in your wallet…" });
      const res = await createToken(cluster, provider, { name: f.name.trim(), symbol: f.symbol.trim(), uri, buyLamports: toUnits(f.buy || "0", 9) ?? 0n });
      const l: Launched = { mint: res.mint, name: f.name.trim(), symbol: f.symbol.trim(), image: f.image.trim(), description: f.description.trim(), cluster, creator: address, at: Date.now(), signatures: res.signatures };
      setLaunched((ls) => [l, ...ls]);
      res.signatures.forEach((s) => logTx({ id: s, chain: "solana", cluster, kind: "launch", label: `Launch ${l.symbol}`, status: "confirmed", account: address }));
      notify(`${l.symbol} launched on Solana ${cluster}.`, `#/token/${l.mint}`);
      setStage({ k: "done", l }); onLaunched(l);
    } catch (e) {
      const m = errMsg(e);
      setStage({ k: "error", msg: declined(m) ? "You declined in your wallet. Nothing was sent." : `The launch didn't go through: ${m}` });
    }
  }
  const fieldProps = (k: string) => ({ id: `f-${k}`, "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `e-${k}` : undefined });
  const Err = ({ k }: { k: string }) => (errors[k] ? <p className="error" id={`e-${k}`}>{errors[k]}</p> : null);

  if (stage.k === "done") return (
    <div className="stack-tight" role="status">
      <h3>{stage.l.symbol} is live on Solana {stage.l.cluster}</h3>
      <p className="muted">Trading is open on its LaunchLab bonding curve. Your Swarm jobs run on their own track below.</p>
      <p className="mono-wrap num">{stage.l.mint}</p>
      <div className="actions">
        <a className="button button-primary" href={`#/token/${stage.l.mint}`}>Open the token page</a>
        <a className="button" href={`#/studio/${stage.l.mint}`}>Open its Studio</a>
        {stage.l.signatures[0] && <a className="button button-quiet" href={solscanTx(stage.l.signatures[0], stage.l.cluster)} target="_blank" rel="noreferrer">Transaction</a>}
      </div>
      <button type="button" className="link-button" onClick={() => { setF(EMPTY); setPreview(""); setStage({ k: "form" }); }}>Launch another</button>
    </div>
  );
  if (stage.k !== "form") return (
    <div className="stack-tight">
      <h3>Review and sign</h3>
      <dl className="facts">
        <div><dt>Token</dt><dd>{f.name} ({f.symbol})</dd></div>
        <div><dt>Network</dt><dd>Solana {cluster}</dd></div>
        <div><dt>Supply</dt><dd className="num">1,000,000,000</dd></div>
        <div><dt>Curve</dt><dd>Raydium LaunchLab, graduates to a Raydium pool at 85 SOL</dd></div>
        <div><dt>Your first buy</dt><dd className="num">{f.buy || "0"} SOL</dd></div>
        <div><dt>Authorities</dt><dd>Mint and freeze authority revoked by LaunchLab</dd></div>
        <div><dt>Metadata</dt><dd className="mono-wrap">{auto ? "Pinned automatically" : f.uri}</dd></div>
      </dl>
      <p className="hint">Your wallet shows each transaction before you sign. Network fees are about 0.02 SOL.</p>
      {stage.k === "error" && <p className="error" role="alert">{stage.msg}</p>}
      <div className="actions">
        <button type="button" className="button button-primary button-wide" onClick={launch} disabled={stage.k === "signing"}>{stage.k === "signing" ? stage.msg : address ? "Create & launch" : "Connect Phantom or Solflare"}</button>
        <button type="button" className="button button-quiet" onClick={() => setStage({ k: "form" })} disabled={stage.k === "signing"}>Edit</button>
      </div>
    </div>
  );
  return (
    <form className="stack-tight" onSubmit={submit} noValidate aria-label="Create a token">
      <div className="grid-2">
        <div className="field"><label htmlFor="f-name">Name</label><input {...fieldProps("name")} value={f.name} onChange={set("name")} placeholder="Harbor Cat" maxLength={32} autoComplete="off" /><Err k="name" /></div>
        <div className="field"><label htmlFor="f-symbol">Ticker</label><input {...fieldProps("symbol")} value={f.symbol} onChange={set("symbol")} placeholder="HCAT" maxLength={10} autoComplete="off" /><Err k="symbol" /></div>
      </div>
      <div className="field">
        <label htmlFor="f-image">Image link</label>
        <div className="image-row">
          <label className="thumb-pick" title="Preview a file">
            {preview || f.image ? <img className="thumb" src={preview || f.image} alt="" width={44} height={44} /> : <span className="thumb thumb-empty thumb-add" aria-hidden="true">+</span>}
            <input className="visually-hidden" type="file" accept="image/*" aria-label="Preview an image file" onChange={(e) => { const file = e.target.files?.[0]; if (file) setPreview(URL.createObjectURL(file)); }} />
          </label>
          <input {...fieldProps("image")} value={f.image} onChange={set("image")} placeholder="ipfs://… or https://…" inputMode="url" />
        </div>
        <Err k="image" />
      </div>
      <details className="details">
        <summary>Description, socials and first buy</summary>
        <div className="stack-tight">
          <div className="field"><label htmlFor="f-description">Description</label><textarea id="f-description" rows={2} value={f.description} onChange={set("description")} maxLength={500} /></div>
          <div className="grid-3">
            <div className="field"><label htmlFor="f-website">Website</label><input id="f-website" value={f.website} onChange={set("website")} inputMode="url" /></div>
            <div className="field"><label htmlFor="f-x">X</label><input id="f-x" value={f.x} onChange={set("x")} placeholder="@handle" /></div>
            <div className="field"><label htmlFor="f-telegram">Telegram</label><input id="f-telegram" value={f.telegram} onChange={set("telegram")} placeholder="@group" /></div>
          </div>
          <div className="field"><label htmlFor="f-buy">Initial buy (SOL, optional)</label><input {...fieldProps("buy")} value={f.buy} onChange={set("buy")} inputMode="decimal" placeholder="0" /><Err k="buy" /></div>
        </div>
      </details>
      {!auto && (
        <div className="field">
          <div className="field-head"><label htmlFor="f-uri">Metadata link</label><button type="button" className="link-button" onClick={download}>Download metadata.json</button></div>
          <input {...fieldProps("uri")} value={f.uri} onChange={set("uri")} placeholder="ipfs://… after hosting the file" inputMode="url" />
          <Err k="uri" />
          <p className="hint">The metadata is written for you from these fields. This site has no server, so host the file on IPFS or Arweave and paste its link.</p>
        </div>
      )}
      {cluster === "mainnet" && <label className="check"><input id="f-mainnet" type="checkbox" checked={mainnetOk} onChange={(e) => setMainnetOk(e.target.checked)} /> This launch spends real SOL on mainnet.</label>}
      <Err k="mainnet" />
      <div className="actions">
        <button type="submit" className="button button-primary button-wide">Create & launch</button>
      </div>
      <p className="hint">Solana {cluster}. {cluster === "devnet" ? "Switch to mainnet in Wallets when you're ready." : "Real SOL."}</p>
    </form>
  );
}
