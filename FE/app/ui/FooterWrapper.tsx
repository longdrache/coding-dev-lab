"use client";

import { useEffect, useState } from "react";
import Footer from "./Footer";

export default function FooterWrapper() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  return mounted ? <Footer /> : null;
}