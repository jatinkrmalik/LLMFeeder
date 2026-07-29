/* LLMFeeder landing  -  interactivity
   Deliberately small. The scroll scene runs on CSS scroll-driven animations
   (off the main thread) wherever they're supported; JS only covers the theme
   toggle, the step highlights, trash chips, and the no-support fallback. */

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
  const trashBin = document.querySelector("[data-trash]");
  const trashCount = document.querySelector("[data-trash-count]");
  const trashChips = Array.from(document.querySelectorAll("[data-trash-chips] li"));

  const TOKENS_RAW = 100238;
  const TOKENS_MD = 8577;

  // Progress thresholds that mirror the CSS animation-range values.
  const STEP_AT = [0, 0.16, 0.42, 0.58, 0.82];

  // When each discarded piece lands in the trash (matches animation-range ends).
  const CHIP_AT = [
    { name: "Newsletter popup", at: 0.1 },
    { name: "Cookie banner", at: 0.13 },
    { name: "Nav chrome", at: 0.28 },
    { name: "Ads", at: 0.3 },
    { name: "Share rail", at: 0.32 },
    { name: "Sidebar", at: 0.34 },
    { name: "Related posts", at: 0.36 },
    { name: "Footer links", at: 0.38 },
  ];

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

  function markTrash(progress) {
    let landed = 0;
    trashChips.forEach((chip) => {
      const name = chip.getAttribute("data-chip");
      const rule = CHIP_AT.find((c) => c.name === name);
      const inBin = rule ? progress >= rule.at : false;
      chip.classList.toggle("is-in", inBin);
      if (inBin) landed += 1;
    });
    if (trashCount) trashCount.textContent = String(landed);
    if (trashBin) {
      trashBin.classList.toggle("is-active", progress > 0.02 && progress < 0.5);
      trashBin.classList.toggle("is-full", landed >= CHIP_AT.length);
    }
  }

  function setFallbackTokens(progress) {
    if (!readout) return;
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
      const progress =
        scrollable > 40
          ? Math.min(1, Math.max(0, -rect.top / scrollable))
          : Math.min(1, Math.max(0, (viewport - rect.top) / (viewport + rect.height)));

      markSteps(progress);
      markTrash(progress);
      if (!supportsScrollTimeline) {
        setFallbackTokens(progress);
        track.setAttribute("data-stage", String(Math.min(4, markSteps(progress))));
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
    steps.forEach((step) => step.classList.add("is-active"));
    trashChips.forEach((chip) => chip.classList.add("is-in"));
    if (trashCount) trashCount.textContent = String(CHIP_AT.length);
    if (trashBin) trashBin.classList.add("is-full");
    if (readout) readout.style.setProperty("--tok", String(TOKENS_MD));
  }

  /* ---------- methodology popover ---------- */

  const methodTrigger = document.getElementById("methodTrigger");
  const methodPopover = document.getElementById("methodPopover");

  if (methodTrigger && methodPopover) {
    let hoverTimer = 0;
    let suppressDocClose = false;

    const open = () => {
      methodPopover.hidden = false;
      methodTrigger.setAttribute("aria-expanded", "true");
    };

    const close = () => {
      methodPopover.hidden = true;
      methodTrigger.setAttribute("aria-expanded", "false");
    };

    const isOpen = () => methodTrigger.getAttribute("aria-expanded") === "true";

    methodTrigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      suppressDocClose = true;
      window.setTimeout(() => {
        suppressDocClose = false;
      }, 50);
      // Always open. Close via outside click, Esc, or mouseleave.
      open();
    });

    methodTrigger.addEventListener("mouseenter", () => {
      if (!window.matchMedia("(hover: hover)").matches) return;
      window.clearTimeout(hoverTimer);
      open();
    });

    methodTrigger.addEventListener("mouseleave", () => {
      if (!window.matchMedia("(hover: hover)").matches) return;
      hoverTimer = window.setTimeout(() => {
        if (!methodPopover.matches(":hover") && document.activeElement !== methodTrigger) {
          close();
        }
      }, 180);
    });

    methodPopover.addEventListener("mouseenter", () => {
      if (!window.matchMedia("(hover: hover)").matches) return;
      window.clearTimeout(hoverTimer);
      open();
    });

    methodPopover.addEventListener("mouseleave", () => {
      if (!window.matchMedia("(hover: hover)").matches) return;
      hoverTimer = window.setTimeout(() => {
        if (document.activeElement !== methodTrigger) close();
      }, 180);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) {
        close();
        methodTrigger.focus();
      }
    });

    document.addEventListener("click", (event) => {
      if (suppressDocClose || !isOpen()) return;
      if (
        !methodTrigger.contains(event.target) &&
        !methodPopover.contains(event.target)
      ) {
        close();
      }
    });
  }
})();
