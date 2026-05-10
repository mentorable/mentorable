import { useState, useEffect, useCallback, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

const FONT = "'Space Grotesk', sans-serif";
const BG = "#0f1117";

// ─── Node type configs ────────────────────────────────────────────────────────

const NODE_META = {
  goal: {
    label: "Goal",
    color: "#1d4ed8",
    bg: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)",
    border: "rgba(99,155,255,0.3)",
    text: "#fff",
    subText: "rgba(255,255,255,0.65)",
    width: 240,
    minHeight: 90,
    pill: false,
  },
  task: {
    label: "Task",
    color: "#6366f1",
    bg: "#1c1f2e",
    border: "rgba(99,102,241,0.35)",
    text: "#e2e8f0",
    subText: "#94a3b8",
    width: 200,
    minHeight: 72,
    pill: false,
  },
  opportunity: {
    label: "Opportunity",
    color: "#10b981",
    bg: "#0d1f17",
    border: "rgba(16,185,129,0.35)",
    text: "#6ee7b7",
    subText: "#34d399",
    width: 180,
    minHeight: 44,
    pill: true,
  },
  idea: {
    label: "Idea",
    color: "#f59e0b",
    bg: "#1f1a0d",
    border: "rgba(245,158,11,0.35)",
    text: "#fde68a",
    subText: "#fbbf24",
    width: 180,
    minHeight: 80,
    pill: false,
  },
};

// ─── Inline edit hook ─────────────────────────────────────────────────────────

function useInlineEdit(initialValue, onCommit) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const ref = useRef(null);

  useEffect(() => { setValue(initialValue); }, [initialValue]);

  const start = useCallback((e) => {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 0);
  }, []);

  const commit = useCallback(() => {
    setEditing(false);
    if (value.trim() !== initialValue) onCommit(value.trim() || initialValue);
  }, [value, initialValue, onCommit]);

  const onKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setValue(initialValue); setEditing(false); }
  }, [commit, initialValue]);

  return { editing, value, setValue, ref, start, commit, onKeyDown };
}

// ─── Goal node ────────────────────────────────────────────────────────────────

function GoalNode({ id, data, selected }) {
  const { updateNodeData } = useReactFlow();
  const meta = NODE_META.goal;

  const titleEdit = useInlineEdit(data.label, (v) => updateNodeData(id, { label: v }));
  const noteEdit = useInlineEdit(data.note || "", (v) => updateNodeData(id, { note: v }));

  return (
    <div
      onDoubleClick={titleEdit.start}
      style={{
        width: meta.width,
        minHeight: meta.minHeight,
        background: meta.bg,
        border: `1.5px solid ${selected ? "#60a5fa" : meta.border}`,
        borderRadius: 16,
        padding: "16px 18px",
        boxShadow: selected
          ? "0 0 0 3px rgba(96,165,250,0.25), 0 8px 32px rgba(0,0,0,0.4)"
          : "0 4px 24px rgba(0,0,0,0.35)",
        cursor: "default",
        transition: "box-shadow 0.15s, border-color 0.15s",
        fontFamily: FONT,
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="target" position={Position.Left} style={{ ...handleStyle, top: "50%" }} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: "50%" }} />

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(147,197,253,0.7)", marginBottom: 8 }}>
        Goal
      </div>

      {titleEdit.editing ? (
        <textarea
          ref={titleEdit.ref}
          value={titleEdit.value}
          onChange={(e) => titleEdit.setValue(e.target.value)}
          onBlur={titleEdit.commit}
          onKeyDown={titleEdit.onKeyDown}
          onClick={(e) => e.stopPropagation()}
          rows={2}
          style={{
            ...editableTextareaStyle,
            fontSize: 15, fontWeight: 700, color: meta.text,
            background: "rgba(255,255,255,0.08)",
          }}
        />
      ) : (
        <div style={{ fontSize: 15, fontWeight: 700, color: meta.text, lineHeight: 1.35, marginBottom: 6, wordBreak: "break-word" }}>
          {data.label}
        </div>
      )}

      {(data.note || noteEdit.editing) && (
        noteEdit.editing ? (
          <textarea
            ref={noteEdit.ref}
            value={noteEdit.value}
            onChange={(e) => noteEdit.setValue(e.target.value)}
            onBlur={noteEdit.commit}
            onKeyDown={noteEdit.onKeyDown}
            onClick={(e) => e.stopPropagation()}
            rows={2}
            style={{ ...editableTextareaStyle, fontSize: 12, color: meta.subText, background: "rgba(255,255,255,0.05)" }}
          />
        ) : (
          <div
            onDoubleClick={noteEdit.start}
            style={{ fontSize: 12, color: meta.subText, lineHeight: 1.45, wordBreak: "break-word" }}
          >
            {data.note}
          </div>
        )
      )}
    </div>
  );
}

// ─── Task node ────────────────────────────────────────────────────────────────

function TaskNode({ id, data, selected }) {
  const { updateNodeData } = useReactFlow();
  const meta = NODE_META.task;

  const titleEdit = useInlineEdit(data.label, (v) => updateNodeData(id, { label: v }));

  return (
    <div
      onDoubleClick={titleEdit.start}
      style={{
        width: meta.width,
        minHeight: meta.minHeight,
        background: meta.bg,
        border: `1.5px solid ${selected ? "#818cf8" : meta.border}`,
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: selected
          ? "0 0 0 3px rgba(129,140,248,0.2), 0 6px 24px rgba(0,0,0,0.35)"
          : "0 3px 16px rgba(0,0,0,0.3)",
        cursor: "default",
        transition: "box-shadow 0.15s, border-color 0.15s",
        fontFamily: FONT,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="target" position={Position.Left} style={{ ...handleStyle, top: "50%" }} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: "50%" }} />

      <button
        onClick={(e) => { e.stopPropagation(); updateNodeData(id, { done: !data.done }); }}
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
          border: `2px solid ${data.done ? "#6366f1" : "rgba(99,102,241,0.4)"}`,
          background: data.done ? "#6366f1" : "transparent",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        {data.done && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {titleEdit.editing ? (
          <textarea
            ref={titleEdit.ref}
            value={titleEdit.value}
            onChange={(e) => titleEdit.setValue(e.target.value)}
            onBlur={titleEdit.commit}
            onKeyDown={titleEdit.onKeyDown}
            onClick={(e) => e.stopPropagation()}
            rows={2}
            style={{
              ...editableTextareaStyle,
              fontSize: 13, fontWeight: 600, color: meta.text,
              textDecoration: "none",
              background: "rgba(255,255,255,0.05)",
            }}
          />
        ) : (
          <div style={{
            fontSize: 13, fontWeight: 600, color: meta.text, lineHeight: 1.4,
            textDecoration: data.done ? "line-through" : "none",
            opacity: data.done ? 0.55 : 1,
            wordBreak: "break-word",
          }}>
            {data.label}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Opportunity node ─────────────────────────────────────────────────────────

function OpportunityNode({ id, data, selected }) {
  const { updateNodeData } = useReactFlow();
  const meta = NODE_META.opportunity;

  const titleEdit = useInlineEdit(data.label, (v) => updateNodeData(id, { label: v }));
  const urlEdit = useInlineEdit(data.url || "", (v) => updateNodeData(id, { url: v }));

  return (
    <div
      onDoubleClick={titleEdit.start}
      style={{
        width: meta.width,
        background: meta.bg,
        border: `1.5px solid ${selected ? "#34d399" : meta.border}`,
        borderRadius: 999,
        padding: "10px 18px",
        boxShadow: selected
          ? "0 0 0 3px rgba(52,211,153,0.2), 0 4px 20px rgba(0,0,0,0.35)"
          : "0 3px 14px rgba(0,0,0,0.3)",
        cursor: "default",
        fontFamily: FONT,
        display: "flex",
        alignItems: "center",
        gap: 8,
        transition: "box-shadow 0.15s, border-color 0.15s",
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ ...handleStyle, left: 8 }} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, right: 8 }} />

      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />

      {titleEdit.editing ? (
        <input
          ref={titleEdit.ref}
          value={titleEdit.value}
          onChange={(e) => titleEdit.setValue(e.target.value)}
          onBlur={titleEdit.commit}
          onKeyDown={(e) => { if (e.key === "Enter") titleEdit.commit(); if (e.key === "Escape") { titleEdit.setValue(data.label); titleEdit.commit(); } }}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontSize: 12, fontWeight: 600, color: meta.text, fontFamily: FONT,
            minWidth: 0,
          }}
        />
      ) : (
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: meta.text, lineHeight: 1.3, wordBreak: "break-word" }}>
          {data.label}
        </span>
      )}

      {data.url && (
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ flexShrink: 0, color: "#34d399", opacity: 0.8 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}
    </div>
  );
}

// ─── Idea node ────────────────────────────────────────────────────────────────

function IdeaNode({ id, data, selected }) {
  const { updateNodeData } = useReactFlow();
  const meta = NODE_META.idea;

  const titleEdit = useInlineEdit(data.label, (v) => updateNodeData(id, { label: v }));
  const noteEdit = useInlineEdit(data.note || "", (v) => updateNodeData(id, { note: v }));

  return (
    <div
      onDoubleClick={titleEdit.start}
      style={{
        width: meta.width,
        minHeight: meta.minHeight,
        background: meta.bg,
        border: `1.5px solid ${selected ? "#fbbf24" : meta.border}`,
        borderRadius: "4px 14px 14px 14px",
        padding: "12px 14px",
        boxShadow: selected
          ? "0 0 0 3px rgba(251,191,36,0.2), 0 6px 24px rgba(0,0,0,0.35)"
          : "0 3px 16px rgba(0,0,0,0.3)",
        cursor: "default",
        fontFamily: FONT,
        transition: "box-shadow 0.15s, border-color 0.15s",
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="target" position={Position.Left} style={{ ...handleStyle, top: "50%" }} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: "50%" }} />

      {/* Corner fold */}
      <div style={{
        position: "absolute", top: 0, left: 0, width: 0, height: 0,
        borderStyle: "solid",
        borderWidth: "0 14px 14px 0",
        borderColor: `transparent ${BG} transparent transparent`,
      }} />

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(251,191,36,0.6)", marginBottom: 7 }}>
        💡 Idea
      </div>

      {titleEdit.editing ? (
        <textarea
          ref={titleEdit.ref}
          value={titleEdit.value}
          onChange={(e) => titleEdit.setValue(e.target.value)}
          onBlur={titleEdit.commit}
          onKeyDown={titleEdit.onKeyDown}
          onClick={(e) => e.stopPropagation()}
          rows={2}
          style={{
            ...editableTextareaStyle,
            fontSize: 13, fontWeight: 600, color: meta.text,
            background: "rgba(255,255,255,0.05)",
          }}
        />
      ) : (
        <div style={{ fontSize: 13, fontWeight: 600, color: meta.text, lineHeight: 1.4, marginBottom: data.note ? 6 : 0, wordBreak: "break-word" }}>
          {data.label}
        </div>
      )}

      {(data.note || noteEdit.editing) && (
        noteEdit.editing ? (
          <textarea
            ref={noteEdit.ref}
            value={noteEdit.value}
            onChange={(e) => noteEdit.setValue(e.target.value)}
            onBlur={noteEdit.commit}
            onKeyDown={noteEdit.onKeyDown}
            onClick={(e) => e.stopPropagation()}
            rows={2}
            style={{ ...editableTextareaStyle, fontSize: 12, color: meta.subText, background: "rgba(255,255,255,0.05)" }}
          />
        ) : (
          <div
            onDoubleClick={noteEdit.start}
            style={{ fontSize: 12, color: meta.subText, lineHeight: 1.45, wordBreak: "break-word" }}
          >
            {data.note}
          </div>
        )
      )}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const handleStyle = {
  width: 10, height: 10,
  background: "#1d4ed8",
  border: "2px solid #60a5fa",
  borderRadius: "50%",
};

const editableTextareaStyle = {
  width: "100%",
  resize: "none",
  border: "none",
  outline: "none",
  fontFamily: FONT,
  lineHeight: 1.4,
  borderRadius: 4,
  padding: "2px 4px",
};

const NODE_TYPES = { goal: GoalNode, task: TaskNode, opportunity: OpportunityNode, idea: IdeaNode };

// ─── Type picker ──────────────────────────────────────────────────────────────

function TypePicker({ pos, onSelect, onClose }) {
  const types = Object.entries(NODE_META);
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.12 }}
        style={{
          position: "fixed",
          left: pos.x, top: pos.y,
          zIndex: 1000,
          background: "#1c1f2e",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: "8px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minWidth: 160,
          fontFamily: FONT,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b", padding: "2px 8px 6px" }}>
          Add node
        </div>
        {types.map(([type, meta]) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#e2e8f0",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
              textAlign: "left",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{
              width: 10, height: 10, borderRadius: meta.pill ? "50%" : 3,
              background: meta.color, flexShrink: 0,
            }} />
            {meta.label}
          </button>
        ))}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4, paddingTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              width: "100%", padding: "6px 12px",
              border: "none", background: "transparent",
              color: "#64748b", fontSize: 12, fontFamily: FONT,
              cursor: "pointer", textAlign: "left", borderRadius: 6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Context menu ─────────────────────────────────────────────────────────────

function ContextMenu({ pos, nodeId, onDelete, onChangeType, onClose }) {
  const types = Object.keys(NODE_META);
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.12 }}
        style={{
          position: "fixed",
          left: pos.x, top: pos.y,
          zIndex: 1000,
          background: "#1c1f2e",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: "8px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          minWidth: 160,
          fontFamily: FONT,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b", padding: "2px 8px 6px" }}>
          Change type
        </div>
        {types.map((t) => (
          <button
            key={t}
            onClick={() => onChangeType(t)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 12px",
              borderRadius: 8,
              border: "none", background: "transparent",
              cursor: "pointer", color: "#e2e8f0",
              fontFamily: FONT, fontSize: 12, fontWeight: 600,
              textAlign: "left", transition: "background 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: NODE_META[t].pill ? "50%" : 2,
              background: NODE_META[t].color, flexShrink: 0,
            }} />
            {NODE_META[t].label}
          </button>
        ))}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4, paddingTop: 4 }}>
          <button
            onClick={onDelete}
            style={{
              width: "100%", padding: "7px 12px",
              border: "none", background: "transparent",
              color: "#f87171", fontSize: 12, fontFamily: FONT,
              fontWeight: 600, cursor: "pointer", textAlign: "left",
              borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            Delete node
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ onAddNode, onClearEdges, onFitView, saving }) {
  const types = Object.entries(NODE_META);
  return (
    <div style={{
      position: "absolute",
      top: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 10,
      display: "flex", alignItems: "center", gap: 6,
      background: "#1c1f2e",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding: "6px 10px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      fontFamily: FONT,
    }}>
      {types.map(([type, meta]) => (
        <button
          key={type}
          onClick={() => onAddNode(type)}
          title={`Add ${meta.label}`}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${meta.color}22`,
            background: `${meta.color}11`,
            color: meta.text === "#fff" ? "#e2e8f0" : meta.text,
            cursor: "pointer",
            fontFamily: FONT, fontSize: 12, fontWeight: 600,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `${meta.color}22`; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `${meta.color}11`; }}
        >
          <span style={{ width: 8, height: 8, borderRadius: meta.pill ? "50%" : 2, background: meta.color, flexShrink: 0 }} />
          {meta.label}
        </button>
      ))}

      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

      <button
        onClick={onClearEdges}
        title="Clear all connections"
        style={toolbarBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; e.currentTarget.style.color = "#f87171"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        Clear edges
      </button>

      <button
        onClick={onFitView}
        title="Fit to view"
        style={toolbarBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "#e2e8f0"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
        Fit view
      </button>

      {saving && (
        <div style={{ fontSize: 11, color: "#64748b", fontFamily: FONT, paddingLeft: 4 }}>
          Saving…
        </div>
      )}
    </div>
  );
}

const toolbarBtnStyle = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "6px 10px",
  borderRadius: 8,
  border: "none", background: "transparent",
  color: "#94a3b8",
  cursor: "pointer",
  fontFamily: FONT, fontSize: 12, fontWeight: 600,
  transition: "all 0.15s",
};

// ─── Main canvas inner (needs ReactFlow context) ──────────────────────────────

let nodeIdCounter = Date.now();
const nextId = () => `node_${++nodeIdCounter}`;

function CanvasInner({ userId }) {
  const { fitView, screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [saving, setSaving] = useState(false);

  const [typePicker, setTypePicker] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const saveTimer = useRef(null);
  const didLoad = useRef(false);

  // ── Load from Supabase when userId resolves ─────────────────────────────────
  useEffect(() => {
    if (!userId || didLoad.current) return;
    didLoad.current = true;
    const load = async () => {
      const { data } = await supabase
        .from("student_canvas")
        .select("nodes, edges")
        .eq("user_id", userId)
        .single();
      if (data) {
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
        setTimeout(() => fitView({ padding: 0.15 }), 100);
      }
    };
    load();
  }, [userId]);

  // ── Auto-save (debounced 1.5s) ──────────────────────────────────────────────
  const schedulesSave = useCallback((n, e) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!userId) return;
      setSaving(true);
      await supabase.from("student_canvas").upsert(
        { user_id: userId, nodes: n, edges: e, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      setSaving(false);
    }, 1500);
  }, [userId]);

  // Trigger save whenever nodes or edges change (skip very first render)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    schedulesSave(nodes, edges);
  }, [nodes, edges]);

  // ── Connections ─────────────────────────────────────────────────────────────
  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({
      ...params,
      animated: true,
      style: { stroke: "#3b82f6", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6", width: 16, height: 16 },
    }, eds));
  }, []);

  // ── Add node (from toolbar — centered view) ─────────────────────────────────
  const addNodeCentered = useCallback((type) => {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const jitter = () => (Math.random() - 0.5) * 120;
    const node = {
      id: nextId(),
      type,
      position: { x: center.x + jitter(), y: center.y + jitter() },
      data: { label: NODE_META[type].label },
    };
    setNodes((ns) => [...ns, node]);
    setTypePicker(null);
  }, [screenToFlowPosition]);

  // ── Add node (from canvas click) ────────────────────────────────────────────
  const addNodeAt = useCallback((type, flowPos) => {
    const node = {
      id: nextId(),
      type,
      position: flowPos,
      data: { label: NODE_META[type].label },
    };
    setNodes((ns) => [...ns, node]);
    setTypePicker(null);
  }, []);

  // ── Pane click → type picker ────────────────────────────────────────────────
  const onPaneClick = useCallback((e) => {
    setContextMenu(null);
    if (typePicker) { setTypePicker(null); return; }
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setTypePicker({ screenPos: { x: e.clientX, y: e.clientY }, flowPos });
  }, [screenToFlowPosition, typePicker]);

  // ── Node right-click ────────────────────────────────────────────────────────
  const onNodeContextMenu = useCallback((e, node) => {
    e.preventDefault();
    e.stopPropagation();
    setTypePicker(null);
    setContextMenu({ pos: { x: e.clientX, y: e.clientY }, nodeId: node.id });
  }, []);

  const deleteNode = useCallback((nodeId) => {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setContextMenu(null);
  }, []);

  const changeNodeType = useCallback((nodeId, newType) => {
    setNodes((ns) => ns.map((n) => n.id === nodeId ? { ...n, type: newType } : n));
    setContextMenu(null);
  }, []);

  const clearEdges = useCallback(() => setEdges([]), []);

  // ── applyCanvasUpdate (stub for future chat agent) ──────────────────────────
  // eslint-disable-next-line no-unused-vars
  const applyCanvasUpdate = useCallback((instruction) => {
    // Future: parse instruction and mutate nodes/edges
    console.log("[CanvasPage] applyCanvasUpdate:", instruction);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0 }} onClick={() => { setContextMenu(null); }}>
      <Toolbar
        onAddNode={addNodeCentered}
        onClearEdges={clearEdges}
        onFitView={() => fitView({ padding: 0.15, duration: 400 })}
        saving={saving}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: BG }}
        deleteKeyCode={["Backspace", "Delete"]}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: "#3b82f6", strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6", width: 16, height: 16 },
        }}
      >
        <Background
          color="rgba(255,255,255,0.04)"
          gap={28}
          size={1}
          variant="dots"
        />
        <MiniMap
          style={{
            background: "#1c1f2e",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
          }}
          nodeColor={(node) => NODE_META[node.type]?.color ?? "#3b82f6"}
          maskColor="rgba(0,0,0,0.45)"
          position="bottom-right"
        />
      </ReactFlow>

      {typePicker && (
        <TypePicker
          pos={typePicker.screenPos}
          onSelect={(type) => addNodeAt(type, typePicker.flowPos)}
          onClose={() => setTypePicker(null)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          pos={contextMenu.pos}
          nodeId={contextMenu.nodeId}
          onDelete={() => deleteNode(contextMenu.nodeId)}
          onChangeType={(t) => changeNodeType(contextMenu.nodeId, t)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function CanvasPage() {
  const isMobile = useIsMobile();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const sideOffset = isMobile ? 0 : SIDEBAR_WIDTH;

  return (
    <div style={{
      position: "fixed",
      top: 0, bottom: 0,
      left: sideOffset,
      right: 0,
      background: BG,
      overflow: "hidden",
    }}>
      <ReactFlowProvider>
        <CanvasInner userId={userId} />
      </ReactFlowProvider>
    </div>
  );
}
