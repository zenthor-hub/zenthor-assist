import Image from "next/image";

interface ZenthorLogoProps {
  className?: string;
  size?: number;
}

export function ZenthorMark({ className, size = 28 }: ZenthorLogoProps) {
  return (
    <Image src="/zenthor-logo.svg" alt="Zenthor" width={size} height={size} className={className} />
  );
}

export function ZenthorHeroMark({ className, size = 128 }: ZenthorLogoProps) {
  return (
    <Image
      src="/zenthor-logo.svg"
      alt="Zenthor"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}
