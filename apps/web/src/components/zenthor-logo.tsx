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

export function ZenthorLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <Image src="/zenthor-logo.svg" alt="Zenthor" width={40} height={40} />
      <span className="text-foreground text-xl font-semibold tracking-tight">zenthor</span>
    </div>
  );
}
