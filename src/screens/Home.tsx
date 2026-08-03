import { useState } from "react";
import { extractVideoId } from "../services/youtube";
import { assertConfigured } from "../services/config";
import { useI18n } from "../i18n";

export function Home({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const { t } = useI18n();
  const missing = assertConfigured();

  function submit() {
    if (!extractVideoId(url)) { setError(t("home.invalidUrl")); return; }
    setError("");
    onSubmit(url);
  }

  return (
    <div className="home">
      <h1 className="home-wordmark">
        <span className="m2">mix2</span><span className="list">list</span>
      </h1>
      <p className="home-tagline">{t("home.tagline")}</p>

      <div className="url-field">
        <input
          className="url-input"
          type="url"
          inputMode="url"
          placeholder={t("home.placeholder")}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          aria-label="YouTube URL"
        />
        <button className="url-submit" onClick={submit} disabled={!url.trim()}>
          {t("home.analyze")}
          <span className="arw" aria-hidden>→</span>
        </button>
      </div>
      {error && <div className="field-error">{error}</div>}

      {missing.length > 0 && (
        <p className="config-note">
          {t("home.missingEnv")}: {missing.map((m) => <code key={m}>{m} </code>)}
          <br />{t("home.missingHint")}
        </p>
      )}
    </div>
  );
}
