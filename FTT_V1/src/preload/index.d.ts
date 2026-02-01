//C:\Changshin\test\electron-app_final\src\preload\index.d.ts
import type { ElectronAPI as ToolkitElectronAPI } from "@electron-toolkit/preload";
import type { PreloadElectronAPI } from "../preload/index"; // 프로젝트 구조에 맞게 유지

export {};

declare global {
  // ─────────────────────────────────────────────────────────────
  // 공용 타입들
  // ─────────────────────────────────────────────────────────────
  type PasscardLogLevel = "info" | "warn" | "error";

  interface PasscardLogMsg {
    tag: string;
    payload: any;
    level: PasscardLogLevel;
    ts: string; // ISO
  }

  interface PageSizeMM {
    widthMM: number;
    heightMM: number;
  }

  interface PrinterInfoLite {
    // Electron.PrinterInfo를 그대로 노출하기 어렵다면 최소 필드만
    name: string;
    description?: string;
    status?: number;
    isDefault?: boolean;
    options?: Record<string, any>;
  }

  interface TimeContext {
    now: string; // ISO
    tz?: string;
    source: "plant" | "local" | "unknown";
    workDate?: string; // YYYY-MM-DD
  }

  /**
   * ✅ 입력용(느슨한) 인쇄 옵션 — 화면에서 전달할 때 사용
   *  - deviceName 등은 선택적: 미지정 시 프리로드에서 병합/보정
   */
  interface PasscardPrintArgs {
    deviceName?: string;
    pageSize?: PageSizeMM;
    url?: string;
    preview?: boolean;
    batchId?: string;
    widthMicrons?: number;
    heightMicrons?: number;
    previewCountAsPrint?: boolean;
  }

  /**
   * ✅ 반환용(결정된) 인쇄 옵션 — 프리로드가 돌려주는 확정 형태
   *  - deviceName은 항상 string
   *  - preview는 항상 boolean
   */
  interface PasscardPrintResolved {
    deviceName: string;
    preview: boolean;
    widthMicrons?: number;
    heightMicrons?: number;
    previewCountAsPrint?: boolean;
    batchId?: string;
  }

  // ─────────────────────────────────────────────────────────────
  // Window 확장
  // ─────────────────────────────────────────────────────────────
  interface Window {
    /** ✅ 신규 통합 브리지 (추천) — preload/index 에서 export하는 타입 */
    electronAPI: PreloadElectronAPI;

    /** ✅ 레거시/호환 브리지들 (기존 화면 유지용) */
    electron: ToolkitElectronAPI;

    ipc: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };

    /** 기존 api: getConfig 등 (레거시) */
    api: {
      getConfig: () => Promise<any | null>;
      getLocalApiPort: () => Promise<number>;
    };

    /**
     * config 헬퍼
     * - get(path?) : XPath 유사 경로로 특정 값 조회. (예: "SERVICE/HOST")
     * - get()      : 병합된 전체 설정 반환.
     */
    config: {
      /** 경로 미지정 시 전체 설정 반환, 경로 지정 시 해당 값 반환 */
      get: (path?: string) => Promise<any | null>;
      /** 원본 XML 텍스트 또는 파싱 객체 반환(환경에 따라) */
      getXml: () => Promise<any | null>;
      /** PASSCARD 블록 옵션(결정형)만 적출 */
      getPasscardOptions: () => Promise<PasscardPrintResolved>;
      /** 런타임 오버라이드 */
      setPasscardPreviewOverride: (v: boolean) => void;
      setPasscardPreviewCountAsPrintOverride: (v: boolean) => void;
      /** 메인 컨피그 로드 정보 */
      getMainConfigInfo: () => Promise<{
        ok: boolean;
        file?: string | null;
        cfg?: any;
        API_BASE?: string;
      }>;
      /** 메인 컨피그 리로드 */
      reloadMainConfig: () => Promise<{
        ok: boolean;
        file?: string | null;
        cfg?: any;
        API_BASE?: string;
      }>;
      /** 프린터 목록 */
      listPrinters: () => Promise<PrinterInfoLite[]>;
    };

    /** i18n / 언어 이벤트 — 기존 그대로 */
    i18n: {
      getLang: () => Promise<"en" | "ko-KR" | "vi" | "zh-Hans" | "id">;
      setLang: (lang: "en" | "ko-KR" | "vi" | "zh-Hans" | "id") => Promise<void>;
      getBundle: () => Promise<Record<string, string>>;
    };
    langEvents: {
      onChanged: (cb: (code: "en" | "ko-KR" | "vi" | "zh-Hans" | "id") => void) => () => void;
    };

    /** 프린트 브리지 — 기존 그대로 (별칭 포함) */
    printBridge: {
      passcards: (jobs: any[], options?: Partial<PasscardPrintArgs>) => Promise<any>;
    };
    passcard: {
      passcards: (jobs: any[], options?: Partial<PasscardPrintArgs>) => Promise<any>;
    };
    printer: {
      printPasscard: (opts: PasscardPrintArgs) => Promise<any>;
      list: () => Promise<PrinterInfoLite[]>;
    };

    /** 로그/시간 브리지 — 기존 그대로 */
    logs: {
      onPasscardLog: (cb: (msg: PasscardLogMsg) => void) => () => void;
    };

    time: {
      getContext: () => Promise<TimeContext>;
      getSource: () => Promise<"plant" | "local">;
      refresh: () => Promise<TimeContext>;
      onReadyOnce: (cb: (data: TimeContext) => void) => () => void;
    };

    /** preload readiness flag */
    __preloadReady: boolean;
  }
}
