import Image from "next/image";

export function BrandMark() {
  return (
    <span className="brand-logo" aria-hidden="true">
      <Image
        unoptimized
        src="/brand/collegesearch-campus-pin.png"
        width={2172}
        height={724}
        alt=""
      />
    </span>
  );
}
