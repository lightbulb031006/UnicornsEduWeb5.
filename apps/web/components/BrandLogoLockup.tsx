import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

export type BrandLogoVariant = "navbar" | "auth";

type BrandLogoLockupProps = {
  /** Ẩn chữ khi sidebar thu gọn — chỉ mark, cỡ nhỏ hơn (đồng bộ tỉ lệ với navbar) */
  showWordmark?: boolean;
  variant?: BrandLogoVariant;
  dense?: boolean;
  className?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  priority?: boolean;
};

/** Không khung viền; hover làm mark đậm/nét hơn (opacity + contrast nhẹ). */
const markHover =
  "transition-[opacity,filter] duration-200 ease-out opacity-[0.88] contrast-100 group-hover/brand:opacity-100 group-hover/brand:contrast-[1.12]";

/** Trang home + sidebar mở rộng: cùng một bộ class */
const variants = {
  navbar: {
    gap: "gap-1 sm:gap-1.5",
    logo: "h-11 w-auto max-h-11 max-w-[4rem] shrink-0 object-contain object-left sm:h-12 sm:max-h-12 sm:max-w-[4.75rem]",
    word: "text-[0.9375rem] leading-[1.1] sm:text-[1.0625rem]",
  },
  auth: {
    gap: "gap-1.5 sm:gap-2",
    logo: "h-[4.75rem] w-auto max-h-[4.75rem] max-w-[5.5rem] object-contain object-left sm:h-[5.25rem] sm:max-h-[5.25rem] sm:max-w-[6.25rem]",
    word: "text-xl leading-[1.1] sm:text-[1.75rem]",
  },
} as const;

/** Sidebar thu gọn: cùng tỉ lệ với navbar mark, thu nhỏ vừa rail */
const denseCollapsedMark =
  "h-9 w-auto max-h-9 max-w-[3rem] shrink-0 object-contain object-center sm:h-10 sm:max-h-10 sm:max-w-[3.25rem]";

export function BrandLogoLockup({
  showWordmark = true,
  variant = "navbar",
  dense = false,
  className,
  logoClassName,
  wordmarkClassName,
  priority,
}: BrandLogoLockupProps) {
  const v = variants[variant];
  const markLogo = dense ? denseCollapsedMark : v.logo;

  const logoSizes = dense ? "48px" : undefined;

  if (!showWordmark) {
    return (
      <span className={cn("group/brand inline-flex items-center", className)}>
        <BrandLogo
          className={cn(markLogo, markHover, logoClassName)}
          priority={priority}
          sizes={logoSizes}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "group/brand flex min-w-0 max-w-full items-center",
        v.gap,
        className,
      )}
    >
      <BrandLogo
        className={cn(markLogo, markHover, logoClassName)}
        priority={priority}
        sizes={logoSizes}
      />
      <span
        className={cn(
          "min-w-0 whitespace-nowrap font-bold tracking-normal",
          v.word,
          wordmarkClassName,
        )}
      >
        <span className="text-text-primary">Unicorns </span>
        <span className="text-primary">Edu</span>
      </span>
    </span>
  );
}
