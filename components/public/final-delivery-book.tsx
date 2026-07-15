"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { X, ChevronLeft, ChevronRight, BookOpen } from "lucide-react"

import {
  parseBookPages,
  layoutGridStyle,
  layoutItemStyle,
  type BookPageLayout,
} from "@/lib/book/layouts"
import { COVER_FONTS_HREF } from "@/lib/book/cover"
import { BookCoverView } from "@/components/galleries/book-cover-view"

// StPageFlip es DOM-pesado y solo cliente. Se carga con import() dentro de un
// efecto (NO next/dynamic) para poder pasarle el `ref` REAL al componente
// forwardRef de react-pageflip (expone pageFlip()). next/dynamic NO reenvía
// refs → bookRef quedaba null y las flechas ◀ ▶ no accionaban el API.
type FlipBookComponent = React.ComponentType<
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
  /** Dedicatoria de la madre / agradecimiento — página tras la portada. */
  motherMessage?: string | null
  motherMessageFrom?: string | null
  motherMessageEnabled?: boolean
  thankyouMessage?: string | null
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

// ── Mensaje de CIERRE del álbum ───────────────────────────────────────────────
// Se muestra SIEMPRE en la última página de contenido (justo antes de la
// contraportada): el agradecimiento del estudio por confiar en su trabajo.
// El nombre del estudio se renderiza aparte (multi-tenant) → el mensaje NO debe
// contener el nombre. `signatureLead` es la antesala en itálica y debajo va el
// nombre del estudio en script. Copia definida por panel creativo (breve, luxury).
const CLOSING_THANKS = {
  eyebrow: "HASTA SIEMPRE",
  message:
    "¡Gracias por confiar en nosotros para ser parte de este momento tan especial! Fue un placer crear estos recuerdos para ti. ✨",
  signatureLead: "Con cariño,",
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  ROYAL ATELIER — Luxury Book Experience (pxbook-)             ║
// ║  Bloque <style> estático: solo depende de las CSS vars inline ║
// ╚══════════════════════════════════════════════════════════════╝
const PXBOOK_CSS = `
/* ── Tokens base + fuentes (las @font se cargan por <link>, ver abajo) ── */
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

/* Luz ambiental que DERIVA por todo el fondo (backdrop vivo, no estático).
   Dos glows cálidos que se desplazan/respiran lento tras el libro. */
.pxbook-ambient{
  position:absolute; inset:-25%; pointer-events:none; z-index:0; mix-blend-mode:screen;
  background:
    radial-gradient(40% 32% at 30% 28%, var(--glow-warm) 0%, transparent 62%),
    radial-gradient(34% 28% at 74% 66%, rgba(231,200,132,.16) 0%, transparent 60%);
  animation:pxAmbient 20s ease-in-out infinite; will-change:transform,opacity;
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
  /* Campo ancho (±660px) para que las partículas cubran TODO el fondo alrededor
     del libro, no solo el centro. */
  box-shadow:
    -360px -220px 0 0 var(--gold-foil),  300px -280px 0 0 var(--gold-bright),
     460px   80px 0 0 var(--gold-foil), -520px  120px 0 0 var(--gold-bright),
    -140px -360px 0 0 var(--gold-foil),  120px  340px 0 0 var(--gold-bright),
     560px -160px 0 0 var(--gold-foil), -600px  -80px 0 0 var(--gold-bright),
      20px -420px 0 0 var(--gold-foil),  320px  260px 0 0 var(--gold-bright),
    -300px  300px 0 0 var(--gold-foil),  620px  300px 0 0 var(--gold-bright),
    -660px  320px 0 0 var(--gold-foil),  440px -340px 0 0 var(--gold-bright);
  animation:pxDriftA 9s ease-in-out infinite, pxTwinkle 2.6s ease-in-out infinite;
  will-change:transform,opacity;
}
.pxbook-dust.b{ animation:pxDriftB 11s ease-in-out infinite, pxTwinkle 3.4s ease-in-out infinite .8s; opacity:.7; }
.pxbook-dust.c{ width:1px; height:1px;
  animation:pxDriftA 13s ease-in-out infinite reverse, pxTwinkle 2.1s ease-in-out infinite .4s; opacity:.55; }
.pxbook-dust.d{
  box-shadow:
    -480px   40px 0 0 var(--gold-foil),  520px -120px 0 0 var(--gold-bright),
    -220px -280px 0 0 var(--gold-foil),  240px  220px 0 0 var(--gold-bright),
     380px  340px 0 0 var(--gold-foil), -420px  260px 0 0 var(--gold-bright),
      80px  420px 0 0 var(--gold-foil),  -80px -460px 0 0 var(--gold-bright),
     640px  120px 0 0 var(--gold-foil), -640px -180px 0 0 var(--gold-bright),
    -560px -260px 0 0 var(--gold-foil),  560px  380px 0 0 var(--gold-bright);
  animation:pxDriftB 12s ease-in-out infinite .5s, pxTwinkle 2.9s ease-in-out infinite 1.1s; opacity:.8;
}

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
/* .pxbook-cover / .pxbook-back también son .stf__item → position:absolute
   (ver nota en .pxbook-page). NO usar relative o el canto duro se descoloca. */
.pxbook-cover{ position:absolute; overflow:hidden; }
.pxbook-cover .pxbook-scrim{
  position:absolute; inset:0; pointer-events:none; z-index:1;
  /* Suave: deja ver la portada (antes ~85% negro la enterraba); solo oscurece
     bordes/base lo justo para que el texto/marco se lean. */
  background:
    radial-gradient(120% 95% at 50% 32%, rgba(0,0,0,.06) 0%, rgba(0,0,0,.20) 55%, rgba(0,0,0,.52) 100%),
    linear-gradient(180deg, rgba(16,11,8,.10), rgba(16,11,8,.50));
}
/* (El marco de la portada lo dibuja BookCoverView según el modelo/margen.) */
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
  /* CAUSA RAIZ del "la foto cuelga debajo del libro": este div TAMBIEN
     recibe la clase .stf__item de StPageFlip, cuya CSS es
     ".stf__item { position:absolute }". Si aqui ponemos position:relative lo
     sobreescribimos (misma especificidad, nuestro <style> va despues) y la
     pagina SOFT se renderiza en FLUJO NORMAL, justo debajo del libro al voltear.
     Debe quedar absolute (lo que StPageFlip espera) y la pagina se superpone
     al libro. El absolute ya da contexto a ::before/::after/.pxbook-pagenum.
     NO volver a poner relative. */
  position:absolute;
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
@keyframes pxAmbient{
  0%,100%{ transform:translate3d(-2%,-1%,0) scale(1);    opacity:.85; }
  33%{    transform:translate3d(3%,2%,0)   scale(1.07);  opacity:1;   }
  66%{    transform:translate3d(-1%,3%,0)  scale(1.03);  opacity:.9;  }
}
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
  .pxbook-foil,.pxbook-aura,.pxbook-ambient,.pxbook-frame,.pxbook-title,.pxbook-dust,.pxbook-star,
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
  // Carga cliente de react-pageflip con su ref real (para que las flechas ◀ ▶
  // puedan llamar pageFlip().flipNext/flipPrev).
  const [HTMLFlipBook, setHTMLFlipBook] = useState<FlipBookComponent | null>(null)
  useEffect(() => {
    let alive = true
    void import("react-pageflip").then((m) => {
      const Comp = (m.default ?? m) as unknown as FlipBookComponent
      if (alive) setHTMLFlipBook(() => Comp)
    })
    return () => {
      alive = false
    }
  }, [])

  const settings = gallery.bookSettings ?? {}
  const tplId = gallery.bookTemplateId ?? "luxury_xv"
  const tpl = TEMPLATES[tplId] ?? TEMPLATES.luxury_xv!
  const accent = s(settings.accent) || gallery.accentColor || tpl.accent
  const pageBg = s(settings.bgColor) || tpl.pageBg
  const photos = useMemo(
    () => assets.filter((a) => a.webUrl || a.thumbUrl),
    [assets],
  )
  // Diseño de páginas (Fase 1). Si el estudio organizó el álbum, usamos SUS
  // páginas (con layouts multi-foto); si no, 1 foto por página como siempre.
  const assetsById = useMemo(() => {
    const m = new Map<string, BookAsset>()
    for (const a of photos) m.set(a.id, a)
    return m
  }, [photos])
  const photoPages = useMemo((): { key: string; layout: BookPageLayout; items: BookAsset[] }[] => {
    const configured = parseBookPages((settings as Record<string, unknown>).pages)
    if (configured.length) {
      return configured
        .map((pg) => ({
          key: pg.id,
          layout: pg.layout,
          items: pg.assetIds
            .map((id) => assetsById.get(id))
            .filter((a): a is BookAsset => !!a),
        }))
        .filter((p) => p.items.length > 0)
    }
    return photos.map((a) => ({ key: a.id, layout: "single" as BookPageLayout, items: [a] }))
  }, [settings, assetsById, photos])
  const coverImg =
    gallery.bookCoverImage || gallery.coverWebUrl || photos[0]?.webUrl || null

  const title = s(settings.title) || gallery.name
  const quince = s(settings.quinceaneraName)
  const subtitle = s(settings.subtitle)
  const eventDate = s(settings.eventDate)
  const showLogo = settings.showLogo !== false && !!studio.logoUrl

  // Música de fondo (opcional). Los navegadores bloquean el autoplay con sonido,
  // así que arranca tras la primera interacción del usuario con la página (y hay
  // botón play/pausa flotante).
  const music = (settings as Record<string, unknown>).music as
    | { url?: string | null; autoplay?: boolean; volume?: number }
    | undefined
  const musicUrl = (music?.url ?? "").trim() || null
  const audioRef = useRef<HTMLAudioElement>(null)
  const [musicOn, setMusicOn] = useState(false)
  const toggleMusic = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      a.volume = typeof music?.volume === "number" ? music.volume : 0.5
      void a.play().then(() => setMusicOn(true)).catch(() => {})
    } else {
      a.pause()
      setMusicOn(false)
    }
  }
  useEffect(() => {
    if (!musicUrl || music?.autoplay === false) return
    const a = audioRef.current
    if (!a) return
    const start = () => {
      a.volume = typeof music?.volume === "number" ? music.volume : 0.5
      void a.play().then(() => setMusicOn(true)).catch(() => {})
    }
    window.addEventListener("pointerdown", start, { once: true })
    return () => window.removeEventListener("pointerdown", start)
  }, [musicUrl, music?.autoplay, music?.volume])

  // Dedicatoria de la madre / agradecimiento (página tras la portada). Misma
  // lógica de 3 estados que la galería pública.
  const dedicationEnabled = !!gallery.motherMessageEnabled
  const dedMother = (gallery.motherMessage ?? "").trim()
  const dedicationText = dedicationEnabled
    ? dedMother ||
      (gallery.thankyouMessage ?? "").trim() ||
      "Gracias por confiar en nosotros para capturar este momento. Fue un privilegio ser parte de él, y esperamos que estas fotografías te acompañen por siempre."
    : ""
  const dedicationIsMother = dedicationEnabled && dedMother.length > 0
  const dedicationFrom = dedicationIsMother
    ? (gallery.motherMessageFrom ?? "").trim()
    : studio.name

  // AUTO-AJUSTE de la dedicatoria al largo del texto. La hoja del álbum es un
  // lienzo de tamaño FIJO y sin scroll: con un mensaje largo (caso real: una
  // madre escribió 1.992 caracteres) el texto se desbordaba y se cortaba.
  // Modelo: con ancho medio de carácter ≈0.46·F y alto de línea ≈1.45·F, el
  // bloque ocupa ≈ n·0.67·F²/anchoÚtil; despejando F para que quepa en el alto
  // útil sale F ≈ √(altoÚtil·anchoÚtil / (n·0.85)) — el 0.85 deja holgura.
  // Se calcula sobre `dims` (tamaño REAL de la hoja), así que sirve igual en
  // móvil que en desktop. Textos cortos quedan clampeados al tamaño de siempre.
  const dedFit = useMemo(() => {
    const n = Math.max(1, dedicationText.length)
    // Con texto largo achicamos también el margen para ganar caja.
    const long = n > 700
    const padX = long ? 0.06 : 0.09
    const padY = long ? 0.07 : 0.11
    // Ojo: en CSS el padding en % SIEMPRE es relativo al ANCHO del contenedor.
    const innerW = Math.max(120, dims.w * (1 - padX * 2))
    const innerH = Math.max(
      120,
      dims.h - dims.w * padY * 2 - (dedicationFrom ? 96 : 48), // rótulo + firma
    )
    const ideal = Math.sqrt((innerH * innerW) / (n * 0.85))
    const size = Math.max(9, Math.min(24, ideal))
    return {
      size,
      lh: size >= 20 ? 1.62 : size >= 15 ? 1.54 : 1.45,
      gap: size >= 20 ? 20 : size >= 15 ? 14 : 10,
      fromSize: Math.max(13, Math.min(26, size * 1.12)),
      padding: `${(padY * 100).toFixed(0)}% ${(padX * 100).toFixed(0)}%`,
    }
  }, [dedicationText, dedicationFrom, dims])

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

  // Cuenta de hojas: portada + contraportada (2) + página de cierre (1, siempre)
  // + dedicatoria del frente (si existe).
  const totalPages = photoPages.length + 3 + (dedicationText ? 1 : 0)

  // Firma del cierre = nombre del estudio, salvo que esté oculto el branding.
  const closingSignature = studio.hideBranding ? "" : studio.name

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
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={COVER_FONTS_HREF} />
      <style dangerouslySetInnerHTML={{ __html: PXBOOK_CSS }} />

      {/* Música de fondo (opcional) + botón play/pausa flotante */}
      {musicUrl && (
        <>
          <audio ref={audioRef} src={musicUrl} loop preload="none" />
          <button
            type="button"
            onClick={toggleMusic}
            aria-label={musicOn ? "Pausar música" : "Reproducir música"}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 40,
              width: 42,
              height: 42,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: "rgba(20,18,26,0.55)",
              color: accent,
              border: `1px solid ${accent}66`,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              boxShadow: musicOn ? `0 0 16px ${accent}66` : "none",
              transition: "box-shadow .3s ease",
            }}
          >
            {musicOn ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M9 17.5V6l9-1.8v9.3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="6.5" cy="17.5" r="2.5" />
                <circle cx="15.5" cy="15.5" r="2.5" />
              </svg>
            )}
          </button>
        </>
      )}

      {/* CAPAS DE ESCENARIO — hermanas del libro, detrás (z-index 0/1) */}
      <div className="pxbook-ambient" aria-hidden />
      <div className="pxbook-aura" aria-hidden />
      <div className="pxbook-sparkles" aria-hidden>
        <i className="pxbook-dust" />
        <i className="pxbook-dust b" />
        <i className="pxbook-dust c" />
        <i className="pxbook-dust d" />
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

      {!ready || !HTMLFlipBook ? (
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
            {[
              /* PORTADA (tapa dura) */
              <div key="cover" data-density="hard" className="pxbook-cover" style={coverStyle(tpl, accent, dims.w, dims.h)}>
                <BookCoverView
                  coverRaw={(settings as Record<string, unknown>).cover}
                  coverImg={coverImg}
                  name={quince || title}
                  subtitle={subtitle || "Álbum de entrega"}
                  eventDate={eventDate}
                  logoUrl={studio.logoUrl ?? null}
                  showLogo={showLogo}
                  accent={accent}
                />
              </div>,

              /* DEDICATORIA / AGRADECIMIENTO (página tras la portada) — solo si existe.
                 IMPORTANTE: react-pageflip hace cloneElement sobre cada hijo y revienta
                 con un hijo null. Por eso se incluye vía spread condicional (nunca null). */
              ...(dedicationText
                ? [
                    <div key="ded" className="pxbook-page" style={photoPageStyle(pageBg, dims.w, dims.h)}>
                      <div
                        style={{
                          position: "relative",
                          width: "100%",
                          height: "100%",
                          padding: dedFit.padding,
                          boxSizing: "border-box",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          zIndex: 1,
                        }}
                      >
                        <p
                          style={{
                            fontFamily: "system-ui, sans-serif",
                            fontSize: 11,
                            letterSpacing: "0.34em",
                            textTransform: "uppercase",
                            color: accent,
                            marginBottom: dedFit.gap,
                            fontWeight: 600,
                          }}
                        >
                          {dedicationIsMother ? "Dedicatoria" : "Gracias"}
                        </p>
                        <p
                          style={{
                            fontFamily: "var(--font-display), 'Cormorant Garamond', Georgia, serif",
                            fontStyle: "italic",
                            // Tamaño auto-ajustado al largo del texto (ver dedFit).
                            fontSize: dedFit.size,
                            lineHeight: dedFit.lh,
                            color: tpl.ink,
                            // Sin tope en `ch`: a tipografía chica un ancho fijo en
                            // `ch` estrecha la columna y volvería a desbordar.
                            maxWidth: "100%",
                          }}
                        >
                          “{dedicationText}”
                        </p>
                        {dedicationFrom && (
                          <p
                            style={{
                              fontFamily: "var(--font-script), 'Pinyon Script', cursive",
                              fontSize: dedFit.fromSize,
                              color: accent,
                              marginTop: dedFit.gap + 2,
                            }}
                          >
                            {dedicationFrom}
                          </p>
                        )}
                      </div>
                    </div>,
                  ]
                : []),

              /* PÁGINAS DE FOTOS (respetan el diseño del álbum; multi-foto por layout) */
              ...photoPages.map((pg, i) => (
                <div key={pg.key} className="pxbook-page" style={photoPageStyle(pageBg, dims.w, dims.h)}>
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: "100%",
                      padding: pg.layout === "full" ? 0 : "5%",
                      boxSizing: "border-box",
                      zIndex: 1,
                      display: "grid",
                      gap: pg.layout === "full" ? 0 : 8,
                      ...layoutGridStyle(pg.layout),
                    }}
                  >
                    {pg.items.map((a, idx) => (
                      <div
                        key={`${a.id}-${idx}`}
                        style={{ position: "relative", overflow: "hidden", ...layoutItemStyle(pg.layout, idx) }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.webUrl ?? a.thumbUrl ?? ""}
                          alt={`${gallery.name} — ${i + 1}`}
                          loading="eager"
                          fetchPriority={i < 3 ? "high" : "low"}
                          decoding="async"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", boxShadow: "0 8px 30px -12px rgba(0,0,0,.45)" }}
                        />
                      </div>
                    ))}
                    <span className="pxbook-pagenum">— {i + 1}</span>
                  </div>
                </div>
              )),

              /* PÁGINA DE CIERRE — agradecimiento del estudio por la confianza.
                 Siempre presente, en papel crema, antes de la contraportada. */
              <div key="closing" className="pxbook-page" style={photoPageStyle(pageBg, dims.w, dims.h)}>
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    padding: "12% 10%",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    zIndex: 1,
                  }}
                >
                  <p
                    style={{
                      fontFamily: "system-ui, sans-serif",
                      fontSize: 11,
                      letterSpacing: "0.36em",
                      textTransform: "uppercase",
                      color: accent,
                      marginBottom: 22,
                      fontWeight: 600,
                    }}
                  >
                    {CLOSING_THANKS.eyebrow}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-display), 'Cormorant Garamond', Georgia, serif",
                      fontStyle: "italic",
                      fontWeight: 400,
                      fontSize: "clamp(17px,3.9vw,26px)",
                      lineHeight: 1.55,
                      color: tpl.ink,
                      maxWidth: "30ch",
                      margin: 0,
                    }}
                  >
                    {CLOSING_THANKS.message}
                  </p>
                  {/* Filete dorado con ornamento ✦ (crest reutilizado) */}
                  <span className="pxbook-crest" aria-hidden style={{ marginTop: 26 }} />
                  {closingSignature && (
                    <div style={{ marginTop: 20 }}>
                      <p
                        style={{
                          fontFamily: "var(--font-serif), 'EB Garamond', Georgia, serif",
                          fontStyle: "italic",
                          fontSize: 13,
                          color: tpl.ink,
                          opacity: 0.7,
                          margin: 0,
                        }}
                      >
                        {CLOSING_THANKS.signatureLead}
                      </p>
                      <p
                        style={{
                          fontFamily: "var(--font-script), 'Pinyon Script', cursive",
                          fontSize: "clamp(22px,4vw,30px)",
                          color: accent,
                          marginTop: 4,
                          lineHeight: 1.1,
                        }}
                      >
                        {closingSignature}
                      </p>
                    </div>
                  )}
                </div>
              </div>,

              /* CONTRAPORTADA (tapa dura) */
              <div key="back" data-density="hard" className="pxbook-back" style={{ ...coverStyleSolid(tpl, dims.w, dims.h), display: "flex", alignItems: "center", justifyContent: "center" }}>
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
              </div>,
            ]}
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
  tpl: Template,
  accent: string,
  w: number,
  h: number,
): React.CSSProperties {
  // La portada se renderiza como <img> real encima (más fiable que un
  // background CSS sobre la tapa dura de StPageFlip). Aquí solo el color base.
  return {
    width: w,
    height: h,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(135deg, ${tpl.bg}, #000)`,
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
