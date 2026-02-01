//C:\Changshin\test\electron-app_final\src\renderer\components\pageTitles.ts
export const PageTitleKeys = {
  ESCAN_HEADER: "app.title.escanHeader",
  ESCAN_REPRINT: "app.title.escanReprint",
  ESCAN_KEYIN: "app.title.escanKeyin"
  // 앞으로 화면 늘어나면 여기만 추가
} as const;

export type PageTitleKey = (typeof PageTitleKeys)[keyof typeof PageTitleKeys];