// src/pages/Dashboard.jsx
import React, { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import JoditEditor from "jodit-react";
import NotificationBox from "../components/NotificationBox";
import Sidebar from "../components/Sidebar";
import Toasts from "../components/Toast";
import ENTITY_KEYS from "../config/entityKeys";

/*
  Dashboard page
  - Highlights for entities and onerous clauses use the same HTML-string approach.
  - The sidebar is controlled via grid layout to avoid editor distortion on collapse.
*/

const SAMPLE = {
  processResult: { entities: {}, warnings: {}, errors: { error_entities: [] } },
  bgTextHtml: "<p>This is sample BG HTML text.</p><p>Amount: 4750000</p>",
  onerous_clauses: []
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

  /*
    highlightAllByHtml(targetText)
    - works on the html state (not walking DOM)
    - escapes regex-special chars in targetText
    - highlights ALL non-overlapping matches (case-insensitive)
    - injects <span class="bg-highlight" data-highlight-id="...">...</span>
    - updates `html` state with new HTML
    - scrolls to the first inserted highlight (if present)
    - shows a toast with how many occurrences were highlighted
  */
  function highlightAllByHtml(targetText) {
    if (!targetText) return 0;

    // 1. clean old highlights from stored html
    const clean = stripHighlights(html);

    // 2. build safe regex
    const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = escapeRegExp(String(targetText).trim());
    const re = new RegExp(pattern, "gi");

    // 3. test if exists
    if (!re.test(clean)) {
      pushToast(`Not found: "${targetText}"`, "error", 3200);
      // flash editor
      const editorWrap = document.querySelector(".jodit-wysiwyg") || document.querySelector(".jodit-wysiwyg_iframe");
      if (editorWrap) {
        editorWrap.style.boxShadow = "0 0 0 3px rgba(255,165,0,0.12)";
        setTimeout(() => (editorWrap.style.boxShadow = ""), 500);
      }
      return 0;
    }

    // 4. Replace all matches with spans (ensure unique ids)
    let idx = 0;
    let firstUid = null;
    const newHtml = clean.replace(re, (m) => {
      const uid = `hl-${Date.now()}-${Math.floor(Math.random() * 10000)}-${idx++}`;
      if (!firstUid) firstUid = uid;
      return `<span class="bg-highlight" data-highlight-id="${uid}">${m}</span>`;
    });

    // 5. update state so Jodit shows the highlights
    setHtml(newHtml);

    // 6. scroll to first highlight after DOM updates
    setTimeout(() => {
      // try to find inside editor DOM first
      let found = document.querySelector(`[data-highlight-id="${firstUid}"]`);
      if (!found) {
        const editorRoot = document.querySelector(".jodit-wysiwyg") || document.querySelector(".jodit-wysiwyg_iframe");
        if (editorRoot) found = editorRoot.querySelector(`[data-highlight-id="${firstUid}"]`);
      }
      if (found && typeof found.scrollIntoView === "function") {
        found.scrollIntoView({ behavior: "smooth", block: "center" });
        found.style.transition = "box-shadow 0.35s";
        found.style.boxShadow = "0 0 8px rgba(0,0,0,0.15)";
        setTimeout(() => (found.style.boxShadow = ""), 600);
      }
      // toast with count
      pushToast(`Highlighted ${idx} occurrence${idx > 1 ? "s" : ""}`, "success", 1800);
    }, 120);

    return idx;
  }

  /* Reuse same highlight behaviour for entities and clauses */
  function onEntityClick(value) {
    if (!value) {
      pushToast("No value to search.", "info", 1600);
      return;
    }
    highlightAllByHtml(String(value));
  }

  function onClauseClick(text) {
    if (!text) {
      pushToast("Clause empty.", "info", 1600);
      return;
    }
    highlightAllByHtml(text);
  }

  // Layout grid to avoid distortions on collapse
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
