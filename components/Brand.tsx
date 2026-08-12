/**
 * BRAND.
 *
 * The product name and mark in one place, so renaming it is a single edit
 * rather than a hunt through six files.
 */

export const PRODUCT_NAME = "Daily CRM";
export const PRODUCT_MONOGRAM = "DC";

/** Typographic monogram - no generated artwork, scales cleanly at any size. */
export function Mark({
  size = 30,
  rounded = "lg",
}: {
  size?: number;
  rounded?: "lg" | "xl";
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.43) }}
      className={`flex shrink-0 select-none items-center justify-center bg-accent
                  font-bold tracking-tight text-white btn-on-accent
                  ${rounded === "xl" ? "rounded-xl" : "rounded-lg"}`}
    >
      {PRODUCT_MONOGRAM}
    </span>
  );
}

/**
 * Partner logo.
 *
 * Roobet is where the wager data actually comes from, so it earns its place.
 * The mark is gold on dark, which is why this sits on the shell colour rather
 * than the page. Standing alone it carries the band on its own, so it is sized
 * to be read rather than noticed.
 *
 * (PackDraw sat here too; removed for now. Adding a second mark back means
 * splitting the width again, so the sizing below would want revisiting.)
 */
export function PartnerStrip({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-card bg-shell
                  px-5 py-5 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/roobet-logo.png"
        alt="Roobet"
        width={806}
        height={300}
        className="h-9 w-auto"
      />
    </div>
  );
}
