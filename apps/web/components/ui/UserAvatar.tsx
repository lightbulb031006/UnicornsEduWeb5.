"use client";

import Image from "next/image";
import { useState } from "react";

type UserAvatarProps = {
  src?: string | null;
  fallback: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
};

export default function UserAvatar({
  src,
  fallback,
  alt,
  className,
  imageClassName,
  fallbackClassName,
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedSrc = src?.trim() || null;
  const showImage = Boolean(resolvedSrc) && failedSrc !== resolvedSrc;

  return (
    <span
      className={`relative flex items-center justify-center overflow-hidden rounded-full ${className ?? ""}`}
    >
      {showImage ? (
        <Image
          src={resolvedSrc!}
          alt={alt}
          fill
          sizes="64px"
          unoptimized
          className={`size-full object-cover ${imageClassName ?? ""}`}
          onError={() => setFailedSrc(resolvedSrc)}
        />
      ) : (
        <span className={fallbackClassName ?? ""} aria-hidden>
          {fallback}
        </span>
      )}
    </span>
  );
}
