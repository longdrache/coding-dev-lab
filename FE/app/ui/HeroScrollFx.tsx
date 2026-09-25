"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Parallax scroll cho hero: nền 3D trôi chậm + mờ dần, cột chữ và
// terminal trôi với tốc độ khác nhau tạo chiều sâu. Chạy 1 lần sau mount,
// cleanup qua gsap.context. Tự disable khi hero khuất để khỏi tốn frame cuộn.
export default function HeroScrollFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.to("#hero-3d", {
        yPercent: 22,
        opacity: 0.1,
        ease: "none",
        scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 1 },
      });
      gsap.to("#hero-copy", {
        y: -70,
        opacity: 0,
        ease: "none",
        scrollTrigger: { trigger: "#hero", start: "top top", end: "70% top", scrub: 1 },
      });
      gsap.to("#hero-terminal", {
        y: -140,
        ease: "none",
        scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 1 },
      });
    });
    // Khi hero ra khỏi viewport thì tắt hết trigger (khỏi tính toán mỗi frame cuộn)
    const hero = document.querySelector("#hero");
    const io =
      hero &&
      new IntersectionObserver(
        ([entry]) => {
          ScrollTrigger.getAll().forEach((st) =>
            entry.isIntersecting ? st.enable() : st.disable(false),
          );
        },
        { threshold: 0 },
      );
    if (hero && io) io.observe(hero);
    return () => {
      io?.disconnect();
      ctx.revert();
    };
  }, []);
  return null;
}
