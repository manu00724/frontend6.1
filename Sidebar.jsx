// src/components/Sidebar.jsx
import React from "react";

/**
 * Sidebar component — improved top bar layout and fixed reopen button when collapsed.
 */
export default function Sidebar({
  open,
  setOpen,
  activeTab,
  setActiveTab,
  entityKeys = [],
  entities = {},
  clauses = [],
  onEntityClick,
  onClauseClick,
  warnings = {}
}) {
  const warningList = Object.keys(warnings || {}).filter(k => warnings[k]);

  const panelStyle = {
    width: open ? "320px" : "48px",
    height: "100vh",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column"
  };

  return (
    <>
      <aside style={panelStyle} className="bg-gray-50 border-r">
        {/* top bar */}
        <div className="flex items-center justify-between p-2 border-b">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold px-2">{open ? "Sidebar" : ""}</div>
          </div>

          <div className="flex items-center gap-2 pr-1">
            <button
              onClick={() => setActiveTab("entities")}
              className={`px-2 py-1 rounded ${activeTab === "entities" ? "bg-white shadow" : "text-gray-500"}`}
              aria-label="Entities"
              title="Entities"
            >
              {open ? "Entities" : "E"}
            </button>

            <button
              onClick={() => setActiveTab("clauses")}
              className={`px-2 py-1 rounded ${activeTab === "clauses" ? "bg-white shadow" : "text-gray-500"}`}
              aria-label="Clauses"
              title="Clauses"
            >
              {open ? "Clauses" : "C"}
            </button>

            <button
              onClick={() => setOpen(s => !s)}
              className="ml-1 px-2 py-1 rounded bg-white shadow text-sm"
              title={open ? "Collapse sidebar" : "Open sidebar"}
              aria-label="Toggle sidebar"
            >
              {open ? "«" : "»"}
            </button>
          </div>
        </div>

        <div style={{ overflow: "auto", padding: 12, flex: 1 }}>
          {warningList.length > 0 && open && (
            <div className="mb-3 bg-yellow-50 border border-yellow-200 rounded p-2">
              <div className="text-sm font-semibold text-yellow-800">Warnings</div>
              <ul className="text-sm mt-1 list-disc list-inside text-yellow-700">
                {warningList.map((w) => (
                  <li key={w}>{w.replace(/_/g, " ")}</li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === "entities" ? (
            <>
              {open && <h3 className="font-medium mb-2">Extracted Entities</h3>}
              <div className="space-y-2">
                {entityKeys.map(({ key, label }) => {
                  const hasWarning = Object.keys(warnings || {}).some(w => w.includes(key.split("_").slice(1).join("_")));
                  return (
                    <div key={key} className="flex items-center justify-between bg-white p-2 rounded shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-gray-600">{label}</div>
                        {hasWarning && open && <div className="text-xs px-2 py-0.5 rounded bg-yellow-200 text-yellow-800">! warning</div>}
                      </div>
                      <div>
                        <button onClick={() => onEntityClick(entities[key])} className="text-blue-600 hover:underline">
                          {entities[key] ?? "—"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {open && <h3 className="font-medium mb-2">Onerous Clauses</h3>}
              <div className="space-y-2">
                {(clauses.length ? clauses : ["(no clauses)"]).map((c, idx) => (
                  <div key={idx} className="bg-white p-2 rounded shadow-sm flex items-start">
                    <div className="flex-1 text-sm">{c}</div>
                    <div>
                      <button onClick={() => onClauseClick(c)} className="text-blue-600 hover:underline text-sm">Find</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* fixed reopen button when collapsed (always clickable) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{ position: "fixed", left: 8, top: 120, zIndex: 9999, width: 44, height: 44 }}
          className="rounded bg-blue-600 text-white shadow"
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          ≡
        </button>
      )}
    </>
  );
}
