import Image from "next/image";

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><Image unoptimized src="/favicon.svg" width={38} height={38} alt="" /></span>;
}
