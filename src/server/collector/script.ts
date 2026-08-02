/**
 * The browser tracker, served verbatim from GET /c/v1/custora.js.
 *
 * Written as a plain string rather than a bundled module on purpose: it has no
 * build step, no dependencies, and stays small enough to inline if needed.
 *
 * Install:
 *   <script defer src="https://track.example.com/c/v1/custora.js"
 *           data-key="ck_..."></script>
 *
 * Public API once loaded:
 *   custora.track("Booked a call", { plan: "pro" })
 *   custora.identify({ email: "sam@acme.com", name: "Sam Okafor" })
 *   custora.page()
 */
export const TRACKER_SCRIPT = `(function (w, d) {
  if (w.custora && w.custora.__loaded) return;

  var script = d.currentScript || (function () {
    var all = d.getElementsByTagName("script");
    return all[all.length - 1];
  })();

  var KEY = script && script.getAttribute("data-key");
  if (!KEY) {
    if (w.console) console.warn("[custora] missing data-key on the script tag");
    return;
  }

  var ORIGIN = new URL(script.src).origin;
  var ENDPOINT = ORIGIN + "/c/v1/e";
  var QUEUE_KEY = "__custora_q";
  var ATTR_KEY = "__custora_attr";
  var QUEUE_MAX = 50;

  var CLICK_IDS = {
    gclid: "google",
    gbraid: "google",
    wbraid: "google",
    fbclid: "meta",
    ttclid: "tiktok",
    msclkid: "microsoft",
    li_fat_id: "linkedin",
    twclid: "x",
    epik: "pinterest",
    sccid: "snapchat"
  };

  function store(key, value) {
    try {
      w.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function read(key) {
    try {
      var raw = w.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * First-touch provenance, captured once and kept. Later events carry it so a
   * conversion three weeks after the ad click still knows where it came from.
   * The server decides whether it becomes a new touchpoint.
   */
  function attribution() {
    var params = new URLSearchParams(w.location.search);
    var found = {};
    var hit = false;

    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (k) {
      var v = params.get(k);
      if (v) {
        found[k.slice(4)] = v;
        hit = true;
      }
    });

    for (var param in CLICK_IDS) {
      var value = params.get(param);
      if (value) {
        found.click_id = value;
        found.click_id_provider = CLICK_IDS[param];
        hit = true;
      }
    }

    if (hit) {
      found.landing_url = w.location.href;
      found.referrer = d.referrer || null;
      found.at = Date.now();
      store(ATTR_KEY, found);
      return found;
    }

    return read(ATTR_KEY) || null;
  }

  function flushQueue() {
    var queued = read(QUEUE_KEY);
    if (!queued || !queued.length) return;
    store(QUEUE_KEY, []);
    queued.forEach(function (payload) {
      send(payload, false);
    });
  }

  function enqueue(payload) {
    var queued = read(QUEUE_KEY) || [];
    queued.push(payload);
    store(QUEUE_KEY, queued.slice(-QUEUE_MAX));
  }

  /**
   * keepalive so the request survives the page unloading mid-navigation.
   * Anything that fails is parked in localStorage and retried on next load,
   * which covers server deploys and brief network drops.
   */
  function send(payload, retryable) {
    var body = JSON.stringify(payload);
    try {
      fetch(ENDPOINT, {
        method: "POST",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: body
      }).catch(function () {
        if (retryable !== false) enqueue(payload);
      });
    } catch (e) {
      if (retryable !== false) enqueue(payload);
    }
  }

  function emit(type, name, props, traits) {
    send({
      k: KEY,
      t: type,
      n: name || null,
      u: w.location.href,
      p: w.location.pathname,
      r: d.referrer || null,
      props: props || null,
      traits: traits || null,
      ctx: attribution(),
      sw: w.screen ? w.screen.width : null,
      tz: Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
      ts: Date.now()
    });
  }

  var lastPath = null;

  function page(name) {
    if (w.location.href === lastPath) return;
    lastPath = w.location.href;
    emit("pageview", name || d.title || null, null, null);
  }

  function track(name, props) {
    emit("custom", name, props, null);
  }

  function identify(traits) {
    if (!traits || (!traits.email && !traits.phone)) return;
    emit("identify", null, null, traits);
  }


  /**
   * Dashboard-defined rules, in the shape of a Google Tag Manager trigger:
   * "when a click matches this selector, record an event called X". Fetched
   * once per page load so adding tracking needs no change to this site's code.
   */
  var rules = [];
  var rulesReady = false;
  var pendingClicks = [];

  /**
   * A rule's pattern is user input that reaches querySelector, so every match
   * runs inside try/catch. One malformed selector typed into the dashboard must
   * not take down tracking for the whole site.
   */
  function ruleMatches(rule, el) {
    try {
      if (rule.m === "selector") return el.closest ? el.closest(rule.p) : null;
      if (rule.m === "text") {
        var text = (el.textContent || "").trim().toLowerCase();
        return text.indexOf(String(rule.p).toLowerCase()) > -1 ? el : null;
      }
      if (rule.m === "href") {
        var link = el.closest ? el.closest("a[href]") : null;
        return link && link.href.indexOf(rule.p) > -1 ? link : null;
      }
      if (rule.m === "path") {
        return w.location.pathname.indexOf(rule.p) > -1 ? el : null;
      }
    } catch (e) {}
    return null;
  }

  function applyRules(trigger, el) {
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.t !== trigger) continue;
      var hit = ruleMatches(rule, el);
      if (hit) {
        emit(trigger === "submit" ? "form_submit" : trigger === "pageview" ? "custom" : "click", rule.n, {
          rule: rule.m + ":" + rule.p,
          text: (hit.textContent || "").trim().slice(0, 120)
        }, null);
      }
    }
  }

  function loadRules() {
    try {
      fetch(ORIGIN + "/c/v1/config?k=" + encodeURIComponent(KEY), {
        credentials: "omit"
      })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          rules = (body && body.rules) || [];
          rulesReady = true;
          // Clicks that landed before the rules arrived still count.
          for (var i = 0; i < pendingClicks.length; i++) {
            applyRules("click", pendingClicks[i]);
          }
          pendingClicks = [];
          applyRules("pageview", d.body || d.documentElement);
        })
        .catch(function () { rulesReady = true; pendingClicks = []; });
    } catch (e) {
      rulesReady = true;
    }
  }

  /**
   * Delegated click capture. Outbound links and anything explicitly marked with
   * data-custora-event are recorded — not every click on the page, which would
   * bury the signal.
   */
  d.addEventListener(
    "click",
    function (ev) {
      var el = ev.target;

      // Rules are evaluated against the clicked element itself; the walk below
      // handles the attribute and outbound-link cases.
      if (rulesReady) applyRules("click", el);
      else if (pendingClicks.length < 20) pendingClicks.push(el);

      while (el && el !== d.body) {
        var marked = el.getAttribute && el.getAttribute("data-custora-event");
        if (marked) {
          emit("click", marked, { text: (el.textContent || "").trim().slice(0, 120) }, null);
          return;
        }
        if (el.tagName === "A" && el.href) {
          var outbound = el.hostname && el.hostname !== w.location.hostname;
          var tel = el.href.indexOf("tel:") === 0;
          var mail = el.href.indexOf("mailto:") === 0;
          if (outbound || tel || mail) {
            emit(
              "click",
              (el.textContent || "").trim().slice(0, 120) || el.href,
              { href: el.href, outbound: !!outbound },
              null
            );
          }
          return;
        }
        el = el.parentNode;
      }
    },
    true
  );

  /**
   * Form submits double as the main identify path — most leads arrive as an
   * email in a form, not as an explicit identify() call.
   */
  d.addEventListener(
    "submit",
    function (ev) {
      var form = ev.target;
      if (!form || form.tagName !== "FORM") return;
      if (form.getAttribute("data-custora-ignore") !== null) return;

      var traits = {};
      var fields = form.querySelectorAll("input, textarea, select");

      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var hint = ((field.type || "") + " " + (field.name || "") + " " + (field.id || "")).toLowerCase();
        var value = (field.value || "").trim();
        if (!value) continue;

        if (!traits.email && (field.type === "email" || hint.indexOf("email") > -1)) {
          traits.email = value;
        } else if (!traits.phone && (field.type === "tel" || hint.indexOf("phone") > -1)) {
          traits.phone = value;
        } else if (!traits.name && hint.indexOf("name") > -1 && hint.indexOf("company") === -1) {
          traits.name = value;
        } else if (!traits.company && hint.indexOf("company") > -1) {
          traits.company = value;
        }
      }

      var label = form.getAttribute("data-custora-form") || form.id || form.name || "Form submit";
      emit("form_submit", label, { fields: fields.length }, Object.keys(traits).length ? traits : null);
      applyRules("submit", form);
    },
    true
  );

  // SPA route changes. History methods are patched because neither pushState
  // nor replaceState fires an event of its own.
  ["pushState", "replaceState"].forEach(function (method) {
    var original = w.history[method];
    w.history[method] = function () {
      var result = original.apply(this, arguments);
      setTimeout(page, 0);
      return result;
    };
  });
  w.addEventListener("popstate", function () {
    page();
  });

  w.custora = {
    __loaded: true,
    track: track,
    identify: identify,
    page: page
  };

  // Replay anything called before the script finished loading.
  var pending = w.custoraQueue;
  if (pending && pending.length) {
    pending.forEach(function (call) {
      var method = w.custora[call[0]];
      if (method) method.apply(null, call.slice(1));
    });
    w.custoraQueue = [];
  }

  flushQueue();
  page();
  loadRules();
})(window, document);
`;
