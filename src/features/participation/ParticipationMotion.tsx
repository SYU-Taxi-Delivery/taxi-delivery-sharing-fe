"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  BAG_PLACE,
  BagShape,
  BasketBack,
  BasketFront,
  Bean,
  GREEN,
  INK,
  Line,
  TAXI,
  TaxiLights,
  TaxiSign,
  TaxiWheels,
} from "@/features/ui/art";
import type { ParticipationMotion as Motion } from "./useParticipation";
import styles from "./motion.module.css";

/*
 * The participation panel's little scene (taxi or shared-order basket), in
 * the corner the panel always keeps free, so nothing ever moves the text,
 * the seat row or the buttons. One controller runs both kinds:
 *
 * - rest: the parked taxi with its 두유콩 driver, or the basket with the
 *   bags of the order (one more when you have joined). Always shown.
 * - enter: once, the first time the scene is on screen after the detail page
 *   opens — the taxi pulls in and stops / the basket lands and the bags pop
 *   in. Never shows anyone boarding, so it can't be read as a join.
 * - idle: a small wiggle (driver nod + engine bob / one bag shuffles) after a
 *   quiet 6.5–9.5 s, only while the scene is on screen, the tab is visible and
 *   no request is in flight. Nothing is "caught up" after coming back.
 * - join / leave: the existing result scenes, only after the request
 *   succeeded (`motion` from useParticipation). They replace whatever was
 *   playing, and the scene returns to rest for the current state afterwards.
 * - replay: tapping the scene (a button named "택시/배달 모션 다시 보기")
 *   plays the enter motion again. Visual only; it never sends a request and
 *   is ignored while a request is pending or a result scene plays.
 * Reduced motion: no automatic enter/idle; the rest picture and the status
 * text carry the state (globals.css also collapses any animation to its end).
 */

type Play = { name: "enter" | "idle" | "join" | "leave"; key: string };

const PLAY_MS: Record<Play["name"], number> = {
  enter: 1000,
  idle: 1000,
  join: 1200,
  leave: 1200,
};
const IDLE_MIN_MS = 6500;
const IDLE_SPREAD_MS = 3000;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** True while `ref` is at least partly on screen and the page is visible. */
function useShown(ref: RefObject<Element | null>) {
  const [onScreen, setOnScreen] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const element = ref.current;
    const onVisibility = () =>
      setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    let observer: IntersectionObserver | undefined;
    let fallback: number | undefined;
    if (element && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        ([entry]) => setOnScreen(entry?.isIntersecting ?? false),
        { threshold: 0.25 },
      );
      observer.observe(element);
    } else {
      // No observer (old browsers, tests): treat the scene as visible.
      fallback = window.setTimeout(() => {
        setOnScreen(true);
        onVisibility();
      }, 0);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
      window.clearTimeout(fallback);
    };
  }, [ref]);

  return onScreen && pageVisible;
}

export function ParticipationMotion({
  motion,
  type,
  joined = false,
  busy = false,
}: {
  motion: Motion;
  type: "TAXI" | "DELIVERY";
  joined?: boolean;
  busy?: boolean;
}) {
  const taxi = type === "TAXI";
  const stage = useRef<HTMLButtonElement>(null);
  const shown = useShown(stage);
  const [play, setPlay] = useState<Play | null>(null);
  const [resultId, setResultId] = useState<number | null>(null);
  const entered = useRef(false);
  const count = useRef(0);

  // A confirmed join/cancel replaces anything that is playing (render-time
  // update, so the success scene starts in the same paint as the status).
  if (motion && motion.id !== resultId) {
    setResultId(motion.id);
    setPlay({
      name: motion.action === "join" ? "join" : "leave",
      key: `result-${motion.id}`,
    });
  }

  const start = (name: "enter" | "idle") =>
    setPlay({ name, key: `${name}-${++count.current}` });

  // Enter once, the first time the scene is actually on screen.
  useEffect(() => {
    if (!shown || entered.current) return;
    entered.current = true;
    if (reducedMotion()) return;
    const timer = window.setTimeout(() => {
      setPlay((current) =>
        current ? current : { name: "enter", key: `enter-${++count.current}` },
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [shown]);

  // Each play ends by itself and the scene returns to rest.
  useEffect(() => {
    if (!play) return;
    const timer = window.setTimeout(() => setPlay(null), PLAY_MS[play.name]);
    return () => window.clearTimeout(timer);
  }, [play]);

  // Idle: one small wiggle after a quiet pause; re-armed after each play.
  useEffect(() => {
    if (!shown || play || busy || reducedMotion()) return;
    const timer = window.setTimeout(
      () => setPlay({ name: "idle", key: `idle-${++count.current}` }),
      IDLE_MIN_MS + Math.random() * IDLE_SPREAD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [shown, play, busy]);

  const result = play?.name === "join" || play?.name === "leave";
  const scene = `${taxi ? "taxi" : "delivery"}-${play?.name ?? "rest"}`;

  return (
    <button
      ref={stage}
      type="button"
      className={styles.stage}
      data-scene={scene}
      aria-label={`${taxi ? "택시" : "배달"} 모션 다시 보기`}
      onClick={() => {
        // Never during a request or its result: the arrival must not run
        // into (or look like) the boarding that may follow.
        if (!result && !busy) start("enter");
      }}
    >
      <svg
        key={play?.key ?? "rest"}
        viewBox="0 0 136 68"
        className={styles.svg}
        aria-hidden="true"
        focusable="false"
      >
        <Line d="M4 62H132" stroke="var(--input-border)" fill="none" />
        {taxi ? (
          <TaxiScene rider={result} />
        ) : (
          <DeliveryScene moving={result} mine={!result && joined} />
        )}
        {result && (
          <Hello
            x={taxi === (play?.name === "join") ? 100 : 6}
            y={taxi === (play?.name === "join") ? -1 : 6}
            text={play?.name === "join" ? "안녕!" : "또 봐요"}
          />
        )}
      </svg>
    </button>
  );
}

const CAR = "translate(62 11.2) scale(1.5)";

/** The taxi driver: a small 두유콩 seen through the front window. */
function Driver() {
  const clip = useId();
  return (
    <>
      <clipPath id={clip}>
        <path d={TAXI.frontWindow} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <g className={styles.driver}>
          <g transform="translate(28.6 20.4) scale(0.34)">
            <Bean look="green" detail="face" />
          </g>
        </g>
      </g>
      <Line d={TAXI.frontWindow} fill="none" />
    </>
  );
}

function TaxiScene({ rider }: { rider: boolean }) {
  return (
    <>
      <g className={styles.hop}>
        <ellipse cx={98} cy={62.6} rx={30} ry={2} fill={INK} opacity={0.1} />
        {/* cabin seen through the open rear door */}
        <g transform={CAR}>
          <path
            d={TAXI.door}
            fill="color-mix(in srgb, var(--primary-text) 45%, var(--text))"
          />
        </g>
        {rider && (
          <g className={`${styles.rider} ${styles.riderInside}`}>
            <Bean look="ivory" />
          </g>
        )}
        <g transform={CAR}>
          <TaxiSign size="lg" />
          <Line
            d={`${TAXI.body} ${TAXI.door}`}
            fillRule="evenodd"
            fill={GREEN}
          />
          <Line d={TAXI.frontWindow} fill="#fff" />
          <Driver />
          <TaxiLights />
          <TaxiWheels />
          <g className={styles.door}>
            <Line d={TAXI.door} fill={GREEN} />
            <Line d={TAXI.doorWindow} fill="#fff" />
            <Line d="M19.4 19.6H21.6" fill="none" />
          </g>
        </g>
      </g>
      {rider && (
        <g className={styles.fadeAtEnd}>
          <g className={`${styles.rider} ${styles.riderOutside}`}>
            <Bean look="ivory" />
          </g>
        </g>
      )}
    </>
  );
}

/**
 * The shared order: two bags from the others, plus yours when you have
 * joined (`mine`), or the bag that flies in/out during a result (`moving`).
 */
function DeliveryScene({ moving, mine }: { moving: boolean; mine: boolean }) {
  return (
    <>
      <ellipse cx={103} cy={62.6} rx={28} ry={2} fill={INK} opacity={0.1} />
      <g className={styles.basket}>
        <g transform="translate(76 42)">
          <BasketBack />
        </g>
        <g transform="translate(88 54)">
          <g className={styles.restBag}>
            <g transform={BAG_PLACE(0.55)}>
              <BagShape />
            </g>
          </g>
        </g>
        <g transform="translate(119 54)">
          <g className={styles.restBag}>
            <g transform={BAG_PLACE(0.55)}>
              <BagShape />
            </g>
          </g>
        </g>
        {mine && (
          <g transform="translate(103 54)">
            <g className={styles.restBag}>
              <g transform={BAG_PLACE(0.56)}>
                <BagShape />
              </g>
            </g>
          </g>
        )}
        {moving && (
          <g className={styles.bagX}>
            <g className={styles.bagY}>
              <g transform={BAG_PLACE(0.56)}>
                <BagShape />
              </g>
            </g>
          </g>
        )}
        <g transform="translate(76 42)">
          <BasketFront />
        </g>
      </g>
    </>
  );
}

/** Small speech bubble at the end of a result scene (fades out with it). */
function Hello({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g transform={`translate(${x} ${y})`} className={styles.fadeAtEnd}>
      <g className={styles.hello}>
        <Line
          d="M6 1H30Q35 1 35 6V9Q35 14 30 14H12L8 18V14H6Q1 14 1 9V6Q1 1 6 1Z"
          fill="var(--canvas)"
        />
        <text x={18} y={10.6} textAnchor="middle" className={styles.helloText}>
          {text}
        </text>
      </g>
    </g>
  );
}
