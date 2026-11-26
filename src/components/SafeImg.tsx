import { useState, type ImgHTMLAttributes } from "react";

// 外站图片：不带 Referer（绕开大部分防盗链）、懒加载、加载失败就整个隐藏（不显示破图）
export default function SafeImg({ src, className = "", alt = "", ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
      {...rest}
    />
  );
}
