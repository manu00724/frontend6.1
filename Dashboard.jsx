// src/pages/Dashboard.jsx
import React, { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import JoditEditor from "jodit-react";
import NotificationBox from "../components/NotificationBox";
import Sidebar from "../components/Sidebar";
import Toasts from "../components/Toast";
import ENTITY_KEYS from "../config/entityKeys";

const SAMPLE = {
  processResult: {
    entities: {},
    warnings: {},
    errors: { error_entities: [] }
  },
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
  const [activeTab, setActiveTab] = useState("entities"); // entities | clauses

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

  /* Remove previously injected highlight spans (by data-highlight-id) from html state */
  function stripHighlights(inputHtml) {
    return inputHtml.replace(/<span[^>]*data-highlight-id="[^"]*"[^>]*>(.*?)<\/span>/gi, "$1");
  }

  /* Helper: find DOM text node for a given global character offset (in plain text)
     returns { node, localOffset } or null.
  */
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

  /* highlight by computing plain-text index and building Range across nodes */
  function highlightUsingRange(targetText) {
    if (!targetText) return;
    // 1. Clean previous highlights from the html state (so we work on raw DOM)
    const clean = stripHighlights(html);
    setHtml(clean);

    // allow editor to update DOM
    setTimeout(() => {
      // locate editor's editable root
      const editorRoot = document.querySelector(".jodit-wysiwyg") || document.querySelector(".jodit-wysiwyg_iframe");
      let rootNode = editorRoot;
      // if jodit is iframe-based, get the iframe body
      if (!rootNode) {
        const iframe = document.querySelector(".jodit-wysiwyg_iframe iframe");
        if (iframe && iframe.contentDocument) rootNode = iframe.contentDocument.body;
      }
      if (!rootNode) {
        pushToast("Editor DOM not found", "error");
        return;
      }

      // get plain text of the editor (normalized)
      const fullText = rootNode.innerText || rootNode.textContent || "";
      const normalizedSearch = String(targetText).trim();

      // Case-insensitive search on plain text (but preserve original length for range)
      const index = fullText.toLowerCase().indexOf(normalizedSearch.toLowerCase());
      if (index === -1) {
        pushToast(`Not found: "${targetText}"`, "error");
        // small flash
        rootNode.style.boxShadow = "0 0 0 3px rgba(255,165,0,0.12)";
        setTimeout(() => (rootNode.style.boxShadow = ""), 500);
        return;
      }

      const startIndex = index;
      const endIndex = index + normalizedSearch.length;

      // map start index to node+offset
      const start = getNodeForCharacterOffset(rootNode, startIndex);
      const end = getNodeForCharacterOffset(rootNode, endIndex);

      if (!start || !end) {
        pushToast("Could not map text to DOM nodes for highlighting", "error");
        return;
      }

      // create a Range from start to end
      const range = document.createRange();
      range.setStart(start.node, start.localOffset);
      // end may be in same or different node: if same node set end, else set end accordingly
      range.setEnd(end.node, end.localOffset);

      // Extract the contents and wrap them in a highlight span safely (works across nodes)
      const contents = range.extractContents();
      const span = document.createElement("span");
      const uid = "hl-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
      span.setAttribute("data-highlight-id", uid);
      span.className = "bg-highlight";
      span.appendChild(contents);
      range.insertNode(span);

      // scroll into view
      setTimeout(() => {
        const found = rootNode.querySelector(`[data-highlight-id="${uid}"]`);
        if (found && typeof found.scrollIntoView === "function") {
          found.scrollIntoView({ behavior: "smooth", block: "center" });
          found.style.transition = "box-shadow 0.35s";
          found.style.boxShadow = "0 0 10px rgba(0,0,0,0.2)";
          setTimeout(() => (found.style.boxShadow = ""), 700);
        }
      }, 80);

      pushToast(`Highlighted: "${targetText}"`, "success", 1400);
    }, 60);
  }

  // wrappers used by Sidebar
  function onEntityClick(value) {
    if (!value) {
      pushToast("No value to search.", "info", 1800);
      return;
    }
    highlightUsingRange(String(value));
  }

  function onClauseClick(text) {
    if (!text) {
      pushToast("Clause empty", "info", 1800);
      return;
    }
    highlightUsingRange(text);
  }

  // Layout: use CSS grid so collapsed sidebar never overlays content
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
