import { useEffect, useRef, useCallback } from "react";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆的 0/O/1/I

function genCode(len = 4): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

interface Props {
  /** 验证码变化时回调，传入当前正确码（供父组件校验） */
  onCodeChange?: (code: string) => void;
  className?: string;
}

export default function Captcha({ onCodeChange, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const refresh = useCallback(() => {
    const c = genCode();
    onCodeChange?.(c);
    draw(c);
  }, [onCodeChange]);

  function draw(text: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    // 背景
    ctx.fillStyle = "#fdfaf3";
    ctx.fillRect(0, 0, w, h);
    // 干扰线
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `hsl(${Math.random() * 360}, 30%, 70%)`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, Math.random() * h);
      ctx.lineTo(Math.random() * w, Math.random() * h);
      ctx.stroke();
    }
    // 干扰点
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `hsl(${Math.random() * 360}, 30%, 60%)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // 文字
    const colors = ["#8b6f47", "#4a6741", "#5c6b7a", "#a68656"];
    for (let i = 0; i < text.length; i++) {
      ctx.save();
      ctx.fillStyle = colors[i % colors.length];
      ctx.font = 'bold 24px "Ma Shan Zheng", Georgia, serif';
      const x = 10 + i * ((w - 20) / text.length);
      const y = h / 2 + 8;
      ctx.translate(x, y);
      ctx.rotate((Math.random() - 0.5) * 0.5);
      ctx.fillText(text[i], 0, 0);
      ctx.restore();
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={100}
      height={36}
      onClick={refresh}
      title="点击刷新验证码"
      className={`cursor-pointer border border-paper-line rounded-lg select-none ${className}`}
      style={{ width: 100, height: 36 }}
    />
  );
}
