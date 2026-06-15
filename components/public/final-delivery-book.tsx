"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { X, ChevronLeft, ChevronRight, BookOpen } from "lucide-react"

// StPageFlip es DOM-pesado y solo cliente → carga diferida sin SSR.
const HTMLFlipBook = dynamic(() => import("react-pageflip"), {
  ssr: false,
}) as unknown as React.ComponentType<
  Record<string, unknown> & { children?: React.ReactNode }
>

export type BookAsset = {
  id: string
  webUrl: string | null
  thumbUrl: string | null
  width?: number | null
  height?: number | null
}

export type BookGallery = {
  name: string
  accentColor?: string | null
  coverWebUrl?: string | null
  bookTemplateId?: string | null
  bookCoverImage?: string | null
  bookSettings?: Record<string, unknown>
}

export type BookStudio = {
  name: string
  logoUrl?: string | null
  hideBranding?: boolean
}

type Template = {
  bg: string
  pageBg: string
  ink: string
  accent: string
  serif: string
}

// Presets — configurables por book_settings encima.
const TEMPLATES: Record<string, Template> = {
  luxury_xv: {
    bg: "#14110f",
    pageBg: "#fbf6ed",
    ink: "#1a1614",
    accent: "#b89968",
    serif: "'EB Garamond', Georgia, serif",
  },
  luxury_wedding: {
    bg: "#1c1a17",
    pageBg: "#f6f1ea",
    ink: "#2a251f",
    accent: "#a98f6f",
    serif: "'EB Garamond', Georgia, serif",
  },
}

function s(v: unknown): string {
  return typeof v === "string" ? v : ""
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  ROYAL ATELIER — Luxury Book Experience (pxbook-)             ║
// ║  Bloque <style> estático: solo depende de las CSS vars inline ║
// ╚══════════════════════════════════════════════════════════════╝
const PXBOOK_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Pinyon+Script&family=EB+Garamond:ital@0;1&display=swap');

/* ── Tokens base + fuentes ─────────────────────────────────────── */
.abby-book{
  --gold-deep:#7a5a22; --gold:#b89968; --gold-bright:#e7c884;
  --gold-foil:#fff3d4; --gold-spec:#fffaf0; --gold-line:#cbab74;
  --velvet-0:#100b08; --velvet-1:#1c130c; --velvet-2:#2a1c10; --royal-wine:#2a0f12;
  --page:#fbf6ed; --page-edge:#e8dcc4; --page-edge2:#d8c79f; --ink:#1a1614;
  --glow-warm:rgba(231,200,132,.22); --glow-core:rgba(255,243,212,.30);
  --shadow-amb:rgba(0,0,0,.55); --accent-soft:#e9c9c2;

  --gold-foil-grad:linear-gradient(180deg,var(--gold-foil),var(--gold-bright) 42%,var(--gold) 78%);
  --gold-foil-band:linear-gradient(110deg,
     var(--gold-deep) 0%, var(--gold) 28%, var(--gold-foil) 46%,
     var(--gold-spec) 52%, var(--gold-foil) 58%, var(--gold) 74%, var(--gold-deep) 100%);

  --font-display:'Cormorant Garamond','EB Garamond',Georgia,serif;
  --font-script:'Pinyon Script',cursive;
  --font-serif:'EB Garamond',Georgia,serif;
}
.abby-book[data-tpl="luxury_xv"]{
  --gold:#b89968; --gold-bright:#e7c884; --gold-foil:#fff3d4; --gold-deep:#7a5a22;
  --velvet-0:#100b08; --velvet-1:#1c130c; --velvet-2:#2a1c10;
  --page:#fbf6ed; --page-edge:#e8dcc4; --page-edge2:#d8c79f; --ink:#1a1614;
  --accent-soft:#e9c9c2;
}
.abby-book[data-tpl="luxury_wedding"]{
  --gold:#a98f6f; --gold-bright:#d9bd8e; --gold-foil:#f6ead0; --gold-deep:#6e5530;
  --velvet-0:#0e0c0a; --velvet-1:#1c1a17; --velvet-2:#2a2017; --royal-wine:#2a0f12;
  --page:#f6f1ea; --page-edge:#e6dccb; --page-edge2:#cdbfa6; --ink:#2a251f;
  --accent-soft:#c9b9a0;
}

/* ── Escenario / fondo de palacio ──────────────────────────────── */
.abby-book.pxbook-stagebg{
  background:
    radial-gradient(120% 90% at 50% -10%, var(--glow-warm) 0%, transparent 55%),
    radial-gradient(140% 120% at 50% 8%, var(--velvet-2) 0%, var(--velvet-1) 38%, var(--velvet-0) 100%) !important;
}
.abby-book[data-tpl="luxury_wedding"].pxbook-stagebg{
  background:
    radial-gradient(120% 90% at 50% -10%, var(--glow-warm) 0%, transparent 55%),
    radial-gradient(140% 120% at 50% 8%, var(--velvet-2) 0%,
       color-mix(in srgb, var(--velvet-1) 88%, var(--royal-wine)) 40%, var(--velvet-0) 100%) !important;
}

/* Halo de candelabro detrás del libro (capa fija) */
.pxbook-aura{
  position:absolute; inset:0; pointer-events:none; z-index:0;
  background:radial-gradient(46% 40% at 50% 40%, var(--glow-core) 0%, var(--glow-warm) 34%, transparent 70%);
  animation:pxAura 7s ease-in-out infinite; will-change:opacity,transform;
}
.abby-book[data-open="1"] .pxbook-aura{ opacity:.4; transition:opacity .6s ease; }

/* Campo de sparkles (fairy-dust) — hermanos del libro */
.pxbook-sparkles{ position:absolute; inset:0; z-index:1; pointer-events:none; overflow:hidden; }
.pxbook-dust{
  position:absolute; top:50%; left:50%; width:2px; height:2px; border-radius:50%; background:transparent;
  box-shadow:
    -180px -120px 0 0 var(--gold-foil),  120px -160px 0 0 var(--gold-bright),
     200px   40px 0 0 var(--gold-foil), -220px   60px 0 0 var(--gold-bright),
     -60px -200px 0 0 var(--gold-foil),   60px  180px 0 0 var(--gold-bright),
     240px  -60px 0 0 var(--gold-foil), -260px  -40px 0 0 var(--gold-bright),
       0px -240px 0 0 var(--gold-foil),  140px  120px 0 0 var(--gold-bright);
  animation:pxDriftA 9s ease-in-out infinite, pxTwinkle 2.6s ease-in-out infinite;
  will-change:transform,opacity;
}
.pxbook-dust.b{ animation:pxDriftB 11s ease-in-out infinite, pxTwinkle 3.4s ease-in-out infinite .8s; opacity:.7; }
.pxbook-dust.c{ width:1px; height:1px;
  animation:pxDriftA 13s ease-in-out infinite reverse, pxTwinkle 2.1s ease-in-out infinite .4s; opacity:.5; }

/* Estrellas de 4 puntas (de Enchanted, reubicadas al escenario) */
.pxbook-star{
  position:absolute; width:14px; height:14px; pointer-events:none; z-index:1;
  filter:drop-shadow(0 0 4px rgba(231,200,132,.9)); animation:pxStar 5s ease-in-out infinite;
}
.pxbook-star::before,.pxbook-star::after{ content:''; position:absolute; inset:0; }
.pxbook-star::before{ width:1.5px; left:50%; transform:translateX(-50%);
  background:linear-gradient(180deg,transparent,var(--gold-spec),transparent); }
.pxbook-star::after{ height:1.5px; top:50%; transform:translateY(-50%);
  background:linear-gradient(90deg,transparent,var(--gold-spec),transparent); }
.pxbook-star.s1{ top:18%; left:16%; animation-delay:0s }
.pxbook-star.s2{ top:24%; right:15%; animation-delay:1.3s; transform:scale(.7) }
.pxbook-star.s3{ bottom:24%; left:22%; animation-delay:2.1s }
.pxbook-star.s4{ bottom:30%; right:20%; animation-delay:3s; transform:scale(.6) }

/* ── Stage que envuelve el HTMLFlipBook ────────────────────────── */
.pxbook-stage{
  /* SIN perspective ni transform aquí: StPageFlip posiciona las páginas que
     voltean con coords absolutas y un transform/perspective en un ancestro
     rompe ese cálculo (la página colgaba fuera del libro). La perspectiva 3D
     del flip la maneja la propia librería. La apertura es solo opacidad. */
  position:relative; z-index:2;
  animation:pxPresent 800ms ease both;
}
/* canto derecho dorado (book block) */
.pxbook-stage::after{
  content:""; position:absolute; top:3%; bottom:3%; right:-6px; width:8px;
  border-radius:0 3px 3px 0; z-index:-1;
  background:repeating-linear-gradient(180deg, var(--page-edge) 0 2px, var(--page-edge2) 2px 3px);
  box-shadow:2px 0 6px rgba(0,0,0,.4);
}
/* lomo / canto izquierdo */
.pxbook-stage::before{
  content:""; position:absolute; top:2%; bottom:2%; left:-7px; width:14px;
  border-radius:4px 0 0 4px; z-index:-1;
  background:linear-gradient(90deg,#0a0705,var(--gold-deep) 60%,#1a120a);
  box-shadow:inset -2px 0 4px rgba(0,0,0,.6), -2px 0 10px rgba(0,0,0,.5);
}
/* sombra ambiental bajo el libro */
.pxbook-floor{
  position:absolute; left:50%; bottom:-26px; width:78%; height:34px;
  transform:translateX(-50%); z-index:-2; border-radius:50%;
  background:radial-gradient(closest-side, var(--shadow-amb), transparent 75%);
  filter:blur(6px); animation:pxFloor 6s ease-in-out infinite;
}
/* lomo central de doble página (de Atelier) — solo spread desktop */
.pxbook-spine-center{
  position:absolute; top:0; bottom:0; left:50%; width:34px; transform:translateX(-50%);
  pointer-events:none; z-index:3;
  background:linear-gradient(90deg,transparent,rgba(0,0,0,.18) 42%,rgba(0,0,0,.26) 50%,rgba(0,0,0,.18) 58%,transparent);
}

/* ── PORTADA ───────────────────────────────────────────────────── */
.pxbook-cover{ position:relative; overflow:hidden; }
.pxbook-cover .pxbook-scrim{
  position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(120% 80% at 50% 20%, transparent 0%, rgba(0,0,0,.30) 60%, rgba(0,0,0,.66) 100%),
    linear-gradient(180deg, rgba(16,11,8,.30), rgba(16,11,8,.62));
}
/* marco de filigrana doble */
.pxbook-cover::before{
  content:""; position:absolute; inset:14px; pointer-events:none; z-index:3;
  border:1px solid rgba(203,171,116,.55); border-radius:2px;
  box-shadow:inset 0 0 0 1px rgba(255,243,212,.10), inset 0 0 26px rgba(122,90,34,.30);
}
.pxbook-cover .pxbook-frame{
  position:absolute; inset:22px; z-index:3; pointer-events:none;
  border:1px solid rgba(231,200,132,.30);
  animation:pxFrameGlow 4.5s ease-in-out infinite;
}
/* gold-foil shimmer en barrido */
.pxbook-cover .pxbook-foil{
  position:absolute; inset:-40% -10%; z-index:2; pointer-events:none; mix-blend-mode:screen;
  background:linear-gradient(105deg,
    transparent 38%, rgba(255,243,212,0) 44%, rgba(255,243,212,.55) 50%,
    rgba(231,200,132,.20) 54%, transparent 60%);
  opacity:0; transform:translate3d(-30%,0,0);
  animation:pxFoilIntro 1400ms ease-out 700ms 1, pxFoil 6.5s ease-in-out 2.2s infinite;
}
/* grosor de tapa dura (relieve del lomo) */
.pxbook-cover, .pxbook-back{
  box-shadow:
    inset 0 0 0 1px rgba(255,243,212,.06),
    inset 8px 0 16px -8px rgba(0,0,0,.55),
    0 1px 0 rgba(255,243,212,.10);
  background-clip:padding-box;
}
/* hairline / crest bajo el logo */
.pxbook-crest{ width:54px; height:1px; margin:14px auto 0; position:relative;
  background:linear-gradient(90deg,transparent,var(--gold-line),transparent); }
.pxbook-crest::after{ content:"✦"; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-55%); color:var(--gold-bright); font-size:11px; }

/* Tipografía portada */
.pxbook-eyebrow{ font-family:system-ui,sans-serif; font-size:11px; letter-spacing:.42em;
  text-transform:uppercase; }
.pxbook-script{ font-family:var(--font-script); font-size:clamp(20px,4vw,30px); color:var(--gold-bright);
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
.pxbook-title{
  font-family:var(--font-display); font-style:italic; font-weight:500;
  font-size:clamp(30px,6.4vw,50px); line-height:1.02; letter-spacing:.005em;
  background:var(--gold-foil-grad); -webkit-background-clip:text; background-clip:text; color:transparent;
  text-shadow:0 1px 0 rgba(0,0,0,.35);
  animation:pxTitleGlow 5s ease-in-out infinite;
}
.pxbook-date{ font-family:var(--font-serif); letter-spacing:.22em; text-transform:uppercase; font-size:13px; }
.pxbook-accentline{ width:44px; height:1px; margin:20px auto 0; opacity:.9;
  background:var(--gold-foil-band); background-size:200% 100%; }

/* ── PÁGINAS DE FOTO ───────────────────────────────────────────── */
.pxbook-page{
  position:relative;
  overflow:hidden;
  background:
    linear-gradient(90deg, rgba(0,0,0,.10) 0%, transparent 7%, transparent 93%, rgba(0,0,0,.08) 100%),
    var(--page);
  background-blend-mode:multiply,normal;
}
.pxbook-page::before{ /* grano de papel sutil, estático */
  content:""; position:absolute; inset:0; pointer-events:none; opacity:.5;
  background:radial-gradient(rgba(0,0,0,.018) 1px, transparent 1px) 0 0/3px 3px;
}
/* canto dorado de página (gilt edge — de Atelier) */
.pxbook-page::after{
  content:""; position:absolute; top:0; bottom:0; right:0; width:5px; pointer-events:none;
  background:var(--gold-foil-band); background-size:200% 100%; opacity:.85;
  box-shadow:-1px 0 3px rgba(122,90,34,.5);
}
.pxbook-pagenum{ position:absolute; bottom:10px; right:16px; z-index:2;
  font-family:var(--font-serif); font-style:italic; font-size:12px;
  color:var(--gold-deep); opacity:.5; }

/* ── CONTRAPORTADA ─────────────────────────────────────────────── */
.pxbook-back .pxbook-thanks{ font-family:var(--font-display); font-style:italic;
  font-weight:300; font-size:clamp(26px,5vw,38px);
  background:var(--gold-foil-grad); -webkit-background-clip:text; background-clip:text; color:transparent; }

/* ── UI / CONTROLES ────────────────────────────────────────────── */
.pxbook-ui{ animation:pxUiIn 600ms ease 400ms both; }
.pxbook-studioname{ font-size:11px; letter-spacing:.30em; text-transform:uppercase;
  color:var(--gold-bright); opacity:.85; font-family:system-ui,sans-serif; }
.pxbook-close{
  display:inline-flex; align-items:center; gap:6px; cursor:pointer;
  padding:7px 15px; border-radius:999px; font-size:13px; color:#f3e8d2; font-family:system-ui,sans-serif;
  background:linear-gradient(180deg, rgba(231,200,132,.12), rgba(231,200,132,.05));
  border:1px solid rgba(231,200,132,.34); backdrop-filter:blur(8px);
  transition:background .25s, box-shadow .25s, transform .15s;
}
.pxbook-close:hover{ background:rgba(231,200,132,.20); box-shadow:0 0 18px -4px rgba(231,200,132,.5); }
.pxbook-close:active{ transform:scale(.96); }
.pxbook-nav{
  width:46px; height:46px; border-radius:999px; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; color:#f3e8d2;
  background:radial-gradient(circle at 50% 35%, rgba(231,200,132,.18), rgba(28,19,12,.6));
  border:1px solid rgba(231,200,132,.40);
  box-shadow:inset 0 1px 0 rgba(255,243,212,.18), 0 6px 18px -8px rgba(0,0,0,.6);
  backdrop-filter:blur(8px);
  transition:transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .25s, border-color .25s;
}
.pxbook-nav:hover{ transform:translateY(-2px); border-color:var(--gold-bright);
  box-shadow:inset 0 1px 0 rgba(255,243,212,.25), 0 0 22px -4px rgba(231,200,132,.55); }
.pxbook-nav:active{ transform:scale(.94); }
.pxbook-nav:disabled{ opacity:.35; cursor:default; transform:none; box-shadow:none; }
.pxbook-nav svg{ filter:drop-shadow(0 0 4px rgba(231,200,132,.4)); }
/* contador en pill de cristal (de Enchanted) */
.pxbook-counter{
  display:inline-flex; align-items:baseline; gap:8px; justify-content:center; min-width:74px;
  font-family:var(--font-serif); font-style:italic; font-size:13px; letter-spacing:.12em;
  color:rgba(243,232,210,.6); padding:8px 16px; border-radius:999px;
  background:rgba(20,12,8,.4); border:1px solid rgba(231,200,132,.20); backdrop-filter:blur(8px);
}
.pxbook-counter b{ font-family:var(--font-display); font-style:italic; font-weight:500; font-size:17px;
  background:var(--gold-foil-grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
/* launcher flotante */
.pxbook-launch{
  background:linear-gradient(135deg,var(--gold-foil),var(--gold) 60%,var(--gold-deep));
  color:#2a1c10; font-family:system-ui,sans-serif; font-weight:600;
  box-shadow:0 14px 36px -12px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.2);
  transition:transform .25s, box-shadow .25s;
}
.pxbook-launch:hover{ transform:translateY(-2px);
  box-shadow:0 18px 44px -12px rgba(0,0,0,.55), 0 0 26px rgba(231,200,132,.5); }

/* ── PANTALLA DE CARGA ENCANTADA (libro flotante, de Atelier) ──── */
.pxbook-loading{ position:relative; display:flex; flex-direction:column; align-items:center; gap:18px; z-index:5; }
.pxbook-loading .pxbook-loglow{
  position:absolute; top:6px; width:200px; height:200px; border-radius:50%;
  background:radial-gradient(circle, var(--glow-core) 0%, var(--glow-warm) 45%, transparent 70%);
  filter:blur(6px); animation:pxAura 3.4s ease-in-out infinite;
}
.pxbook-loading .pxbook-logbook{
  position:relative; width:84px; height:108px; border-radius:3px 5px 5px 3px;
  background:linear-gradient(135deg,#1d1812,#0d0a08);
  box-shadow:0 18px 40px -14px #000, inset 0 0 0 1px rgba(197,165,114,.25);
  animation:pxLoadFloat 3.4s ease-in-out infinite;
}
.pxbook-loading .pxbook-logspine{
  position:absolute; left:6px; top:6px; bottom:6px; width:4px; border-radius:2px;
  background:var(--gold-foil-band); background-size:200% 100%; opacity:.8;
}
.pxbook-loading .pxbook-logfoil{
  position:absolute; inset:9px 9px 9px 16px; border-radius:2px; overflow:hidden;
  border:1px solid transparent;
  background:linear-gradient(#0d0a08,#0d0a08) padding-box, var(--gold-foil-band) border-box;
}
.pxbook-loading .pxbook-logfoil::after{
  content:""; position:absolute; inset:0;
  background:linear-gradient(110deg,transparent 40%,rgba(255,250,240,.6) 50%,transparent 60%);
  background-size:250% 100%; animation:pxFoilSweep 2.8s ease-in-out infinite;
}
.pxbook-loading .pxbook-logtxt{
  font-family:var(--font-display); font-style:italic; font-size:18px; letter-spacing:.04em;
  background:var(--gold-foil-grad); -webkit-background-clip:text; background-clip:text; color:transparent;
  animation:pxTextPulse 2.6s ease-in-out infinite;
}
.pxbook-loading .pxbook-logsub{
  font-family:var(--font-serif); text-transform:uppercase; letter-spacing:.32em; font-size:10px;
  color:var(--gold); opacity:.6;
}

/* ╔══ @KEYFRAMES (todos GPU: transform/opacity/filter/bg-position) ══╗ */
@keyframes pxFoil{
  0%{ opacity:0; transform:translate3d(-30%,0,0); }
  18%{ opacity:1; } 38%{ opacity:0; transform:translate3d(120%,0,0); }
  100%{ opacity:0; transform:translate3d(120%,0,0); }
}
@keyframes pxFoilIntro{
  0%{ opacity:0; transform:translate3d(-60%,0,0); }
  35%{ opacity:1; } 100%{ opacity:0; transform:translate3d(120%,0,0); }
}
@keyframes pxFoilSweep{ 0%{ background-position:0% 50%; } 100%{ background-position:200% 50%; } }
@keyframes pxAura{ 0%,100%{ opacity:.7; transform:scale(1); } 50%{ opacity:1; transform:scale(1.04); } }
@keyframes pxFrameGlow{
  0%,100%{ box-shadow:0 0 0 0 rgba(231,200,132,0); border-color:rgba(231,200,132,.22); }
  50%{ box-shadow:0 0 22px -2px rgba(231,200,132,.35); border-color:rgba(231,200,132,.45); }
}
@keyframes pxTitleGlow{
  0%,100%{ filter:drop-shadow(0 0 0 rgba(231,200,132,0)); }
  50%{ filter:drop-shadow(0 2px 10px rgba(231,200,132,.28)); }
}
@keyframes pxTwinkle{ 0%,100%{ opacity:.25 } 50%{ opacity:1 } }
@keyframes pxDriftA{ 0%,100%{ transform:translate3d(0,0,0) } 50%{ transform:translate3d(10px,-16px,0) } }
@keyframes pxDriftB{ 0%,100%{ transform:translate3d(0,0,0) } 50%{ transform:translate3d(-14px,12px,0) } }
@keyframes pxStar{ 0%,100%{ opacity:0; transform:scale(.4) rotate(0deg); }
  50%{ opacity:1; transform:scale(1) rotate(45deg); } }
/* Apertura SOLO opacidad: cualquier transform aquí descoloca el flip de
   StPageFlip (un ancestro transformado rompe las coords absolutas de la
   página que voltea). El fade igual da entrada elegante. */
@keyframes pxPresent{
  0%{ opacity:0; }
  100%{ opacity:1; }
}
@keyframes pxFloor{ 0%,100%{ opacity:.85; transform:translateX(-50%) scaleX(1); }
  50%{ opacity:.6; transform:translateX(-50%) scaleX(.94); } }
@keyframes pxUiIn{ from{ opacity:0; transform:translateY(8px) } to{ opacity:1; transform:none } }
@keyframes pxLoadFloat{ 0%,100%{ transform:translateY(0) rotate(-1.5deg) } 50%{ transform:translateY(-9px) rotate(1.5deg) } }
@keyframes pxTextPulse{ 0%,100%{ opacity:.7 } 50%{ opacity:1 } }

/* ── Accesibilidad: prefers-reduced-motion ─────────────────────── */
@media (prefers-reduced-motion: reduce){
  .pxbook-foil,.pxbook-aura,.pxbook-frame,.pxbook-title,.pxbook-dust,.pxbook-star,
  .pxbook-stage,.pxbook-ui,.pxbook-floor,.pxbook-accentline,
  .pxbook-loading .pxbook-loglow,.pxbook-loading .pxbook-logbook,
  .pxbook-loading .pxbook-logfoil::after,.pxbook-loading .pxbook-logtxt{
    animation:none !important;
  }
  .pxbook-foil{ opacity:0; }
  .pxbook-aura{ opacity:.85; }
  .pxbook-stage{ opacity:1; transform:none; }
  .pxbook-ui{ opacity:1; transform:none; }
  .pxbook-star,.pxbook-dust{ display:none; }   /* el movimiento es su esencia */
}

/* ── Móvil/tablet (portrait, 1 sola hoja) ──────────────────────── */
@media (max-width:819px){
  .pxbook-stage::before{ display:none; }       /* sin lomo izquierdo */
  .pxbook-spine-center{ display:none; }         /* sin lomo central */
  .pxbook-dust.c{ display:none; }               /* menos densidad */
  .pxbook-star.s2,.pxbook-star.s4{ display:none; }
}
@media (max-width:600px){
  .pxbook-dust.b{ display:none; }
}
/* fallback si no hay backdrop-filter (gama baja) */
@supports not (backdrop-filter:blur(1px)){
  .pxbook-close,.pxbook-nav,.pxbook-counter{ background:rgba(28,19,12,.85); backdrop-filter:none; }
}
`

export function FinalDeliveryBook({
  gallery,
  assets,
  studio,
  onClose,
}: {
  gallery: BookGallery
  assets: BookAsset[]
  studio: BookStudio
  onClose?: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<{ pageFlip?: () => { flipNext: () => void; flipPrev: () => void } }>(null)
  const [page, setPage] = useState(0)
  const [ready, setReady] = useState(false)
  const [dims, setDims] = useState({ w: 480, h: 640 })

  const settings = gallery.bookSettings ?? {}
  const tplId = gallery.bookTemplateId ?? "luxury_xv"
  const tpl = TEMPLATES[tplId] ?? TEMPLATES.luxury_xv!
  const accent = s(settings.accent) || gallery.accentColor || tpl.accent
  const pageBg = s(settings.bgColor) || tpl.pageBg
  const photos = useMemo(
    () => assets.filter((a) => a.webUrl || a.thumbUrl),
    [assets],
  )
  const coverImg =
    gallery.bookCoverImage || gallery.coverWebUrl || photos[0]?.webUrl || null

  const title = s(settings.title) || gallery.name
  const quince = s(settings.quinceaneraName)
  const subtitle = s(settings.subtitle)
  const eventDate = s(settings.eventDate)
  const showLogo = settings.showLogo !== false && !!studio.logoUrl

  // En portrait (móvil/tablet) el flipbook muestra 1 sola hoja → sin lomos centrales.
  const isPortrait = dims.w < 520

  // Tamaño responsive del libro (proporción retrato 3:4).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let t: ReturnType<typeof setTimeout> | undefined
    function measure() {
      const node = wrapRef.current
      if (!node) return
      const availW = node.clientWidth
      const availH = node.clientHeight
      // Sin layout todavía: NO fijar dims al piso (se quedaría pegado en 260×
      // con size="fixed"). El ResizeObserver re-dispara cuando haya tamaño real.
      if (availW < 2 || availH < 2) return
      const portrait = availW < 820
      // En desktop el flipbook muestra doble página → cada hoja = mitad.
      const maxW = portrait ? Math.min(availW - 32, 560) : Math.min((availW - 48) / 2, 520)
      let w = maxW
      let h = w * (4 / 3)
      const cap = availH - (portrait ? 150 : 120)
      if (h > cap) {
        h = cap
        w = h * (3 / 4)
      }
      const nw = Math.max(260, Math.round(w))
      const nh = Math.max(340, Math.round(h))
      // Solo actualiza si cambió (evita re-montar el flipbook sin necesidad).
      setDims((prev) => (prev.w === nw && prev.h === nh ? prev : { w: nw, h: nh }))
      setReady(true)
    }
    // ResizeObserver: se dispara cuando el wrapper obtiene/cambia su tamaño real
    // (a diferencia de window.resize, que no se emite en el layout inicial).
    // Debounce: con size="fixed" el libro se re-monta por `key`, así que solo
    // recalculamos cuando el tamaño se asienta.
    const ro = new ResizeObserver(() => {
      if (t) clearTimeout(t)
      t = setTimeout(measure, 140)
    })
    ro.observe(el)
    measure()
    return () => {
      if (t) clearTimeout(t)
      ro.disconnect()
    }
  }, [])

  // Cerrar con Escape en modo overlay.
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  function flip(dir: -1 | 1) {
    const api = bookRef.current?.pageFlip?.()
    if (!api) return
    if (dir === 1) api.flipNext()
    else api.flipPrev()
  }

  // Página de portada (tapa dura).
  const totalPages = photos.length + 2

  // CSS vars de fallback inline (los tokens completos los pone .abby-book / [data-tpl]).
  const wrapVars = {
    "--gold": tpl.accent,
    "--page": pageBg,
    "--ink": tpl.ink,
  } as React.CSSProperties

  return (
    <div
      ref={wrapRef}
      className="abby-book pxbook-stagebg"
      data-tpl={tplId}
      data-open={page > 0 ? "1" : "0"}
      style={{
        ...wrapVars,
        position: "relative",
        width: "100%",
        height: onClose ? "100vh" : "100svh",
        minHeight: onClose ? "100vh" : "640px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <style>{PXBOOK_CSS}</style>

      {/* CAPAS DE ESCENARIO — hermanas del libro, detrás (z-index 0/1) */}
      <div className="pxbook-aura" aria-hidden />
      <div className="pxbook-sparkles" aria-hidden>
        <i className="pxbook-dust" />
        <i className="pxbook-dust b" />
        <i className="pxbook-dust c" />
        <span className="pxbook-star s1" />
        <span className="pxbook-star s2" />
        <span className="pxbook-star s3" />
        <span className="pxbook-star s4" />
      </div>

      {/* Top bar */}
      <div
        className="pxbook-ui"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          zIndex: 10,
        }}
      >
        <span className="pxbook-studioname">{studio.name}</span>
        {onClose && (
          <button onClick={onClose} aria-label="Cerrar álbum" className="pxbook-close">
            <X size={15} /> Cerrar
          </button>
        )}
      </div>

      {!ready ? (
        <div className="pxbook-loading">
          <div className="pxbook-loglow" aria-hidden />
          <div className="pxbook-logbook" aria-hidden>
            <span className="pxbook-logspine" />
            <span className="pxbook-logfoil" />
          </div>
          <p className="pxbook-logtxt">Preparando tu historia…</p>
          <p className="pxbook-logsub">{studio.name}</p>
        </div>
      ) : (
        <div className="pxbook-stage">
          <div className="pxbook-floor" aria-hidden />
          {!isPortrait && <div className="pxbook-spine-center" aria-hidden />}
          <HTMLFlipBook
            key={`pf-${dims.w}x${dims.h}`}
            ref={bookRef}
            width={dims.w}
            height={dims.h}
            size="fixed"
            minWidth={260}
            maxWidth={620}
            minHeight={340}
            maxHeight={920}
            maxShadowOpacity={0.6}
            showCover={true}
            mobileScrollSupport={true}
            drawShadow={true}
            flippingTime={isPortrait ? 750 : 900}
            usePortrait={true}
            useMouseEvents={true}
            clickEventForward={true}
            swipeDistance={30}
            startPage={0}
            className="abby-flipbook"
            style={{}}
            onFlip={(e: { data: number }) => setPage(e.data)}
          >
            {/* PORTADA (tapa dura) */}
            <div data-density="hard" className="pxbook-cover" style={coverStyle(coverImg, tpl, accent, dims.w, dims.h)}>
              <div className="pxbook-scrim" />
              <div className="pxbook-foil" aria-hidden />
              <div className="pxbook-frame" aria-hidden />
              <div style={{ position: "relative", textAlign: "center", padding: 28, color: "#fff", zIndex: 4 }}>
                {showLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={studio.logoUrl!} alt={studio.name} style={{ height: 38, objectFit: "contain", margin: "0 auto 6px", filter: "brightness(0) invert(1) drop-shadow(0 0 8px rgba(0,0,0,.4))", opacity: 0.92 }} />
                )}
                {showLogo && <div className="pxbook-crest" aria-hidden />}
                <p className="pxbook-eyebrow" style={{ margin: "16px 0 14px", opacity: 0.85 }}>
                  {subtitle || "Álbum de entrega"}
                </p>
                {tplId === "luxury_xv" && quince && (
                  <p className="pxbook-script" style={{ margin: "0 0 2px" }}>Su quinceañera</p>
                )}
                <h1 className="pxbook-title" style={{ margin: 0 }}>
                  {quince || title}
                </h1>
                {eventDate && (
                  <p className="pxbook-date" style={{ marginTop: 16, opacity: 0.9 }}>
                    {eventDate}
                  </p>
                )}
                <div className="pxbook-accentline" />
              </div>
            </div>

            {/* PÁGINAS DE FOTOS */}
            {photos.map((a, i) => (
              <div key={a.id} className="pxbook-page" style={photoPageStyle(pageBg, dims.w, dims.h)}>
                <div style={{ position: "relative", width: "100%", height: "100%", padding: "5%", boxSizing: "border-box", zIndex: 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.webUrl ?? a.thumbUrl ?? ""}
                    alt={`${gallery.name} — foto ${i + 1}`}
                    loading="eager"
                    fetchPriority={i < 4 ? "high" : "low"}
                    decoding="async"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", boxShadow: "0 8px 30px -12px rgba(0,0,0,.45)" }}
                  />
                  <span className="pxbook-pagenum">— {i + 1}</span>
                </div>
              </div>
            ))}

            {/* CONTRAPORTADA (tapa dura) */}
            <div data-density="hard" className="pxbook-back" style={{ ...coverStyleSolid(tpl, dims.w, dims.h), display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", color: "#efe6dc", padding: 28 }}>
                {showLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={studio.logoUrl!} alt={studio.name} style={{ height: 34, objectFit: "contain", margin: "0 auto 16px", filter: "brightness(0) invert(1)", opacity: 0.9 }} />
                )}
                <p className="pxbook-thanks" style={{ margin: 0 }}>Gracias.</p>
                {!studio.hideBranding && (
                  <p style={{ marginTop: 18, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.5 }}>
                    {studio.name}
                  </p>
                )}
              </div>
            </div>
          </HTMLFlipBook>
        </div>
      )}

      {/* Controles inferiores */}
      {ready && (
        <div
          className="pxbook-ui"
          style={{
            position: "absolute",
            bottom: 18,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            zIndex: 10,
          }}
        >
          <button onClick={() => flip(-1)} aria-label="Página anterior" className="pxbook-nav" disabled={page === 0}>
            <ChevronLeft size={20} />
          </button>
          <span className="pxbook-counter">
            <b>{Math.min(page + 1, totalPages)}</b> / {totalPages}
          </span>
          <button onClick={() => flip(1)} aria-label="Página siguiente" className="pxbook-nav" disabled={page >= totalPages - 1}>
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Botón flotante + overlay para el modo "ambos" (galería clásica + libro). */
export function BookLauncher(props: {
  gallery: BookGallery
  assets: BookAsset[]
  studio: BookStudio
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="pxbook-launch"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 40,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          border: "none",
          borderRadius: 999,
          padding: "13px 22px",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        <BookOpen size={17} /> Abrir Luxury Book
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
          <FinalDeliveryBook {...props} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}

// ── estilos helper ───────────────────────────────────────────────────────────
// IMPORTANTE: cada página lleva ancho/alto EXPLÍCITO (px), no 100%. En el modo
// flip las hojas blandas inactivas no reciben tamaño de StPageFlip y un 100%
// colapsa a 0 → la imagen se desbordaba fuera del libro al voltear.
function coverStyle(
  img: string | null,
  tpl: Template,
  accent: string,
  w: number,
  h: number,
): React.CSSProperties {
  return {
    width: w,
    height: h,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: img
      ? `#000 url(${img}) center/cover no-repeat`
      : `linear-gradient(135deg, ${tpl.bg}, #000)`,
    boxShadow: `inset 0 0 0 1px ${accent}33`,
    position: "relative",
  }
}
function coverStyleSolid(tpl: Template, w: number, h: number): React.CSSProperties {
  return {
    width: w,
    height: h,
    background: `linear-gradient(135deg, ${tpl.bg}, #0b0a09)`,
  }
}
function photoPageStyle(bg: string, w: number, h: number): React.CSSProperties {
  return { width: w, height: h, background: bg, position: "relative" }
}
