import { VinylLoader } from "../components/VinylLoader";
import { useI18n } from "../i18n";

export type AnalyzePhase = "analyzing" | "found" | "ordering";

export function Analyzing({ phase, foundCount }: { phase: AnalyzePhase; foundCount?: number }) {
  const { t } = useI18n();
  const steps: { key: AnalyzePhase; label: string }[] = [
    { key: "analyzing", label: t("analyzing.step1") },
    { key: "found", label: t("analyzing.step2") },
    { key: "ordering", label: t("analyzing.step3") },
  ];
  const activeIdx = steps.findIndex((s) => s.key === phase);
  const status =
    phase === "analyzing" ? t("analyzing.status")
    : phase === "found" ? `${foundCount ?? 0} ${t("analyzing.found")}`
    : t("analyzing.step3");

  return (
    <div className="analyzing">
      <VinylLoader status={status} />
      <div className="analyzing-steps">
        {steps.map((s, i) => (
          <div key={s.key} className={`astep${i < activeIdx ? " done" : ""}${i === activeIdx ? " active" : ""}`}>
            <span className="astep-marker" />
            {s.label}
            {s.key === "found" && foundCount != null && i <= activeIdx && (
              <span className="astep-count">{foundCount}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
