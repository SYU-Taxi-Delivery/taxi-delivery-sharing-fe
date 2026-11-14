/*
 * 두유팟 icon set: a round, soft, flat 2D style shared by the taxi, the
 * delivery lunch bag and 두유콩 (the soybean student character).
 *
 * Rules:
 * - Outline: the dark text color (--text), 1.5px on screen at every size
 *   (non-scaling stroke), round joins and caps. Never pure black.
 * - Fill: 두유팟 green and light green first; white and a warm ivory
 *   (a light mix of --warn) as support. No gradients, shading or 3D.
 * - Shapes: round silhouettes and soft curves; few parts per drawing.
 * - Sizes are drawn on purpose, not just scaled:
 *   - "sm": list cards, form, badges (silhouette + one cue: roof sign /
 *     lid + bean emblem);
 *   - "lg": detail and scenes (adds door seam, lights, zipper, ground);
 *   - people: BeanDot (headcount, silhouette only), Bean (scene, face),
 *     Bean full (motion: feet, arms, bag).
 * - 두유콩 is decorative: it never stands for a real participant. Real
 *   people (members, comments) keep their name-based avatars.
 * Everything here is aria-hidden; text next to it carries the meaning.
 */

import type { ReactNode, SVGProps } from "react";

export const INK = "var(--text)";
export const GREEN = "var(--primary)";
export const GREEN_SOFT = "var(--primary-soft)";
export const IVORY = "color-mix(in srgb, var(--warn) 8%, white)";
const WINDOW = "#fff";

type Size = "sm" | "lg";

/** Outlined shape with the shared 1.5px ink line. */
export function Line(props: SVGProps<SVGPathElement>) {
  return (
    <path
      stroke={INK}
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      {...props}
    />
  );
}

/* ───────── Taxi (side view, facing right; 48 × 36 grid) ───────── */

/*
 * A chubby rounded car: one soft body with a dome cabin, two big round
 * windows split by a pillar, a round roof sign and round wheels. The rear
 * door (x 12.6–24) is a separate piece so the motion can open it; its
 * opening is tall enough for 두유콩 to step through.
 */
export const TAXI = {
  body: "M8.5 29.5H39.5Q45 29.5 45 24V22Q45 17.6 40.6 17L36 16.4Q33.6 8.5 26 8.5H20Q13.6 8.5 11.4 16.2L7.6 17Q3 18 3 22.6V24Q3 29.5 8.5 29.5Z",
  door: "M12.6 28V18Q12.6 16.4 14 16.1Q15.6 10.6 20.6 10.4H24V28Z",
  doorWindow: "M14.6 16.2Q15.9 11.9 20.4 11.9H22.8V16.2Z",
  frontWindow: "M25.2 16.2V11.9H26.4Q31.2 11.9 33.1 16.2Z",
  sign: "M19.6 8.5V7Q19.6 4.3 22.3 4.3H25.7Q28.4 4.3 28.4 7V8.5Z",
  wheels: [13.5, 34.5],
  wheelY: 29.5,
  wheelR: 4.4,
};

export function TaxiWheels() {
  return (
    <>
      {TAXI.wheels.map((x) => (
        <g key={x}>
          <circle
            cx={x}
            cy={TAXI.wheelY}
            r={TAXI.wheelR}
            fill={INK}
            stroke={INK}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={x} cy={TAXI.wheelY} r={1.6} fill={IVORY} />
        </g>
      ))}
    </>
  );
}

export function TaxiSign({ size }: { size: Size }) {
  return (
    <>
      <Line d={TAXI.sign} fill={IVORY} />
      {size === "lg" && (
        <path
          d="M22.4 6.4H25.6"
          stroke={GREEN}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      )}
    </>
  );
}

export function TaxiLights() {
  return (
    <>
      <circle cx={42.4} cy={21.2} r={1.3} fill={IVORY} />
      <path
        d="M4.2 21.4H5.6"
        stroke={IVORY}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </>
  );
}

export function TaxiArt({
  size = "sm",
  className,
}: {
  size?: Size;
  className?: string;
}) {
  const lg = size === "lg";
  return (
    <svg
      className={className}
      viewBox="0 0 48 36"
      data-art="taxi"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {lg && (
        <ellipse cx={24} cy={34.4} rx={19} ry={1.5} fill={INK} opacity={0.1} />
      )}
      <TaxiSign size={size} />
      <Line d={TAXI.body} fill={GREEN} />
      <Line d={TAXI.doorWindow} fill={WINDOW} />
      <Line d={TAXI.frontWindow} fill={WINDOW} />
      {lg && (
        <>
          <Line d="M24 16.6V27.6" fill="none" opacity={0.55} />
          <Line d="M19.4 19.6H21.6" fill="none" />
          <TaxiLights />
        </>
      )}
      <TaxiWheels />
    </svg>
  );
}

/* ───────── Delivery lunch bag (40 × 40 grid) ───────── */

/*
 * A soft insulated lunch bag for a shared order: rounded ivory body, a green
 * lid band, a round green handle and the 두유콩 bean as its emblem. Bottom
 * centre sits at (20, 35) so scenes can stand it on a line (BAG_PLACE).
 */
export const BAG = {
  body: "M12.4 13H27.6Q34 13 34 19.4V29Q34 35 28 35H12Q6 35 6 29V19.4Q6 13 12.4 13Z",
  lid: "M6 19.6V19.4Q6 13 12.4 13H27.6Q34 13 34 19.4V19.6Z",
  handle: "M14.2 13.4V11.2Q14.2 6.2 20 6.2Q25.8 6.2 25.8 11.2V13.4",
};

export const BAG_PLACE = (scale: number) =>
  `scale(${scale}) translate(-20 -35)`;

export function BagShape({ size = "sm" }: { size?: Size }) {
  return (
    <>
      {/* thick soft handle: ink edge, green core */}
      <path
        d={BAG.handle}
        fill="none"
        stroke={INK}
        strokeWidth={4.8}
        strokeLinecap="round"
      />
      <path
        d={BAG.handle}
        fill="none"
        stroke={GREEN}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <Line d={BAG.body} fill={IVORY} />
      <Line d={BAG.lid} fill={GREEN} />
      <g transform="translate(20 27.6) scale(0.42) translate(-12 -14.6)">
        <path d={BEAN.body} fill={GREEN} />
      </g>
      {size === "lg" && (
        <>
          <circle cx={30.6} cy={16.4} r={1.1} fill={IVORY} />
        </>
      )}
    </>
  );
}

export function BagArt({
  size = "sm",
  className,
}: {
  size?: Size;
  className?: string;
}) {
  const lg = size === "lg";
  return (
    <svg
      className={className}
      viewBox={lg ? "1 2 38 38" : "3 3.5 34 34"}
      data-art="bag"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {lg && (
        <ellipse cx={20} cy={36.6} rx={15} ry={1.4} fill={INK} opacity={0.1} />
      )}
      <BagShape size={size} />
    </svg>
  );
}

/* Shared-order basket for the delivery scene (54 wide, bottom at y=20) */
export function BasketBack() {
  return (
    <Line
      d="M2 3H52Q53 3 52.8 4.2L52 9H2L1.2 4.2Q1 3 2 3Z"
      fill="var(--primary-text)"
    />
  );
}

export function BasketFront() {
  return (
    <>
      <Line
        d="M1 10.4H53L50.6 17.6Q49.8 20 47.2 20H6.8Q4.2 20 3.4 17.6Z"
        fill={GREEN_SOFT}
      />
      <Line d="M20 15.2H34" fill="none" stroke="var(--primary-text)" />
    </>
  );
}

/* ───────── 두유콩: the soybean student (24 × 30 grid) ───────── */

/*
 * The whole body is one plump soybean: slightly lopsided, wider at the
 * bottom, with a soft dent on the back (left) so it reads as a bean, not an
 * egg, a peanut (no waist on the front) or a ghost (flat round bottom, feet
 * below). Face sits high on the front (right) side: two dot eyes and a
 * short smile. Feet stand at (12, 29.4); scenes place it with BEAN_PLACE so
 * the feet land on the origin.
 */
export const BEAN = {
  body: "M12.5 1.5C18.8 1.5 22.5 6.6 22.5 13.6C22.5 21.8 17.8 27.8 11.6 27.8C5.4 27.8 1.6 23.8 1.6 18.8C1.6 15.6 4.2 14.2 4.4 11.6C4.6 9 3.2 7.6 4.2 5C5.4 2.4 8.6 1.5 12.5 1.5Z",
};
export const BEAN_PLACE = "translate(-12 -29.4)";

export type BeanLook = "ivory" | "green";
export type BeanFace = "dot" | "happy" | "neutral";
/** stand (arms down), wave (one arm up), cheer (both up), run, sit. */
export type BeanPose = "stand" | "wave" | "cheer" | "run" | "sit";

const BEAN_ARM_DOWN = "M21.4 16.2Q24.8 17.4 24 20.4Q23.4 21.6 21.2 20.8";
const BEAN_ARM_UP = "M20.6 10.6Q23.4 6.8 25 8.2Q26 9.4 22.2 13.6";
const BEAN_ARMS: Record<BeanPose, string[]> = {
  stand: [BEAN_ARM_DOWN],
  wave: [BEAN_ARM_UP],
  cheer: [BEAN_ARM_UP, "M5 9.8Q2 5.8 0.4 7Q-0.6 8.2 3.2 12.8"],
  run: [
    "M21.4 14.6Q25.6 14.2 25.4 17.2Q25 18.6 21.6 18.2",
    "M3.8 16.8Q0.2 17.8 0.6 20.2Q1.2 21.6 4 20.2",
  ],
  sit: [BEAN_ARM_DOWN],
};
const BEAN_LEGS: Record<BeanPose, [string, string]> = {
  stand: [
    "M6.4 26.6Q6 29.4 8.8 29.4Q11 29.4 10.6 27.2",
    "M13 27.4Q12.8 29.4 15.4 29.4Q17.8 29.4 17.2 26.6",
  ],
  wave: [
    "M6.4 26.6Q6 29.4 8.8 29.4Q11 29.4 10.6 27.2",
    "M13 27.4Q12.8 29.4 15.4 29.4Q17.8 29.4 17.2 26.6",
  ],
  cheer: [
    "M5.6 26Q4.4 28.8 6.8 29.4Q9 29.8 9.8 27.4",
    "M14 27.4Q14.4 29.8 16.8 29.4Q19.2 28.8 18 26",
  ],
  run: [
    "M6.8 25.6Q3.2 26.4 3.2 28.6Q3.6 30.2 6.4 29Q8.4 28 9.6 26.8",
    "M14 27.4Q14.8 30 17.6 29.6Q20 29.2 19 26.4",
  ],
  sit: [
    "M9 26.6Q9.6 29.8 12.6 29.6Q14 29.4 13.4 27.4",
    "M14.6 26.8Q16.6 29.6 19.4 28.8Q20.8 28.2 19.6 26.2",
  ],
};

/**
 * 두유콩 with its feet at the origin. `detail`: "face" for small scenes,
 * "full" adds arms, feet and a tiny green backpack (motion, large scenes).
 * `pose` changes only arms and feet; `face` "happy" closes the eyes into
 * arcs and opens the smile, "neutral" keeps the dot eyes over a short flat
 * mouth (nothing found, no fuss).
 */
export function Bean({
  look = "ivory",
  detail = "full",
  wave = false,
  pose,
  face = "dot",
  bag = true,
}: {
  look?: BeanLook;
  detail?: "face" | "full";
  wave?: boolean;
  pose?: BeanPose;
  face?: BeanFace;
  bag?: boolean;
}) {
  const fill = look === "green" ? GREEN_SOFT : IVORY;
  const full = detail === "full";
  const stance = pose ?? (wave ? "wave" : "stand");
  const [legL, legR] = BEAN_LEGS[stance];
  return (
    <g transform={BEAN_PLACE}>
      {full && bag && (
        <Line
          d="M5 11.4H2.2Q0.4 11.4 0.4 13.4V19.6Q0.4 21.4 2.2 21.4H4.6Z"
          fill={GREEN}
        />
      )}
      {full && (
        <>
          {/* arms are short nubs tucked behind the body */}
          {BEAN_ARMS[stance].map((arm) => (
            <Line key={arm} d={arm} fill={fill} />
          ))}
          <g data-leg="l">
            <Line d={legL} fill={INK} />
          </g>
          <g data-leg="r">
            <Line d={legR} fill={INK} />
          </g>
        </>
      )}
      <Line d={BEAN.body} fill={fill} />
      {/* soft shine on the upper back */}
      <path
        d="M7 6.2Q8.4 4.2 10.6 3.8"
        fill="none"
        stroke="#fff"
        strokeWidth={1.4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {face === "happy" ? (
        <>
          <path
            d="M12.5 12.4Q13.6 10.8 14.7 12.4M17.3 12.4Q18.4 10.8 19.5 12.4"
            fill="none"
            stroke={INK}
            strokeWidth={1.3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path d="M14.4 14.2Q16 17.2 17.6 14.2Z" fill={INK} />
        </>
      ) : (
        <>
          <circle cx={13.6} cy={11.8} r={1.15} fill={INK} />
          <circle cx={18.4} cy={11.8} r={1.15} fill={INK} />
          <path
            d={
              face === "neutral"
                ? "M14.7 15.3H17.3"
                : "M14.6 14.8Q16 16.1 17.4 14.8"
            }
            fill="none"
            stroke={INK}
            strokeWidth={1.3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </g>
  );
}

/** Standalone 두유콩 (preview, decorations). */
export function BeanArt({
  look = "ivory",
  detail = "full",
  wave = false,
  face,
  className,
}: {
  look?: BeanLook;
  detail?: "face" | "full";
  wave?: boolean;
  face?: BeanFace;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="-1 0 28 31"
      data-art="bean"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(12 29.4)">
        <Bean look={look} detail={detail} wave={wave} face={face} />
      </g>
    </svg>
  );
}

/* ───────── Heading scene ───────── */

/**
 * Small scene above the board title: lunch bag, two 두유콩 and the taxi on
 * one ground line, each with its own space (no overlaps).
 */
export function CampusScene({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 140 46"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <Line d="M2 44H138" stroke="var(--input-border)" fill="none" />
      <g transform="translate(14 44)">
        <g transform={BAG_PLACE(0.8)}>
          <BagShape />
        </g>
      </g>
      <g transform="translate(37 44) scale(0.86)">
        <Bean look="ivory" wave bag={false} />
      </g>
      <g transform="translate(65 43.1) rotate(-5) scale(0.86)">
        <Bean look="green" />
      </g>
      <g transform="translate(82 4) scale(1.18)">
        <TaxiSign size="sm" />
        <Line d={TAXI.body} fill={GREEN} />
        <Line d={TAXI.doorWindow} fill={WINDOW} />
        <Line d={TAXI.frontWindow} fill={WINDOW} />
        <TaxiWheels />
      </g>
    </svg>
  );
}

/* ───────── Landing scene (login intro, wide screens) ───────── */

const CLOUD =
  "M0 8Q0 3.4 4.6 3.4Q6.6 0 10.8 0.6Q14.8 0 16.2 3.6Q20 3.6 20 7.2Q20 10 16.8 10H2.6Q0 10 0 8Z";
const SPARK = "M0 -3.2L0.9 -0.9L3.2 0L0.9 0.9L0 3.2L-0.9 0.9L-3.2 0L-0.9 -0.9Z";
const HEART =
  "M0 1.3Q0 0 1.3 0Q2.1 0 2.5 0.9Q2.9 0 3.7 0Q5 0 5 1.3Q5 3 2.5 4.6Q0 3 0 1.3Z";

/**
 * The left panel of the login screen: an opened lunch bag with steam, a
 * cheering 두유콩, one running for the taxi, the taxi with a friend in the
 * window calling "같이 가요!", and a stop sign, all on one ground line.
 * Moving parts sit in [data-motion] wrappers with no transform of their own,
 * so CSS can animate them without fighting the placement transform.
 */
export function LoginScene({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 260 100"
      data-art="login-scene"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      {/* sky */}
      <g transform="translate(18 10) scale(1.1)">
        <Line d={CLOUD} fill="#fff" />
      </g>
      <g transform="translate(112 2) scale(0.8)">
        <Line d={CLOUD} fill="#fff" />
      </g>
      <Line d="M4 92H256" fill="none" opacity={0.3} />

      {/* opened lunch bag: lid and handle swing up on the back hinge */}
      <g transform="translate(32 92) scale(1.1) translate(-20 -35)">
        <ellipse cx={20} cy={35.6} rx={15} ry={1.4} fill={INK} opacity={0.1} />
        <Line d={BAG.body} fill={IVORY} />
        <g transform="rotate(-24 6 19.6)">
          <path
            d={BAG.handle}
            fill="none"
            stroke={INK}
            strokeWidth={4.8}
            strokeLinecap="round"
          />
          <path
            d={BAG.handle}
            fill="none"
            stroke={GREEN}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          <Line d={BAG.lid} fill={GREEN} />
        </g>
        <g transform="translate(20 27.6) scale(0.42) translate(-12 -14.6)">
          <path d={BEAN.body} fill={GREEN} />
        </g>
        <g data-motion="steam">
          <Line d="M24 11Q22 8 24 5.4Q26 2.8 24 0" fill="none" />
          <Line d="M29.6 11.6Q27.8 8.8 29.6 6.4" fill="none" />
        </g>
        <g transform="translate(31 -4)">
          <Line d={HEART} fill={GREEN} />
        </g>
      </g>

      {/* cheering 두유콩, hopping */}
      <ellipse cx={74} cy={92.4} rx={9} ry={1.4} fill={INK} opacity={0.1} />
      <g data-motion="hop">
        <g transform="translate(74 92) scale(1.4)">
          <Bean look="green" pose="cheer" face="happy" bag={false} />
        </g>
      </g>
      <g transform="translate(58 50)">
        <Line d={SPARK} fill={GREEN} />
      </g>
      <g transform="translate(94 56) scale(0.7)">
        <Line d={SPARK} fill={IVORY} />
      </g>

      {/* running 두유콩, leaning toward the taxi */}
      <g opacity={0.45}>
        <Line d="M96 70H102M93 76H100M96 82H101" fill="none" />
      </g>
      <g data-motion="run">
        <g transform="translate(118 92) rotate(8) scale(1.36)">
          <Bean look="ivory" pose="run" />
        </g>
      </g>

      {/* the taxi, a friend peeking from the rear window */}
      <g data-motion="idle">
        <g transform="translate(140 31) scale(1.8)">
          <ellipse
            cx={24}
            cy={34.4}
            rx={19}
            ry={1.5}
            fill={INK}
            opacity={0.1}
          />
          <TaxiSign size="lg" />
          <Line d={TAXI.body} fill={GREEN} />
          <Line d={TAXI.doorWindow} fill={WINDOW} />
          <Line
            d="M16.4 16.2Q16.4 12.8 19.2 12.8Q22 12.8 22 16.2Z"
            fill={IVORY}
          />
          <circle cx={18.4} cy={14.6} r={0.45} fill={INK} />
          <circle cx={20.4} cy={14.6} r={0.45} fill={INK} />
          <Line d={TAXI.frontWindow} fill={WINDOW} />
          <Line d="M24 16.6V27.6" fill="none" opacity={0.55} />
          <Line d="M19.4 19.6H21.6" fill="none" />
          <TaxiLights />
          <TaxiWheels />
        </g>
      </g>
      <Line
        d="M154 14H198Q204 14 204 20V24Q204 30 198 30H178L172 36L170 30H154Q148 30 148 24V20Q148 14 154 14Z"
        fill="#fff"
      />
      <text
        x={176}
        y={25}
        textAnchor="middle"
        fontSize={8}
        fontWeight={700}
        fill={INK}
      >
        같이 가요!
      </text>

      {/* stop sign */}
      <Line d="M244 92V62M239 92H249" fill="none" />
      <circle
        cx={244}
        cy={53}
        r={9.4}
        fill="#fff"
        stroke={INK}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <Line
        d="M244 59.4Q239.6 55.2 239.6 52.4Q239.6 48 244 48Q248.4 48 248.4 52.4Q248.4 55.2 244 59.4Z"
        fill={GREEN}
      />
      <circle cx={244} cy={52.4} r={1.4} fill="#fff" />
    </svg>
  );
}

/* ───────── Headcount ───────── */

/**
 * One headcount slot. A taken place is a person: a plain 두유콩 silhouette
 * (no face or props at this size). An open place is still a seat: the
 * dashed empty seat. The "n / m명" text next to the row stays the source of
 * truth.
 */
export function Seat({
  filled,
  className,
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      data-art={filled ? "person" : "seat"}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {filled ? (
        <g transform="translate(8 15.2) scale(0.5) translate(-12 -28.2)">
          <Line d={BEAN.body} fill={GREEN} />
        </g>
      ) : (
        <>
          <path
            d="M4 9V4.5Q4 2.5 6 2.5h4q2 0 2 2V9"
            fill="#fff"
            stroke="var(--disabled)"
            strokeWidth="1.4"
            strokeDasharray="2 1.6"
            strokeLinejoin="round"
          />
          <path
            d="M2.5 9.5q0-1 1-1h9q1 0 1 1v2q0 1.5-1.5 1.5h-8Q2.5 13 2.5 11.5Z"
            fill="#fff"
            stroke="var(--disabled)"
            strokeWidth="1.4"
            strokeDasharray="2 1.6"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

/**
 * A row of headcount slots: `total` places, the first `filled` taken. The
 * count is always shown as text next to it; `pop` marks the place that just
 * changed.
 */
export function SeatSlots({
  total,
  filled,
  className,
  pop,
}: {
  total: number;
  filled: number;
  className?: string;
  pop?: number;
}) {
  return (
    <span className={className} aria-hidden="true">
      {Array.from({ length: Math.max(0, total) }, (_, index) => (
        <span key={index} data-pop={pop === index ? "true" : undefined}>
          <Seat filled={index < filled} />
        </span>
      ))}
    </span>
  );
}

/** Rounded line icons, 24px grid, 1.9 stroke. */
function LineIcon({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** "모집글": a pinned board note (posting / recruiting). */
export function BoardIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <rect x="4.5" y="5" width="15" height="15.5" rx="3.5" />
      <path d="M8.5 11h7M8.5 15h4.5" />
      <circle cx="12" cy="4.6" r="1.8" fill="currentColor" />
    </LineIcon>
  );
}

/** "Me" in the nav: the 두유콩 outline with two dot eyes. */
export function PersonIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <g transform="translate(3.8 2.6) scale(0.68)">
        <path d={BEAN.body} strokeWidth={2.8} />
      </g>
      <circle cx="13.2" cy="10.6" r="0.95" fill="currentColor" stroke="none" />
      <circle cx="16.3" cy="10.6" r="0.95" fill="currentColor" stroke="none" />
    </LineIcon>
  );
}

export function ClockIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </LineIcon>
  );
}

export function InfoIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2" />
      <circle cx="12" cy="7.9" r="1.1" fill="currentColor" stroke="none" />
    </LineIcon>
  );
}

export function PinIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </LineIcon>
  );
}
