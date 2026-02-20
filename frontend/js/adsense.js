(function () {
  const ENABLE_ADS = false;

  const ADSENSE_CONFIG = {
    clientId: "ca-pub-XXXXXXXXXXXXXXXX",
    homeSlot: "0000000000",
    postSlot: "0000000001",
    genericSlot: "0000000002"
  };

  const PLACEHOLDER_CLIENT = "ca-pub-XXXXXXXXXXXXXXXX";
  const PLACEHOLDER_SLOTS = new Set(["0000000000", "0000000001", "0000000002"]);

  function ensureAdSenseScript(clientId) {
    const existing = document.getElementById("adsense-script");
    if (existing) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = "adsense-script";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Google AdSense script."));
      document.head.appendChild(script);
    });
  }

  function applySlotAttributes() {
    const adNodes = document.querySelectorAll("ins.adsbygoogle[data-adsense-slot-key]");

    adNodes.forEach((node) => {
      const slotKey = node.dataset.adsenseSlotKey || "";
      const slotId = ADSENSE_CONFIG[slotKey];
      if (!slotId) return;

      node.setAttribute("data-ad-client", ADSENSE_CONFIG.clientId);
      node.setAttribute("data-ad-slot", slotId);
    });

    return adNodes;
  }

  function setAdBlocksVisible(visible) {
    const blocks = document.querySelectorAll(".ad-block");
    blocks.forEach((block) => {
      block.classList.toggle("is-enabled", visible);
    });
  }

  function hasPlaceholderValues(nodes) {
    if (ADSENSE_CONFIG.clientId === PLACEHOLDER_CLIENT) return true;

    for (const node of nodes) {
      const slotId = node.getAttribute("data-ad-slot") || "";
      if (PLACEHOLDER_SLOTS.has(slotId)) return true;
    }

    return false;
  }

  async function initializeAds() {
    const adNodes = applySlotAttributes();
    if (!adNodes.length) {
      setAdBlocksVisible(false);
      return;
    }

    if (!ENABLE_ADS) {
      setAdBlocksVisible(false);
      return;
    }

    if (hasPlaceholderValues(adNodes)) {
      setAdBlocksVisible(false);
      console.info("AdSense placeholders detected. Replace clientId and slot IDs in frontend/js/adsense.js to enable ads.");
      return;
    }

    try {
      await ensureAdSenseScript(ADSENSE_CONFIG.clientId);
      setAdBlocksVisible(true);
      adNodes.forEach((node) => {
        if (node.dataset.adsInitialized === "1") return;
        node.dataset.adsInitialized = "1";
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      });
    } catch (error) {
      setAdBlocksVisible(false);
      console.error(error);
    }
  }

  document.addEventListener("DOMContentLoaded", initializeAds);
})();