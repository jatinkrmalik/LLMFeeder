/* LLMFeeder landing — interactivity
   Deliberately small. The scroll scene runs on CSS scroll-driven animations
   (off the main thread) wherever they're supported; JS only covers the theme
   toggle, the step highlights, the no-support fallback, and lazy video. */

(() => {
  "use strict";

  const doc = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsScrollTimeline =
    CSS.supports && CSS.supports("animation-timeline", "view()");

  /* ---------- theme ---------- */

  const themeToggle = document.getElementById("themeToggle");

  const currentTheme = () =>
    doc.getAttribute("data-theme") === "dark" ? "dark" : "light";

  function applyTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    doc.setAttribute("data-theme", next);
    try {
      localStorage.setItem("llmfeeder-theme", next);
    } catch (_) {
      /* private mode: in-memory only */
    }
    if (themeToggle) {
      themeToggle.setAttribute(
        "aria-label",
        next === "dark" ? "Switch to light theme" : "Switch to dark theme"
      );
    }
  }

  if (themeToggle) {
    applyTheme(currentTheme());
    themeToggle.addEventListener("click", () => {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
  }

  /* ---------- sticky header rule ---------- */

  const header = document.querySelector(".site-header");
  if (header) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        header.classList.toggle("is-scrolled", window.scrollY > 8);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- mobile nav ---------- */

  const navToggle = document.querySelector(".nav-toggle");
  const mobileNav = document.getElementById("mobileNav");

  if (navToggle && mobileNav) {
    const closeNav = () => {
      mobileNav.setAttribute("hidden", "");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Open menu");
    };

    navToggle.addEventListener("click", () => {
      const opening = mobileNav.hasAttribute("hidden");
      if (opening) {
        mobileNav.removeAttribute("hidden");
        navToggle.setAttribute("aria-expanded", "true");
        navToggle.setAttribute("aria-label", "Close menu");
      } else {
        closeNav();
      }
    });

    mobileNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeNav);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || mobileNav.hasAttribute("hidden")) return;
      closeNav();
      navToggle.focus();
    });
  }

  /* ---------- hero → scene advance ----------
     One nudge from the hero commits to the scene, so the first scroll lands on
     a composed panel instead of an awkward half-and-half view. Deliberately
     narrow: wheel only, once per visit to the top, never on touch (which has
     its own momentum), never when reduced motion is requested. */

  const heroSection = document.querySelector(".hero");
  const sceneTrack = document.querySelector("[data-strip]");

  if (heroSection && sceneTrack && !reduceMotion) {
    let advancing = false;
    let consumed = false;

    const canAdvance = () => {
      if (advancing || consumed) return false;
      if (window.matchMedia("(pointer: coarse)").matches) return false;
      if (window.innerWidth < 700 || window.innerHeight < 620) return false;
      const hero = heroSection.getBoundingClientRect();
      // Still essentially looking at the hero.
      return hero.bottom > window.innerHeight * 0.6;
    };

    window.addEventListener(
      "wheel",
      (event) => {
        if (event.deltaY <= 4 || event.ctrlKey) return;
        if (!canAdvance()) return;
        event.preventDefault();
        advancing = true;
        consumed = true;
        sceneTrack.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(() => {
          advancing = false;
        }, 700);
      },
      { passive: false }
    );

    // Returning to the very top re-arms the gesture.
    window.addEventListener(
      "scroll",
      () => {
        if (window.scrollY < 8) consumed = false;
      },
      { passive: true }
    );
  }

  /* ---------- the strip scene ---------- */

  const track = document.querySelector("[data-strip]");
  const steps = Array.from(document.querySelectorAll(".stage-steps li"));
  const readout = document.querySelector(".readout-num");

  const TOKENS_RAW = 100238;
  const TOKENS_MD = 8577;

  // Progress thresholds that mirror the CSS animation-range values.
  const STEP_AT = [0, 0.16, 0.42, 0.58, 0.82];

  function markSteps(progress) {
    let active = 0;
    for (let i = 0; i < STEP_AT.length; i += 1) {
      if (progress >= STEP_AT[i]) active = i;
    }
    steps.forEach((step, i) => {
      step.classList.toggle("is-active", i === active);
      step.classList.toggle("is-done", i < active);
    });
    return active;
  }

  function setFallbackTokens(progress) {
    if (!readout) return;
    // Ease the count so it tracks the visual drain rather than raw scroll.
    const t = Math.min(1, Math.max(0, (progress - 0.04) / 0.78));
    const value = Math.round(TOKENS_RAW + (TOKENS_MD - TOKENS_RAW) * t);
    readout.style.setProperty("--tok", String(value));
  }

  if (track && !reduceMotion) {
    let ticking = false;
    let visible = false;

    const update = () => {
      const rect = track.getBoundingClientRect();
      const viewport = window.innerHeight;
      const scrollable = rect.height - viewport;
      // Tall sticky track: progress is how far we've scrolled through it.
      // Short track (collapsed by reduced motion or a narrow override): fall
      // back to view progress so the scene never freezes at zero.
      const progress =
        scrollable > 40
          ? Math.min(1, Math.max(0, -rect.top / scrollable))
          : Math.min(1, Math.max(0, (viewport - rect.top) / (viewport + rect.height)));

      markSteps(progress);
      // CSS drives the counter when scroll timelines exist.
      if (!supportsScrollTimeline) {
        setFallbackTokens(progress);
        const stage = Math.min(4, markSteps(progress));
        track.setAttribute("data-stage", String(stage));
      }
      ticking = false;
    };

    const onScroll = () => {
      if (ticking || !visible) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            visible = entry.isIntersecting;
            if (visible) onScroll();
          });
        },
        { rootMargin: "20% 0px" }
      );
      io.observe(track);
    } else {
      visible = true;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
  } else if (track && reduceMotion) {
    // Reduced motion: state is final, so light every step and land the number.
    steps.forEach((step) => step.classList.add("is-active"));
    if (readout) readout.style.setProperty("--tok", String(TOKENS_MD));
  }

  /* ---------- demo video ---------- */

  const video = document.getElementById("demoVideo");

  if (video && "IntersectionObserver" in window) {
    const vio = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            video.pause();
            return;
          }
          if (video.preload === "none") video.preload = "metadata";
          if (reduceMotion) return;
          const playing = video.play();
          if (playing && typeof playing.catch === "function") {
            playing.catch(() => {
              /* autoplay refused: poster + controls remain */
            });
          }
        });
      },
      { threshold: 0.4 }
    );
    vio.observe(video);
  }
})();
