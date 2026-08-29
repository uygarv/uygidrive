import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { brand } from "@/config/brand";

export function Brand({ className, href = "/", hideIconOnMobile = false }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
      <Image className={cn("rounded-lg", hideIconOnMobile && "hidden sm:block")} src={brand.logoPath} alt="" width={32} height={32} priority />
      <span>{brand.name}</span>
    </Link>
  );
}
