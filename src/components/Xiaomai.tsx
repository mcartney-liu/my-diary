import { useState } from "react";

// 🌾 小麦形象：3D 黏土风插画，4 种表情（public/xiaomai/*.webp，每张 10~15KB）
// 图片加载失败时退回 SVG 版本，保证任何情况下都有小麦
export type XiaomaiMood = "happy" | "thinking" | "sleepy" | "cheer";

export default function Xiaomai({ mood = "happy", size = 40, className = "" }: { mood?: XiaomaiMood; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src={`/xiaomai/${mood}.webp`}
        width={size}
        height={size}
        alt="小麦"
        draggable={false}
        onError={() => setFailed(true)}
        className={`xiaomai select-none object-contain ${mood === "thinking" ? "xiaomai-think" : mood === "cheer" ? "xiaomai-bounce" : ""} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <XiaomaiSvg mood={mood} size={size} className={className} />;
}

function XiaomaiSvg({ mood = "happy", size = 40, className = "" }: { mood?: XiaomaiMood; size?: number; className?: string }) {
  const eyes = {
    happy:    <><path d="M37 50 q4 -5 8 0" /><path d="M55 50 q4 -5 8 0" /></>,
    thinking: <><circle cx="41" cy="49" r="3" fill="currentColor" stroke="none" /><circle cx="59" cy="47" r="3" fill="currentColor" stroke="none" /></>,
    sleepy:   <><path d="M36 50 h9" /><path d="M55 50 h9" /></>,
    cheer:    <><path d="M37 47 l4 4 l4 -4" /><path d="M55 47 l4 4 l4 -4" /></>,
  }[mood];
  const mouth = {
    happy:    <path d="M44 60 q6 6 12 0" />,
    thinking: <path d="M46 62 h8" />,
    sleepy:   <ellipse cx="50" cy="62" rx="3" ry="2.5" fill="currentColor" stroke="none" />,
    cheer:    <path d="M42 58 q8 10 16 0 z" fill="#e8825a" />,
  }[mood];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`xiaomai ${mood === "thinking" ? "xiaomai-think" : mood === "cheer" ? "xiaomai-bounce" : ""} ${className}`}
      role="img"
      aria-label="小麦"
    >
      {/* 头顶麦穗 */}
      <g className="xiaomai-sprout">
        <path d="M50 26 C50 18 50 12 51 6" stroke="#6b8e3a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <ellipse cx="44" cy="14" rx="4" ry="7" transform="rotate(-30 44 14)" fill="#e9b949" />
        <ellipse cx="57" cy="12" rx="4" ry="7" transform="rotate(30 57 12)" fill="#e9b949" />
        <ellipse cx="51" cy="5" rx="3.5" ry="6" fill="#f2c95c" />
      </g>
      {/* 身体：麦粒 */}
      <ellipse cx="50" cy="58" rx="32" ry="34" fill="url(#xm-body)" />
      <path d="M50 26 C46 40 46 76 50 90" stroke="#d99a2b" strokeOpacity=".35" strokeWidth="2" fill="none" />
      {/* 腮红 */}
      <ellipse cx="32" cy="60" rx="6" ry="4" fill="#f4a3a3" opacity=".55" />
      <ellipse cx="68" cy="60" rx="6" ry="4" fill="#f4a3a3" opacity=".55" />
      {/* 五官 */}
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" color="#4a3418">
        {eyes}
        {mouth}
      </g>
      {mood === "sleepy" && <text x="72" y="30" fontSize="14" fill="#8b6f47">z</text>}
      <defs>
        <radialGradient id="xm-body" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fde7a8" />
          <stop offset="60%" stopColor="#f5c665" />
          <stop offset="100%" stopColor="#e7a93c" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** 按时间 / 状态挑表情：深夜困了，连续写很多天加油 */
export function moodFor(opts: { hour?: number; streak?: number } = {}): XiaomaiMood {
  const h = opts.hour ?? new Date().getHours();
  if (h >= 23 || h < 5) return "sleepy";
  if ((opts.streak ?? 0) >= 7) return "cheer";
  return "happy";
}
