// Firebase 設定（網頁用的公開設定，不是機密）
// 取得方式：Firebase 主控台 → 專案設定 → 一般 → 「您的應用程式」→ 新增網頁應用程式，把 apiKey 與 projectId 填在下面。
// 兩個都留空 = 停用雲端存檔（只存在這台裝置）。完整步驟與安全規則請看 README「雲端存檔（Firebase）」。
export const FIREBASE = (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__) || {
  apiKey: '',
  projectId: '',
};
