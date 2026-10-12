import Image from "next/image";

export function BrandMark() {
  return (
    <span className="brand-logo" aria-hidden="true">
      <Image
        unoptimized
        src="/brand/collegesearch-campus-pin-blue.webp"
        width={720}
        height={240}
        loading="eager"
        alt=""
      />
    </span>
  );
}
