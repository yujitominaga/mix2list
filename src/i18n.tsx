import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Lang = "en" | "ja";

type Dict = Record<string, { en: string; ja: string }>;

// All UI copy lives here. Keep keys semantic, not positional.
const DICT: Dict = {
  "home.tagline": {
    en: "Turn any YouTube DJ mix into a Spotify playlist — tracks identified, harmonically ordered, ready to play.",
    ja: "YouTube の DJ ミックスを Spotify プレイリストに。曲を特定し、ハーモニックに並べ替えて、すぐ再生。",
  },
  "home.placeholder": { en: "Paste a YouTube mix URL", ja: "YouTube ミックスの URL を貼り付け" },
  "home.analyze": { en: "Analyze", ja: "解析" },
  "home.invalidUrl": { en: "Enter a valid YouTube URL.", ja: "有効な YouTube URL を入力してください。" },
  "home.missingEnv": { en: "Missing environment variables", ja: "環境変数が未設定です" },
  "home.missingHint": {
    en: "Add them to .env to enable analysis and playlist creation.",
    ja: ".env に設定すると解析とプレイリスト作成が有効になります。",
  },

  "nav.back": { en: "Back", ja: "戻る" },
  "nav.newMix": { en: "New mix", ja: "新しいミックス" },
  "nav.connect": { en: "Connect Spotify", ja: "Spotify を接続" },
  "nav.connected": { en: "Connected", ja: "接続済み" },

  "preview.analyze": { en: "Analyze", ja: "解析する" },
  "preview.watch": { en: "Watch on YouTube", ja: "YouTubeで観る" },
  "preview.hint": {
    en: "Check the video on YouTube before analyzing. Longer mixes take longer.",
    ja: "解析前にYouTubeで動画を確認できます。ミックスが長いほど解析に時間がかかります。",
  },

  "analyzing.step1": { en: "Analyzing audio and tracklist", ja: "音声とトラックリストを解析中" },
  "analyzing.step2": { en: "Collecting detected tracks", ja: "検出したトラックを収集中" },
  "analyzing.step3": { en: "Reordering harmonically", ja: "ハーモニックに並べ替え中" },
  "analyzing.status": { en: "Analyzing", ja: "解析中" },

  "result.generate": { en: "Generate playlist", ja: "プレイリストを作成" },
  "result.generating": { en: "Generating", ja: "作成中" },
  "result.connectFirst": { en: "Connect Spotify to generate", ja: "作成には Spotify 接続が必要" },
  "result.songs": { en: "tracks", ja: "曲" },
  "result.confHigh": { en: "High confidence", ja: "精度 高" },
  "result.confMed": { en: "Medium confidence", ja: "精度 中" },
  "result.confLow": { en: "Low confidence", ja: "精度 低" },
  "result.estNote": {
    en: "BPM and key are estimated. Mix settings are recommendations for Spotify's Mix feature — set them by hand in the app.",
    ja: "BPM・キーは推定値です。ミックス設定は Spotify の Mix 機能への提案です。アプリで手動設定してください。",
  },
  "result.unmatched": { en: "unmatched", ja: "未一致" },
  "result.coverNote": { en: "Cover uses the video thumbnail.", ja: "カバーは動画のサムネイルを使用します。" },
  "result.play": { en: "Play preview", ja: "プレビュー再生" },
  "result.pause": { en: "Pause preview", ja: "一時停止" },

  "col.title": { en: "Title", ja: "タイトル" },
  "col.bpm": { en: "BPM", ja: "BPM" },
  "col.key": { en: "Key", ja: "キー" },
  "col.time": { en: "Time", ja: "時間" },

  "mix.into": { en: "into", ja: "への繋ぎ" },

  "snack.generating": { en: "Generating playlist", ja: "プレイリストを作成中" },
  "snack.searching": { en: "Searching Spotify for tracks", ja: "Spotify でトラックを検索中" },
  "snack.creating": { en: "Creating playlist", ja: "プレイリストを作成中" },
  "snack.ready": { en: "Playlist ready", ja: "プレイリスト完成" },
  "snack.goto": { en: "Open in Spotify", ja: "Spotify で開く" },
  "snack.noMatch": { en: "No matching tracks found.", ja: "一致するトラックが見つかりませんでした。" },
  "snack.loginFirst": { en: "Connect Spotify first.", ja: "先に Spotify を接続してください。" },
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: keyof typeof DICT | string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const t = useCallback(
    (key: string) => {
      const entry = DICT[key];
      if (!entry) return key;
      return entry[lang];
    },
    [lang]
  );
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n must be used within I18nProvider");
  return c;
}
