import Image from "next/image";
import { BagArt, TaxiArt } from "./art";
import styles from "./ui.module.css";

/**
 * Small decorative scene for empty, error and done states: the unchanged
 * 두유팟 logo on a soft halo, with the taxi and delivery art (ui/art)
 * beside it. Nothing loops. Purely visual (aria-hidden); the state text stays the message.
 */
export function SpotArt({
  kind = "empty",
}: {
  kind?: "empty" | "error" | "done";
}) {
  return (
    <span className={styles.art} data-kind={kind} aria-hidden="true">
      <span className={styles.halo} />
      <Image
        className={styles.logo}
        src="/auth/logo.svg"
        width={56}
        height={56}
        alt=""
      />
      <span className={styles.bubble} data-side="left">
        <TaxiArt />
      </span>
      <span className={styles.bubble} data-side="right">
        <BagArt />
      </span>
      {kind === "done" && <span className={styles.check} />}
    </span>
  );
}
