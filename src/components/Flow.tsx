export type FlowItem = { label: string; detail?: string; state: "todo" | "now" | "done" | "stop"; href?: string };
/** Numbered step list used by payments, launches and swaps. */
export function Flow({ items, label }: { items: FlowItem[]; label: string }) {
  return (
    <ol className="flow" aria-label={label}>
      {items.map((t, i) => (
        <li key={`${t.label}-${i}`} className={`flow-step flow-${t.state}`} aria-current={t.state === "now" ? "step" : undefined}>
          <span className="flow-n num" aria-hidden="true">{t.state === "done" ? "✓" : i + 1}</span>
          <span>
            <strong>{t.label}</strong>
            <span className="visually-hidden">{t.state === "done" ? ", done" : t.state === "stop" ? ", stopped" : t.state === "now" ? ", current step" : ""}</span>
            {t.detail && <span className="muted">{t.detail}</span>}
            {t.href && <a href={t.href} target="_blank" rel="noreferrer" className="mono-wrap">View on explorer</a>}
          </span>
        </li>
      ))}
    </ol>
  );
}
