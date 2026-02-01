// C:\Changshin\test\electron-app_final\src\renderer\time\usePlantClock.ts
import { useEffect, useRef, useState } from "react";

type Source = "plant" | "local" | null;

type GlobalClock = {
  baseServerMs: number | null;
  basePerf: number | null;
  displayTZ?: string | null;
  displaySource?: Source;
  ready?: boolean;
};

const getLocalTZ = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function usePlantClock() {
  const [displayReady, setDisplayReady] = useState(false); 
  const [displaySource, setDisplaySource] = useState<Source>(null);
  const [displayTZ, setDisplayTZ] = useState<string | null>(null);
  const [nowTime, setNowTime] = useState(new Date());

  const baseServerMsRef = useRef<number | null>(null);
  const basePerfRef = useRef<number | null>(null);

  // ─── 최초 1회: GLOBAL_CLOCK 기준점 세팅 (절대 다시 안 바꿈) ───
  const bootOnceRef = useRef(false);
  if (!bootOnceRef.current) {
    bootOnceRef.current = true;
    const gc: GlobalClock =
      (window as any).__GLOBAL_CLOCK__ ?? ((window as any).__GLOBAL_CLOCK__ = {
        baseServerMs: null,
        basePerf: null,
      });

    if (gc.baseServerMs == null || gc.basePerf == null) {
      gc.baseServerMs = Date.now();
      gc.basePerf = performance.now();
    }
  }

  // ─── 이 훅 인스턴스에서 쓸 기준점 복사 ───
  useEffect(() => {
    const gc = (window as any).__GLOBAL_CLOCK__ as GlobalClock;
    baseServerMsRef.current = gc?.baseServerMs ?? Date.now();
    basePerfRef.current = gc?.basePerf ?? performance.now();
  }, []);

  // ─── 시간 소스/타임존 + 로컬→플랜트 자동 전환 ───
  useEffect(() => {
    const time = (window as any).time;
    const gc = (window as any).__GLOBAL_CLOCK__ as GlobalClock;

    const setLocal = () => {
      gc.displaySource = "local";
      gc.displayTZ = getLocalTZ();
      gc.ready = true;

      setDisplaySource("local");
      setDisplayTZ(gc.displayTZ!);
      setDisplayReady(true);
    };

    const applyCtx = (ctx: any) => {
      if (!ctx) {
        setLocal();
        return;
      }

      const tz = ctx?.timeZone ?? ctx?.timezone ?? ctx?.tz ?? null;
      const src: Source = ctx?.source === "plant" ? "plant" : "local";

      if (src === "plant" && tz) {
        gc.displaySource = "plant";
        gc.displayTZ = tz;
        gc.ready = true;

        setDisplaySource("plant");
        setDisplayTZ(tz);
        setDisplayReady(true);
      } else {
        // tz 없거나 plant 아니면 로컬 취급
        setLocal();
      }
    };

    // 👉 일단 바로 로컬 기준으로 띄워줌 (오프라인/오류 시에도 시간은 흘러가게)
    setLocal();

    if (!time) {
      // preload 에서 time 브리지 자체가 없으면 그냥 로컬로만 사용
      return;
    }

    let retryTimer: number | null = null;

    const ensureRetry = () => {
      if (retryTimer != null) return;
      if (typeof time.refreshPlantTime !== "function") return;

      retryTimer = window.setInterval(async () => {
        try {
          const res = await time.refreshPlantTime();
          const nextCtx = res?.data ?? res?.fallback ?? null;
          if (!nextCtx) return;

          const tz = nextCtx?.timeZone ?? nextCtx?.timezone ?? nextCtx?.tz ?? null;
          const src2: Source = nextCtx?.source === "plant" ? "plant" : "local";

          applyCtx(nextCtx);

          // 🔴 한 번이라도 plant로 올라오면 폴링 중단
          if (src2 === "plant" && tz && retryTimer != null) {
            window.clearInterval(retryTimer);
            retryTimer = null;
            console.log("[TIME] plant-time acquired, stop retry");
          }
        } catch {
          // 실패해도 그냥 다음 턴에 다시 시도
        }
      }, 60_000); // 1분마다 재시도

      console.log("[TIME] start retry (60s interval, per-screen)");
    };

    const handleCtxAndMaybeRetry = (ctx: any) => {
      if (ctx) applyCtx(ctx);

      const src: Source =
        ctx?.source === "plant" ? "plant"
        : ctx?.source === "local" ? "local"
        : null;

      if (src !== "plant") {
        // 로컬/미정이면 주기적으로 plant-time 재시도
        ensureRetry();
      }
    };

    // 메인에서 브로드캐스트 해주는 ready 이벤트
    const off = time.onReadyOnce?.((ctx: any) => {
      handleCtxAndMaybeRetry(ctx);
    });

    // 현재 컨텍스트 직접 조회
    time
      .getContext()
      .then((ctx: any) => {
        handleCtxAndMaybeRetry(ctx);
      })
      .catch(() => {
        // 에러면 그냥 로컬 유지 + 폴링으로 복구 기다림
        ensureRetry();
      });

    return () => {
      try {
        off?.();
      } catch {}
      if (retryTimer != null) {
        window.clearInterval(retryTimer);
        retryTimer = null;
      }
    };
  }, []);

  // ─── 1초마다 기준점+경과 시간으로 nowTime 계산 (기존 그대로) ───
  useEffect(() => {
    const timer = setInterval(() => {
      if (baseServerMsRef.current != null && basePerfRef.current != null) {
        const elapsed = performance.now() - basePerfRef.current;
        setNowTime(new Date(baseServerMsRef.current + elapsed));
      } else {
        setNowTime(new Date());
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return { nowTime, displayReady, displaySource, displayTZ };
}

// ---- 포매터 ----
export const formatYYYYMMDDInTZ = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

export const formatTimeInTZ = (d: Date, tz: string) =>
  d.toLocaleTimeString("ko-KR", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
