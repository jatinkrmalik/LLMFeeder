(() => {
  const HTML_SAMPLE = `<article class="post">
  <h1>Why context quality wins</h1>
  <p>Paste <b>clean structure</b>, not chrome.</p>
  <ul>
    <li>Main content only</li>
    <li>Tables preserved</li>
  </ul>
</article>`;

  const MD_SAMPLE = `# Why context quality wins

Paste **clean structure**, not chrome.

- Main content only
- Tables preserved`;

  const out = document.getElementById("transformOut");
  const panel = document.querySelector("[data-transform]");
  const playBtn = document.querySelector("[data-play]");
  const modeButtons = document.querySelectorAll(".mode-toggle [data-mode]");
  const video = document.getElementById("demoVideo");
  const header = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const mobileNav = document.getElementById("mobileNav");
  const starCount = document.getElementById("starCount");

  let mode = "html";
  let animating = false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function escapeHtml(str) {
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function colorHtml(src) {
    return escapeHtml(src)
      .replaceAll(/&lt;(\/?[a-z0-9]+)([^&]*?)&gt;/gi, (_m, tag, rest) => {
        const attrs = rest.replaceAll(
          /([a-z:-]+)(=)(&quot;.*?&quot;|&#39;.*?&#39;|\S+)/gi,
          '<span class="attr">$1</span>$2$3'
        );
        return `&lt;<span class="tag">${tag}</span>${attrs}&gt;`;
      });
  }

  function colorMd(src) {
    return escapeHtml(src)
      .replaceAll(/^(# .+)$/m, '<span class="md-h">$1</span>')
      .replaceAll(/\*\*(.+?)\*\*/g, '<span class="md-b">**$1**</span>');
  }

  function render(nextMode, { animate = false } = {}) {
    mode = nextMode;
    modeButtons.forEach((btn) => {
      btn.setAttribute("aria-selected", String(btn.dataset.mode === mode));
    });

    const raw = mode === "html" ? HTML_SAMPLE : MD_SAMPLE;
    const painted = mode === "html" ? colorHtml(raw) : colorMd(raw);

    if (!animate || reduceMotion || !out) {
      if (out) out.innerHTML = painted;
      return;
    }

    animating = true;
    out.style.opacity = "0";
    out.style.transform = "translateY(6px)";
    window.setTimeout(() => {
      out.innerHTML = painted;
      out.style.opacity = "1";
      out.style.transform = "translateY(0)";
      animating = false;
    }, 160);
  }

  function playConversion() {
    if (animating) return;
    render("html");
    window.setTimeout(() => render("md", { animate: true }), reduceMotion ? 0 : 450);
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      render(btn.dataset.mode, { animate: true });
    });
  });

  if (playBtn) {
    playBtn.addEventListener("click", playConversion);
  }

  // Entrance + default content
  render("html");
  if (panel) {
    const reveal = () => panel.classList.add("is-in");
    if (reduceMotion) {
      reveal();
    } else if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              reveal();
              window.setTimeout(playConversion, 700);
              io.disconnect();
            }
          });
        },
        { threshold: 0.35 }
      );
      io.observe(panel);
    } else {
      reveal();
      window.setTimeout(playConversion, 500);
    }
  }

  // Sticky header border
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Mobile nav
  if (navToggle && mobileNav) {
    navToggle.addEventListener("click", () => {
      const open = mobileNav.hasAttribute("hidden");
      if (open) mobileNav.removeAttribute("hidden");
      else mobileNav.setAttribute("hidden", "");
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    mobileNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        mobileNav.setAttribute("hidden", "");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", "Open menu");
      });
    });
  }

  // Lazy video play near viewport
  if (video && "IntersectionObserver" in window) {
    const vio = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (video.preload === "none") video.preload = "metadata";
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch(() => {});
            }
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.4 }
    );
    vio.observe(video);
  }

  // Optional live star count (silent fallback)
  if (starCount) {
    fetch("https://api.github.com/repos/jatinkrmalik/LLMFeeder")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || typeof data.stargazers_count !== "number") return;
        starCount.textContent = data.stargazers_count.toLocaleString();
        starCount.hidden = false;
      })
      .catch(() => {});
  }
})();
