import type { MixSettings } from "../types";
import { useI18n } from "../i18n";

const VOLUME_LABEL: Record<MixSettings["volume"], string> = {
  "smooth-crossfade": "Smooth crossfade",
  overlap: "Overlap",
  "fade-in-out": "Fade in/out",
  cut: "Cut",
};

function eqSummary(eq: MixSettings["eq"]): string {
  const parts: string[] = [];
  if (eq.low === "swap") parts.push("low swap");
  else if (eq.low === "cut-out") parts.push("low cut");
  if (eq.mid === "duck") parts.push("mid duck");
  if (eq.high === "open") parts.push("high open");
  return parts.length ? parts.join(", ") : "hold";
}

export function MixSettingsBar({ mix }: { mix: MixSettings }) {
  const { t } = useI18n();
  const filter = mix.filter && mix.filter !== "none" ? mix.filter.replace("-", " ") : null;
  return (
    <div className="mixrow" role="group" aria-label="Recommended mix">
      <span className="mixrow-line" />
      <span className="mixrow-tag">mix {t("mix.into")}</span>
      <span className="mixrow-detail">
        <b>{VOLUME_LABEL[mix.volume]}</b> · {eqSummary(mix.eq)}
        {filter ? ` · ${filter}` : ""}
        {mix.bars ? ` · ${mix.bars} bars` : ""}
      </span>
      {mix.note && <span className="mixrow-note">{mix.note}</span>}
    </div>
  );
}
