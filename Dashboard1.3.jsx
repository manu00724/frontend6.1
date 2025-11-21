// src/pages/Dashboard.jsx
import React, { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import JoditEditor from "jodit-react";
import NotificationBox from "../components/NotificationBox";
import Sidebar from "../components/Sidebar";
import Toasts from "../components/Toast";
import ENTITY_KEYS from "../config/entityKeys";

/*
  Dashboard page (complete)
  - Highlights for entities and onerous clauses use HTML-string replacement with a tolerant fallback
  - Scrolling uses helpers that locate the highlighted element across documents/iframes and calls scrollIntoView in the proper context
  - Uses a CSS grid layout so sidebar collapse does not distort content
*/

const SAMPLE = {
  processResult: {
    entities: {
      bg_currency: "INR",
      crl_currency: "INR",
      currency_matched: "YES",
      bg_amount: "4750000",
      crl_amount: "4750000",
      amount_matched: "YES",
      bg_expiry_date: "NA",
      crl_expiry_date: "31/03/2025",
      expiry_date_matched: "NO",
      bg_claim_expiry_date: "30/09/2025",
      crl_claim_expiry_date: "NA",
      claim_expiry_date_matched: "NO",
      bg_applicant_name: "Company A",
      crl_applicant_name: "Company A",
      applicant_name_matched: "YES",
      bg_beneficiary_name: "Beneficiary A",
      crl_beneficiary_name: "Beneficiary B",
      beneficiary_name_matched: "NO",
      bg_issuing_bank_name: "Bank A",
      crl_issuing_bank_name: "Bank B",
      issuing_bank_name_matched: "NO",
      bg_type: "Financial Guarantee",
      crl_type: "Performance Guarantee",
      type_matched: "NO"
    },
    warnings: {
      expiry_date_mismatch: true,
      claim_expiry_date_mismatch: true,
      beneficiary_name_mismatch: true,
      issuer_name_mismatch: true,
      type_mismatch: true
    },
    errors: {
      error_entities: ["expiry_date", "claim_expiry_date", "beneficiary_name", "issuing_bank_name", "type"]
    }
  },
  bgTextHtml:
    "<p>This is sample BG HTML text.</p><p>Amount: 4750000</p><p>Clause 1: The bank shall be liable for all delays.</p><p>Clause 2: Claim payable on first demand.</p><p>Clause 3: No limitation on liability period.</p>",
  onerous_clauses: [
    "Clause 1: The bank shall be liable for all delays.",
    "Clause 2: Claim payable on first demand.",
    "Clause 3: No limitation on liability period."
  ]
};

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const payload = location.state || SAMPLE;

  const entities = (payload.processResult && payload.processResult.entities) || {};
  const errors = (payload.processResult && payload.processResult.errors && payload.processResult.errors.error_entities) || [];
  const clauses = payload.onerous_clauses || [];
  const warnings = (payload.processResult && payload.processResult.warnings) || {};

  const [html, setHtml] = useState(payload.bgTextHtml || "");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("entities"); // 'entities' | 'clauses'
  const [toasts, setToasts] = useState([]);
  const editorRef = useRef(null);

  /* Toast helpers */
  function pushToast(message, type = "info", ttl = 3000) {
    const id = "t-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    const t = { id, message, type };
    setToasts(prev => [t, ...prev]);
    setTimeout(() => removeToast(id), ttl);
  }
  function removeToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  /* ---- Highlight helpers (HTML string based) ---- */

  // Remove previously injected highlight spans from an HTML string
  function stripHighlights(inputHtml) {
    return inputHtml.replace(/<span[^>]*data-highlight-id="[^"]*"[^>]*>(.*?)<\/span>/gi, "$1");
  }

  // escape regex special chars
  const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // normalize search text: smart quotes to straight, NBSP to space
  function normalizeSearchText(s) {
    if (!s) return "";
    return s
      .replace(/\u2018|\u2019/g, "'")
      .replace(/\u201C|\u201D/g, '"')
      .replace(/\u00A0/g, " ")
      .trim();
  }

  /*
    buildTagTolerantPattern(targetText)
    - allows tags (<...>) or HTML entities (&nbsp; etc) or whitespace between words
  */
  function buildTagTolerantPattern(targetText) {
    const words = String(targetText).trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "";
    const parts = words.map(w => escapeRegExp(w));
    // allow spaces OR HTML tags OR HTML entities like &nbsp; between words
    const sep = "(?:\\s|<[^>]+>|&[^;]+;)+";
    return parts.join(sep);
  }

  /*
    findElementAcrossDocuments(uid)
    - searches for element with data-highlight-id in main document and common jodit iframe variants
    - returns { el, containerWindow } or null
  */
  function findElementAcrossDocuments(uid) {
    // 1) try in main document
    let el = document.querySelector(`[data-highlight-id="${uid}"]`);
    if (el) return { el, containerWindow: window };

    // 2) try jodit iframe wrapper
    const iframe = document.querySelector(".jodit-wysiwyg_iframe iframe");
    if (iframe && iframe.contentDocument) {
      const docEl = iframe.contentDocument.querySelector(`[data-highlight-id="${uid}"]`);
      if (docEl) return { el: docEl, containerWindow: iframe.contentWindow };
    }

    // 3) try other iframe variants inside .jodit-wysiwyg
    const anyIframe = document.querySelector(".jodit-wysiwyg iframe") || document.querySelector("iframe");
    if (anyIframe && anyIframe.contentDocument) {
      const docEl = anyIframe.contentDocument.querySelector(`[data-highlight-id="${uid}"]`);
      if (docEl) return { el: docEl, containerWindow: anyIframe.contentWindow };
    }

    // 4) fallback: search inside contenteditable root
    const editorRoot = document.querySelector(".jodit-wysiwyg");
    if (editorRoot) {
      const inside = editorRoot.querySelector(`[data-highlight-id="${uid}"]`);
      if (inside) return { el: inside, containerWindow: window };
    }

    return null;
  }

  /*
    scrollElementIntoViewAcrossDocs(found)
    - scrolls the element into view using its own window context (handles iframes)
  */
  function scrollElementIntoViewAcrossDocs(found) {
    if (!found || !found.el) return;
    try {
      const { el, containerWindow } = found;
      if (containerWindow && containerWindow.requestAnimationFrame) {
        containerWindow.requestAnimationFrame(() => {
          try {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            // highlight effect
            el.style.transition = "box-shadow 0.35s";
            el.style.boxShadow = "0 0 8px rgba(0,0,0,0.15)";
            setTimeout(() => (el.style.boxShadow = ""), 600);
          } catch (e) {
            // fallback: scroll iframe window to element
            try {
              const rect = el.getBoundingClientRect();
              containerWindow.scrollTo({ top: rect.top + (containerWindow.scrollY || 0) - 120, behavior: "smooth" });
            } catch (e2) { /* ignore */ }
          }
        });
      } else {
        // fallback
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.transition = "box-shadow 0.35s";
        el.style.boxShadow = "0 0 8px rgba(0,0,0,0.15)";
        setTimeout(() => (el.style.boxShadow = ""), 600);
      }
    } catch (err) {
      console.warn("scrollElementIntoViewAcrossDocs:", err);
    }
  }

  /*
    applyReplacementAndSync(cleanHtml, re)
    - replace matches in cleanHtml with highlight spans, update state, scroll first match reliably
  */
  function applyReplacementAndSync(cleanHtml, re) {
    let idx = 0;
    let firstUid = null;

    const newHtml = cleanHtml.replace(re, (m) => {
      const uid = `hl-${Date.now()}-${Math.floor(Math.random() * 10000)}-${idx++}`;
      if (!firstUid) firstUid = uid;
      return `<span class="bg-highlight" data-highlight-id="${uid}">${m}</span>`;
    });

    // Update state so Jodit shows highlights
    setHtml(newHtml);

    // After DOM updates, find and scroll to the first highlight
    setTimeout(() => {
      const found = findElementAcrossDocuments(firstUid);
      if (found) {
        scrollElementIntoViewAcrossDocs(found);
      } else {
        // fallback: try to find inside editor root and scroll
        const editorRoot = document.querySelector(".jodit-wysiwyg") || document.querySelector(".jodit-wysiwyg_iframe");
        if (editorRoot) {
          const maybe = editorRoot.querySelector(`[data-highlight-id="${firstUid}"]`);
          if (maybe) {
            try { maybe.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
          }
        }
      }

      // toast count
      pushToast(`Highlighted ${idx} occurrence${idx > 1 ? "s" : ""}`, "success", 1800);
    }, 120);

    return idx;
  }

  /*
    highlightAllByHtmlWithFallback(targetText)
    - tries simple regex first; if not found, builds tolerant tag/entity pattern and retries
  */
  function highlightAllByHtmlWithFallback(targetText) {
    if (!targetText) return 0;

    const clean = stripHighlights(html);
    const normalizedText = normalizeSearchText(targetText);

    // 1) simple direct regex
    const simplePattern = escapeRegExp(normalizedText);
    const simpleRe = new RegExp(simplePattern, "gi");
    if (simpleRe.test(clean)) {
      return applyReplacementAndSync(clean, simpleRe);
    }

    // 2) fallback tolerant pattern
    const tolerantPattern = buildTagTolerantPattern(normalizedText);
    if (!tolerantPattern) {
      pushToast("Empty search string", "info");
      return 0;
    }
    const tolerantRe = new RegExp(tolerantPattern, "gi");
    if (tolerantRe.test(clean)) {
      return applyReplacementAndSync(clean, tolerantRe);
    }

    // not found
    pushToast(`Not found: "${targetText}"`, "error", 3200);
    const editorWrap = document.querySelector(".jodit-wysiwyg") || document.querySelector(".jodit-wysiwyg_iframe");
    if (editorWrap) {
      editorWrap.style.boxShadow = "0 0 0 3px rgba(255,165,0,0.12)";
      setTimeout(() => (editorWrap.style.boxShadow = ""), 500);
    }
    return 0;
  }

  /* Reuse same highlight behaviour for entities and clauses */
  function onEntityClick(value) {
    if (!value) {
      pushToast("No value to search.", "info", 1600);
      return;
    }
    highlightAllByHtmlWithFallback(String(value));
  }

  function onClauseClick(text) {
    if (!text) {
      pushToast("Clause empty.", "info", 1600);
      return;
    }
    highlightAllByHtmlWithFallback(text);
  }

  // Grid layout to avoid distortions on collapse
  const containerStyle = {
    display: "grid",
    gridTemplateColumns: sidebarOpen ? "320px 1fr" : "48px 1fr",
    height: "100vh",
    overflow: "hidden"
  };

  return (
    <>
      <div style={containerStyle}>
        <Sidebar
          open={sidebarOpen}
          setOpen={setSidebarOpen}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          entityKeys={ENTITY_KEYS}
          entities={entities}
          clauses={clauses}
          onEntityClick={onEntityClick}
          onClauseClick={onClauseClick}
          warnings={warnings}
        />

        <main style={{ overflow: "auto", padding: 16 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xl font-semibold">BG Editor</div>
            <div>
              <button
                onClick={() => setHtml(stripHighlights(html))}
                className="px-3 py-1 bg-slate-700 text-white rounded"
              >
                Clear Highlights
              </button>

              <button
                onClick={() => {
                  const full = { ...payload, bgTextHtml: html };
                  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(full, null, 2));
                  const a = document.createElement("a");
                  a.href = dataStr;
                  a.download = "processResult.json";
                  a.click();
                }}
                className="ml-2 px-3 py-1 bg-green-600 text-white rounded"
              >
                Download JSON
              </button>

              <button onClick={() => navigate("/")} className="ml-2 px-3 py-1 border rounded">
                Back
              </button>
            </div>
          </div>

          <div className="border rounded" style={{ minHeight: 420 }}>
            <JoditEditor
              ref={editorRef}
              value={html}
              tabIndex={1}
              onBlur={(newContent) => setHtml(newContent)}
              config={{ readonly: false, toolbarSticky: false, defaultMode: "wysiwyg", height: 520 }}
            />
          </div>
        </main>
      </div>

      <NotificationBox errors={errors} />

      <Toasts toasts={toasts} onRemove={removeToast} />
    </>
  );
}
