(function () {
  const endpoint = "/api/metrics/web-vitals";
  const pagePath = (() => {
    try {
      const url = new URL(window.location.href);
      const pathname = String(url.pathname || "/");

      if (pathname === "/post.html") {
        const slug = String(url.searchParams.get("slug") || "").trim();
        return slug ? `/post.html?slug=${slug}` : pathname;
      }

      if (pathname === "/author.html") {
        const author = String(url.searchParams.get("author") || "").trim();
        return author ? `/author.html?author=${author}` : pathname;
      }

      return pathname;
    } catch {
      return String(window.location.pathname || "/");
    }
  })();
  const sent = new Set();

  function sendMetric(metric) {
    if (!metric || !metric.name) return;
    const key = `${metric.name}:${metric.id || ""}:${pagePath}`;
    if (sent.has(key)) return;
    sent.add(key);

    const payload = {
      name: String(metric.name || "").toUpperCase(),
      value: Number(metric.value || 0),
      rating: String(metric.rating || "unknown"),
      id: String(metric.id || ""),
      path: pagePath,
      source: String(metric.source || "")
    };

    const body = JSON.stringify(payload);

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(endpoint, blob);
        return;
      }
    } catch {
    }

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    }).catch(() => {});
  }

  function getRating(name, value) {
    const metric = String(name || "").toUpperCase();
    if (metric === "LCP") {
      if (value <= 2500) return "good";
      if (value <= 4000) return "needs-improvement";
      return "poor";
    }
    if (metric === "CLS") {
      if (value <= 0.1) return "good";
      if (value <= 0.25) return "needs-improvement";
      return "poor";
    }
    if (metric === "INP") {
      if (value <= 200) return "good";
      if (value <= 500) return "needs-improvement";
      return "poor";
    }
    if (metric === "FCP") {
      if (value <= 1800) return "good";
      if (value <= 3000) return "needs-improvement";
      return "poor";
    }
    if (metric === "TTFB") {
      if (value <= 800) return "good";
      if (value <= 1800) return "needs-improvement";
      return "poor";
    }
    return "unknown";
  }

  function supportsObserverType(type) {
    if (typeof PerformanceObserver === "undefined") return false;
    const supportedTypes = PerformanceObserver.supportedEntryTypes;
    if (!Array.isArray(supportedTypes)) return false;
    return supportedTypes.includes(type);
  }

  function setupLazyLoadingAudit() {
    const apply = (root) => {
      const scope = root && typeof root.querySelectorAll === "function" ? root : document;
      const images = scope.querySelectorAll("img");
      images.forEach((img) => {
        if (!img) return;
        if (img.closest("header")) return;
        if (!img.getAttribute("loading")) img.setAttribute("loading", "lazy");
        if (!img.getAttribute("decoding")) img.setAttribute("decoding", "async");
      });
    };

    apply(document);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          apply(node);
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setupNavigationMetrics() {
    const navigation = performance.getEntriesByType("navigation")[0];
    if (navigation && Number.isFinite(navigation.responseStart)) {
      const ttfb = Math.max(0, navigation.responseStart);
      sendMetric({
        name: "TTFB",
        value: ttfb,
        rating: getRating("TTFB", ttfb),
        id: `${Date.now()}-ttfb`
      });
    }
  }

  function setupPaintMetrics() {
    if (!supportsObserverType("paint")) return;
    try {
      const paintObserver = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          if (entry.name === "first-contentful-paint") {
            const value = Number(entry.startTime || 0);
            sendMetric({
              name: "FCP",
              value,
              rating: getRating("FCP", value),
              id: `${entry.startTime}-fcp`
            });
          }
        });
      });
      paintObserver.observe({ type: "paint", buffered: true });
    } catch {
    }
  }

  function setupLcpMetric() {
    let lcpEntry = null;
    if (!supportsObserverType("largest-contentful-paint")) return;
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        lcpEntry = entries[entries.length - 1] || lcpEntry;
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });

      const flush = () => {
        if (!lcpEntry) return;
        const value = Number(lcpEntry.startTime || 0);
        sendMetric({
          name: "LCP",
          value,
          rating: getRating("LCP", value),
          id: `${lcpEntry.startTime}-lcp`
        });
      };

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
      window.addEventListener("pagehide", flush);
    } catch {
    }
  }

  function setupClsMetric() {
    let clsValue = 0;
    let clsId = `${Date.now()}-cls`;
    if (!supportsObserverType("layout-shift")) return;

    try {
      const clsObserver = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) {
            clsValue += Number(entry.value || 0);
          }
        });
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });

      const flush = () => {
        sendMetric({
          name: "CLS",
          value: clsValue,
          rating: getRating("CLS", clsValue),
          id: clsId
        });
      };

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
      window.addEventListener("pagehide", flush);
    } catch {
    }
  }

  function setupInpMetric() {
    let worst = 0;
    let worstId = `${Date.now()}-inp`;
    let worstSource = "";
    if (!supportsObserverType("event")) return;

    const toSafeSource = (value) => String(value || "")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9_:\-./]/g, "")
      .slice(0, 120);

    const describeInteractionSource = (entry) => {
      const eventName = String(entry?.name || "interaction").toLowerCase();
      const target = entry?.target;
      if (!target || !(target instanceof Element)) {
        return toSafeSource(`unknown:${eventName}`);
      }

      const perfSource = String(target.getAttribute("data-perf-source") || "").trim();
      if (perfSource) return toSafeSource(perfSource);

      const closestPerf = target.closest("[data-perf-source]");
      if (closestPerf) {
        const value = String(closestPerf.getAttribute("data-perf-source") || "").trim();
        if (value) return toSafeSource(value);
      }

      const id = String(target.id || "").trim();
      if (id) return toSafeSource(`id:${id}`);

      const className = String(target.className || "")
        .split(/\s+/)
        .filter(Boolean)[0] || "";
      if (className) return toSafeSource(`class:${className}`);

      return toSafeSource(`${target.tagName.toLowerCase()}:${eventName}`);
    };

    try {
      const inpObserver = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          const interactionId = Number(entry.interactionId || 0);
          if (!Number.isFinite(interactionId) || interactionId <= 0) return;

          const eventName = String(entry.name || "").toLowerCase();
          const allowedEvents = new Set(["click", "keydown", "pointerdown", "pointerup", "touchstart"]);
          if (!allowedEvents.has(eventName)) return;

          if (eventName === "keydown") {
            const rawTarget = entry?.target;
            const target = rawTarget instanceof Element
              ? rawTarget
              : (document.activeElement instanceof Element ? document.activeElement : null);

            if (target) {
              const tag = String(target.tagName || "").toUpperCase();
              const isGlobalTarget = tag === "BODY" || tag === "HTML";
              if (isGlobalTarget) {
                return;
              }
            }
          }

          const duration = Number(entry.duration || 0);
          if (duration > worst) {
            worst = duration;
            worstId = String(interactionId || worstId);
            worstSource = describeInteractionSource(entry);
          }
        });
      });
      inpObserver.observe({ type: "event", buffered: true, durationThreshold: 40 });

      const flush = () => {
        if (!worst) return;
        sendMetric({
          name: "INP",
          value: worst,
          rating: getRating("INP", worst),
          id: worstId,
          source: worstSource
        });
      };

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
      window.addEventListener("pagehide", flush);
    } catch {
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setupLazyLoadingAudit();
      setupNavigationMetrics();
      setupPaintMetrics();
      setupLcpMetric();
      setupClsMetric();
      setupInpMetric();
    });
  } else {
    setupLazyLoadingAudit();
    setupNavigationMetrics();
    setupPaintMetrics();
    setupLcpMetric();
    setupClsMetric();
    setupInpMetric();
  }
})();
