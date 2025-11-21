// src/pages/Dashboard.jsx
import React, { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import JoditEditor from "jodit-react";
import NotificationBox from "../components/NotificationBox";
import Sidebar from "../components/Sidebar";
import Toasts from "../components/Toast";
import ENTITY_KEYS from "../config/entityKeys";

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
  const [activeTab, setActiveTab] = useState("entities");

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

  /* Remove previously injected highlight spans from html state */
  function stripHighlights(inputHtml) {
    return inputHtml.replace(/<span[^>]*data-highlight-id="[^"]*"[^>]*>(.*?)<\/span>/gi, "$1");
  }

  /* Helper: get text node for a global char offset inside root */
  function getNodeForCharacterOffset(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let count = 0;
    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length;
      if (count + len >= offset) {
        return { node, localOffset: offset - count };
      }
      count += len;
    }
    return null;
  }

  /*
    Core: find ALL occurrences of targetText (case-insensitive) in the editor's plain text,
    map them to DOM ranges and wrap each in <span class="bg-highlight" data-highlight-id="...">.
    After injecting all highlights, we update `html` state from the editor's DOM (so highlights persist).
    Returns number of matches (integer).
  */
  function highlightAllAndSync(targetText) {
    if (!targetText) return 0;

    // 1) strip any previous highlight markers from the stored html state
    const cleanHtml = stripHighlights(html);
    setHtml(cleanHtml);

    // 2) wait a moment for the editor to reflect the cleaned state
    setTimeout(() => {
      // find editor root (wysiwyg). Try both normal and iframe modes
      const editorRootEl = document.querySelector(".jodit-wysiwyg") || document.querySelector(".jodit-wysiwyg_iframe");
      let rootNode = editorRootEl;
      if (!rootNode) {
        // fallback: check if iframe wrapper exists
        const iframeWrapper = document.querySelector(".jodit-wysiwyg_iframe iframe");
        if (iframeWrapper && iframeWrapper.contentDocument) rootNode = iframeWrapper.contentDocument.body;
      }

      if (!rootNode) {
        pushToast("Editor DOM not found for highlighting", "error");
        return;
      }

      // get plain text for search (use textContent to preserve what's visible)
      const fullText = rootNode.innerText || rootNode.textContent || "";
      const search = String(targetText).trim();
      if (!search) {
        pushToast("Empty search string", "info");
        return;
      }

      // build case-insensitive regex; this will find occurrences in the plain text
      // but we need char indexes in the plain text to map to nodes
      const lowered = fullText.toLowerCase();
      const needle = search.toLowerCase();

      // find all start indices of needle in lowered
      const starts = [];
      let pos = 0;
      while (true) {
        const idx = lowered.indexOf(needle, pos);
        if (idx === -1) break;
        starts.push(idx);
        pos = idx + needle.length;
      }

      if (starts.length === 0) {
        pushToast(`Not found: "${targetText}"`, "error");
        // visual flash
        rootNode.style.boxShadow = "0 0 0 3px rgba(255,165,0,0.12)";
        setTimeout(() => (rootNode.style.boxShadow = ""), 500);
        return;
      }

      // To avoid messing indices when we modify the DOM, we'll collect ranges first,
      // then apply them from last to first (reverse order) so earlier DOM modifications do not shift later offsets.
      const ranges = [];
      for (const startIndex of starts) {
        const endIndex = startIndex + needle.length;
        const start = getNodeForCharacterOffset(rootNode, startIndex);
        const end = getNodeForCharacterOffset(rootNode, endIndex);
        if (start && end) {
          ranges.push({ start, end });
        }
      }

      // Apply wraps from last to first
      let totalWrapped = 0;
      let firstUid = null;
      for (let i = ranges.length - 1; i >= 0; i--) {
        const { start, end } = ranges[i];
        try {
          const range = document.createRange();
          range.setStart(start.node, start.localOffset);
          range.setEnd(end.node, end.localOffset);
          // Extract contents and insert span wrapper (safe across nodes)
          const contents = range.extractContents();
          const span = document.createElement("span");
          const uid = "hl-" + Date.now() + "-" + Math.floor(Math.random() * 1000) + "-" + i;
          span.setAttribute("data-highlight-id", uid);
          span.className = "bg-highlight";
          span.appendChild(contents);
          range.insertNode(span);
          totalWrapped++;
          if (!firstUid) firstUid = uid;
        } catch (err) {
          // skip invalid ranges silently but continue
          console.warn("Failed to wrap a range", err);
        }
      }

      // After DOM modifications, sync the editor's innerHTML back to React state so highlights persist
      // If rootNode is the contentEditable element or body's innerHTML use that
      // Note: jodit may wrap content into its own structure; using innerHTML is acceptable here.
      setTimeout(() => {
        // if we're inside an iframe, serialize the iframe body; otherwise use rootNode.innerHTML
        let newHtml = "";
        if (rootNode.ownerDocument && rootNode.ownerDocument !== document) {
          // in iframe
          newHtml = rootNode.ownerDocument.body.innerHTML;
        } else {
          newHtml = rootNode.innerHTML;
        }
        setHtml(newHtml);

        // Scroll to first highlighted element by uid
        setTimeout(() => {
          const found = document.querySelector(`[data-highlight-id="${firstUid}"]`);
          if (found && typeof found.scrollIntoView === "function") {
            found.scrollIntoView({ behavior: "smooth", block: "center" });
            found.style.transition = "box-shadow 0.35s";
            found.style.boxShadow = "0 0 8px rgba(0,0,0,0.18)";
            setTimeout(() => (found.style.boxShadow = ""), 700);
          } else {
            // fallback: search inside the editor root
            const rootFound = rootNode.querySelector(`[data-highlight-id="${firstUid}"]`);
            if (rootFound && typeof rootFound.scrollIntoView === "function") {
              rootFound.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
        }, 80);

        pushToast(`Highlighted ${totalWrapped} occurrence${totalWrapped > 1 ? "s" : ""}`, "success", 1800);
      }, 40);
    }, 50);

    return starts.length;
  }

  function onEntityClick(value) {
    if (!value) {
      pushToast("No value to search.", "info", 1800);
      return;
    }
    highlightAllAndSync(String(value));
  }

  function onClauseClick(text) {
    if (!text) {
      pushToast("Clause empty", "info", 1800);
      return;
    }
    highlightAllAndSync(text);
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
              <button onClick={() => setHtml(stripHighlights(html))} className="px-3 py-1 bg-slate-700 text-white rounded">Clear Highlights</button>
              <button onClick={() => {
                const full = { ...payload, bgTextHtml: html };
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(full, null, 2));
                const a = document.createElement("a"); a.href = dataStr; a.download = "processResult.json"; a.click();
              }} className="ml-2 px-3 py-1 bg-green-600 text-white rounded">Download JSON</button>
              <button onClick={() => navigate("/")} className="ml-2 px-3 py-1 border rounded">Back</button>
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
