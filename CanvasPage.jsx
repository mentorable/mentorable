import { useEffect, useRef, useState, startTransition } from "react";
import {
  addEdge,
  Background,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, motion } from "framer-motion";
import Drawer from "./components/common/Drawer.jsx";
import { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";
import {
  OUR_MIND_NODE_META,
  OUR_MIND_TYPE_ORDER,
  OUR_MIND_ZONE_META,
  OUR_MIND_ZONE_ORDER,
  boardHasContent,
  formatDueLabel,
  getNodeZone,
  summarizeOurMindBoard,
} from "./lib/ourMind.js";
import { supabase } from "./lib/supabase.js";

const FONT = "'Space Grotesk', sans-serif";
const BODY_FONT = "'Plus Jakarta Sans', sans-serif";
const PAGE_BG = "linear-gradient(180deg, #edf4ff 0%, #f8fbff 32%, #fdfefe 100%)";
const SURFACE = "#ffffff";
const BORDER = "#dbe7f5";
const TEXT = "#0f172a";
const TEXT_MUTED = "#64748b";
const EDGE_COLOR = "#94a3b8";
const BOOT_STEPS = [
  "Growing your brain map",
  "Sorting this week's missions",
  "Opening the opportunity radar",
];
const ZONE_LAYOUT = {
  self: { top: "5.5%", left: "3.5%", width: "39%", height: "36%" },
  behavior: { top: "5.5%", left: "44.5%", width: "24%", height: "28%" },
  week: { top: "39%", left: "3.5%", width: "39%", height: "31%" },
  opportunities: { top: "36%", left: "59%", width: "37.5%", height: "35%" },
  memory: { top: "74.5%", left: "15.5%", width: "67%", height: "18.5%" },
};

let nodeIdCounter = Date.now();
const nextNodeId = () => `our-mind-${++nodeIdCounter}`;

function makeNode(type, position, overrides = {}) {
  const meta = OUR_MIND_NODE_META[type] || OUR_MIND_NODE_META.note;
  return {
    id: nextNodeId(),
    type,
    position,
    data: {
      label: meta.label,
      body: "",
      zone: meta.zone || "memory",
      source: "user",
      confidence: "medium",
      status: type === "task" ? "active" : "proposed",
      priority: type === "task" ? "high" : "medium",
      tags: [],
      ...overrides,
    },
  };
}

function badgeStyle(color, background) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "0.2rem 0.5rem",
    borderRadius: 999,
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color,
    background,
  };
}

function SourcePill({ source, confidence }) {
  const color = source === "user" ? "#0f766e" : source === "research" ? "#166534" : "#1d4ed8";
  const background = source === "user" ? "#ccfbf1" : source === "research" ? "#dcfce7" : "#dbeafe";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={badgeStyle(color, background)}>{source || "ai"}</span>
      {confidence && <span style={badgeStyle("#475569", "#f1f5f9")}>{confidence}</span>}
    </div>
  );
}

function priorityBadge(priority) {
  return priority === "high"
    ? badgeStyle("#7c2d12", "#ffedd5")
    : priority === "low"
      ? badgeStyle("#475569", "#f1f5f9")
      : badgeStyle("#4338ca", "#e0e7ff");
}

function TaskToggle({ done, onToggle }) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      style={{
        width: 20,
        height: 20,
        borderRadius: 7,
        border: `1.5px solid ${done ? "#7c3aed" : "#c4b5fd"}`,
        background: done ? "#7c3aed" : "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {done && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.2 4.7 9 10 3.6" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function GenericMindNode({ id, data, selected, type }) {
  const { updateNodeData } = useReactFlow();
  const meta = OUR_MIND_NODE_META[type] || OUR_MIND_NODE_META.note;
  const tags = Array.isArray(data.tags) ? data.tags.filter(Boolean).slice(0, 2) : [];
  const body = String(data.body || "").trim();
  const done = Boolean(data.done);
  const status = String(data.status || "");
  const showLink = type === "opportunity" && data.url;
  const dueLabel = formatDueLabel(data.dueDate);
  const zoneLabel = OUR_MIND_ZONE_META[getNodeZone({ type, data })]?.shortLabel;
  const priority = String(data.priority || "");
  const confirmed = Boolean(data.confirmed);

  return (
    <div
      style={{
        width: meta.width,
        minHeight: meta.minHeight,
        borderRadius: 18,
        border: `1.5px solid ${selected ? meta.color : meta.border}`,
        background: meta.bg,
        boxShadow: selected ? `0 0 0 4px ${meta.color}1f, 0 24px 48px rgba(15,23,42,0.12)` : "0 12px 32px rgba(15,23,42,0.08)",
        padding: "14px 14px 12px",
        fontFamily: BODY_FONT,
        color: meta.text,
        transition: "box-shadow 0.16s ease, border-color 0.16s ease, transform 0.16s ease",
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle(meta.color)} />
      <Handle type="source" position={Position.Bottom} style={handleStyle(meta.color)} />
      <Handle type="target" position={Position.Left} style={{ ...handleStyle(meta.color), top: "50%" }} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle(meta.color), top: "50%" }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={badgeStyle(meta.color, `${meta.color}12`)}>{meta.label}</span>
          {zoneLabel && <span style={badgeStyle("#64748b", "#f8fafc")}>{zoneLabel}</span>}
        </div>
        <SourcePill source={data.source} confidence={data.confidence} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: type === "task" ? 10 : 0 }}>
        {type === "task" && (
          <TaskToggle
            done={done}
            onToggle={() => updateNodeData(id, {
              done: !done,
              status: !done ? "done" : "active",
            })}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 15,
              lineHeight: 1.3,
              color: meta.text,
              textDecoration: done ? "line-through" : "none",
              opacity: done ? 0.72 : 1,
              marginBottom: body ? 8 : 0,
            }}
          >
            {data.label}
          </div>

          {body && (
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: meta.subText, whiteSpace: "pre-wrap" }}>
              {body}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {status && <span style={badgeStyle("#475569", "#f8fafc")}>{status}</span>}
          {priority && <span style={priorityBadge(priority)}>{priority}</span>}
          {dueLabel && <span style={badgeStyle("#92400e", "#fff7ed")}>{dueLabel}</span>}
          {confirmed && <span style={badgeStyle("#166534", "#dcfce7")}>confirmed</span>}
          {tags.map((tag) => (
            <span key={tag} style={badgeStyle("#334155", "#f1f5f9")}>{tag}</span>
          ))}
        </div>

        {showLink && (
          <a
            href={String(data.url)}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            style={{ color: meta.color, display: "flex", alignItems: "center" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

const NODE_TYPES = Object.fromEntries(
  OUR_MIND_TYPE_ORDER.map((type) => [type, (props) => <GenericMindNode {...props} type={type} />])
);

function handleStyle(color) {
  return {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#ffffff",
    border: `2px solid ${color}`,
  };
}

function AddMenu({ onCreate, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ duration: 0.14 }}
      style={{
        position: "absolute",
        top: 56,
        left: 0,
        zIndex: 30,
        width: 220,
        borderRadius: 18,
        background: "#ffffff",
        border: "1px solid #dbe7f5",
        boxShadow: "0 24px 60px rgba(15,23,42,0.14)",
        padding: 8,
      }}
    >
      {OUR_MIND_TYPE_ORDER.map((type) => {
        const meta = OUR_MIND_NODE_META[type];
        return (
          <button
            key={type}
            onClick={() => onCreate(type)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 12,
              border: "none",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 999, background: meta.color, flexShrink: 0 }} />
            <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: TEXT }}>{meta.label}</span>
          </button>
        );
      })}

      <button
        onClick={onClose}
        style={{
          width: "100%",
          marginTop: 6,
          padding: "10px 12px",
          borderRadius: 12,
          border: "none",
          background: "#f8fafc",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 700,
          color: TEXT_MUTED,
        }}
      >
        Close
      </button>
    </motion.div>
  );
}

function ContextMenu({ position, onDelete, onChangeType, onClose, onAddCorrection }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.96 }}
      transition={{ duration: 0.12 }}
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        zIndex: 1000,
        width: 200,
        borderRadius: 16,
        background: "#ffffff",
        border: "1px solid #dbe7f5",
        boxShadow: "0 24px 60px rgba(15,23,42,0.16)",
        padding: 8,
      }}
    >
      <div style={{ padding: "6px 8px 8px", fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT_MUTED }}>
        Node actions
      </div>
      <button onClick={onAddCorrection} style={contextButtonStyle}>Add correction</button>
      {OUR_MIND_TYPE_ORDER.map((type) => (
        <button key={type} onClick={() => onChangeType(type)} style={contextButtonStyle}>
          Change to {OUR_MIND_NODE_META[type].label}
        </button>
      ))}
      <button onClick={onDelete} style={{ ...contextButtonStyle, color: "#b91c1c" }}>Delete</button>
      <button onClick={onClose} style={{ ...contextButtonStyle, color: TEXT_MUTED }}>Close</button>
    </motion.div>
  );
}

const contextButtonStyle = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 10,
  border: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: BODY_FONT,
  fontSize: 12.5,
  color: TEXT,
};

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      borderRadius: 18,
      background: "#ffffff",
      border: "1px solid #dbe7f5",
      padding: "12px 14px",
      boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    }}>
      <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: accent || TEXT }}>
        {value}
      </div>
    </div>
  );
}

function InspectorContent({
  node,
  onUpdate,
  onDelete,
  onAddCorrection,
  onClose,
}) {
  if (!node) {
    return (
      <div style={{ padding: "1.25rem" }}>
        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 8 }}>
          Selection
        </div>
        <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
          Nothing selected
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: TEXT_MUTED }}>
          Pick a card on the board to refine how Mentorable sees it.
        </div>
      </div>
    );
  }

  const tags = Array.isArray(node.data.tags) ? node.data.tags.join(", ") : "";
  const isTask = node.type === "task";
  const isOpportunity = node.type === "opportunity";
  const isAiOwned = node.data.source !== "user";
  const zone = String(node.data.zone || OUR_MIND_NODE_META[node.type]?.zone || "memory");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "1.25rem 1.25rem 0.9rem", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 6 }}>
            {OUR_MIND_NODE_META[node.type]?.label || "Node"}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: TEXT }}>
            {node.data.label}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#f1f5f9", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.4" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <div style={{ padding: "1.1rem 1.25rem 1.4rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={inspectorFieldLabel}>Title</label>
        <input
          value={String(node.data.label || "")}
          onChange={(event) => onUpdate({ label: event.target.value })}
          style={inspectorInputStyle}
        />

        <label style={inspectorFieldLabel}>Body</label>
        <textarea
          value={String(node.data.body || "")}
          onChange={(event) => onUpdate({ body: event.target.value })}
          rows={5}
          style={{ ...inspectorInputStyle, minHeight: 120, resize: "vertical" }}
        />

        <label style={inspectorFieldLabel}>Type</label>
        <select
          value={node.type}
          onChange={(event) => onUpdate({ __type: event.target.value })}
          style={inspectorInputStyle}
        >
          {OUR_MIND_TYPE_ORDER.map((type) => (
            <option key={type} value={type}>{OUR_MIND_NODE_META[type].label}</option>
          ))}
        </select>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={inspectorFieldLabel}>Zone</label>
            <select
              value={zone}
              onChange={(event) => onUpdate({ zone: event.target.value })}
              style={inspectorInputStyle}
            >
              {OUR_MIND_ZONE_ORDER.map((value) => (
                <option key={value} value={value}>{OUR_MIND_ZONE_META[value].label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={inspectorFieldLabel}>Source</label>
            <select
              value={String(node.data.source || "user")}
              onChange={(event) => onUpdate({ source: event.target.value })}
              style={inspectorInputStyle}
            >
              {["user", "ai", "onboarding", "chat", "research"].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={inspectorFieldLabel}>Confidence</label>
            <select
              value={String(node.data.confidence || "medium")}
              onChange={(event) => onUpdate({ confidence: event.target.value })}
              style={inspectorInputStyle}
            >
              {["low", "medium", "high"].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={inspectorFieldLabel}>Status</label>
            <select
              value={String(node.data.status || "proposed")}
              onChange={(event) => onUpdate({ status: event.target.value })}
              style={inspectorInputStyle}
            >
              {["active", "proposed", "done", "paused"].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={inspectorFieldLabel}>Priority</label>
            <select
              value={String(node.data.priority || "medium")}
              onChange={(event) => onUpdate({ priority: event.target.value })}
              style={inspectorInputStyle}
            >
              {["high", "medium", "low"].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
        </div>

        {isTask && (
          <>
            <label style={inspectorFieldLabel}>Due date</label>
            <input
              type="date"
              value={String(node.data.dueDate || "").slice(0, 10)}
              onChange={(event) => onUpdate({ dueDate: event.target.value ? new Date(`${event.target.value}T12:00:00`).toISOString() : null })}
              style={inspectorInputStyle}
            />
            <button onClick={() => onUpdate({ done: !node.data.done, status: node.data.done ? "active" : "done" })} style={secondaryActionStyle}>
              {node.data.done ? "Mark mission active" : "Mark mission done"}
            </button>
          </>
        )}

        {isOpportunity && (
          <>
            <label style={inspectorFieldLabel}>Deadline</label>
            <input
              type="date"
              value={String(node.data.dueDate || "").slice(0, 10)}
              onChange={(event) => onUpdate({ dueDate: event.target.value ? new Date(`${event.target.value}T12:00:00`).toISOString() : null })}
              style={inspectorInputStyle}
            />
            <label style={inspectorFieldLabel}>URL</label>
            <input
              value={String(node.data.url || "")}
              onChange={(event) => onUpdate({ url: event.target.value })}
              style={inspectorInputStyle}
            />
          </>
        )}

        <label style={inspectorFieldLabel}>Confirmed by student</label>
        <button onClick={() => onUpdate({ confirmed: !node.data.confirmed })} style={secondaryActionStyle}>
          {node.data.confirmed ? "Marked as confirmed" : "Mark as confirmed"}
        </button>

        <label style={inspectorFieldLabel}>Tags</label>
        <input
          value={tags}
          onChange={(event) => onUpdate({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
          style={inspectorInputStyle}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }}>
          {isAiOwned && <button onClick={onAddCorrection} style={primaryActionStyle}>Add correction</button>}
          <button onClick={onDelete} style={dangerActionStyle}>Delete node</button>
        </div>
      </div>
    </div>
  );
}

const inspectorFieldLabel = {
  fontFamily: FONT,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: TEXT_MUTED,
};

const inspectorInputStyle = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #dbe7f5",
  background: "#ffffff",
  padding: "0.78rem 0.85rem",
  fontFamily: BODY_FONT,
  fontSize: 13.5,
  color: TEXT,
  outline: "none",
  boxSizing: "border-box",
};

const primaryActionStyle = {
  width: "100%",
  padding: "0.82rem 0.95rem",
  borderRadius: 12,
  border: "none",
  background: "#1d4ed8",
  color: "#ffffff",
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryActionStyle = {
  width: "100%",
  padding: "0.8rem 0.95rem",
  borderRadius: 12,
  border: "1px solid #dbe7f5",
  background: "#f8fbff",
  color: TEXT,
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const dangerActionStyle = {
  width: "100%",
  padding: "0.82rem 0.95rem",
  borderRadius: 12,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#b91c1c",
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

function BoardShell({ userId }) {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingLabel, setLoadingLabel] = useState("Loading Our Mind");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [assistantNote, setAssistantNote] = useState("");
  const [refining, setRefining] = useState(false);
  const [booting, setBooting] = useState(false);
  const [bootStep, setBootStep] = useState(0);
  const isMobile = useIsMobile();

  const didHydrate = useRef(false);
  const saveTimer = useRef(null);
  const addMenuRef = useRef(null);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const summary = summarizeOurMindBoard({ nodes, edges });
  const weeklyMissions = summary.tasks.filter((node) => !node?.data?.done);
  const memoryFeed = summary.memories;
  const opportunityRadar = summary.opportunities;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target)) {
        setAddMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!booting) return undefined;
    let current = 0;
    const timer = window.setInterval(() => {
      current += 1;
      if (current < BOOT_STEPS.length) {
        setBootStep(current);
      } else {
        window.clearInterval(timer);
        window.setTimeout(() => setBooting(false), 500);
      }
    }, 850);
    return () => window.clearInterval(timer);
  }, [booting]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const loadBoard = async () => {
      setLoading(true);
      setLoadingLabel("Loading Our Mind");
      try {
        const { data } = await supabase
          .from("student_canvas")
          .select("nodes, edges")
          .eq("user_id", userId)
          .maybeSingle();

        const startedEmpty = !boardHasContent({ nodes: data?.nodes || [] });
        let nextNodes = data?.nodes || [];
        let nextEdges = data?.edges || [];

        if (!boardHasContent({ nodes: nextNodes })) {
          setLoadingLabel("Building Your First Board");
          const { data: initData, error } = await supabase.functions.invoke("initialize-our-mind", {
            body: { force: false },
          });
          if (error) throw error;
          nextNodes = initData?.nodes || [];
          nextEdges = initData?.edges || [];
        }

        if (cancelled) return;
        startTransition(() => {
          setNodes(nextNodes);
          setEdges(nextEdges);
          setSelectedNodeId(nextNodes[0]?.id || null);
        });
        try {
          if (sessionStorage.getItem("ourmind-boot-pending") === "1" || startedEmpty) {
            sessionStorage.removeItem("ourmind-boot-pending");
            setBootStep(0);
            setBooting(true);
          }
        } catch {}
        didHydrate.current = true;
        requestAnimationFrame(() => fitView({ padding: 0.18, duration: 400 }));
      } catch (error) {
        console.error("[OurMind] load error:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadBoard();
    return () => {
      cancelled = true;
    };
  }, [fitView, setEdges, setNodes, userId]);

  useEffect(() => {
    if (!didHydrate.current || loading) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await supabase.from("student_canvas").upsert(
          {
            user_id: userId,
            nodes,
            edges,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      } finally {
        setSaving(false);
      }
    }, 900);

    return () => clearTimeout(saveTimer.current);
  }, [edges, loading, nodes, userId]);

  const updateNode = (nodeId, patch) => {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) return node;
        if (patch.__type) {
          const nextType = patch.__type;
          const nextMeta = OUR_MIND_NODE_META[nextType] || OUR_MIND_NODE_META.note;
          const { __type, ...rest } = patch;
          return {
            ...node,
            type: nextType,
            data: {
              ...node.data,
              ...rest,
              zone: rest.zone ?? node.data.zone ?? nextMeta.zone,
              label: rest.label ?? node.data.label ?? nextMeta.label,
            },
          };
        }
        return { ...node, data: { ...node.data, ...patch } };
      })
    );
  };

  const addNode = (type) => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const node = makeNode(type, {
      x: center.x + (Math.random() - 0.5) * 140,
      y: center.y + (Math.random() - 0.5) * 120,
    });
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setInspectorOpen(true);
    setAddMenuOpen(false);
  };

  const deleteNode = (nodeId) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setContextMenu(null);
  };

  const addCorrectionForNode = (node) => {
    if (!node) return;
    const correction = makeNode("correction", {
      x: node.position.x + 320,
      y: node.position.y + 60,
    }, {
      label: `Adjust: ${node.data.label}`,
      body: `Mentorable should revise how it reads "${node.data.label}".`,
      zone: getNodeZone(node),
      source: "user",
      confidence: "high",
      status: "active",
      tags: ["feedback"],
    });

    const connection = {
      id: `edge-${node.id}-${correction.id}`,
      source: node.id,
      target: correction.id,
      label: "refine",
      animated: true,
      style: { stroke: "#dc2626", strokeWidth: 1.6 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#dc2626", width: 16, height: 16 },
    };

    setNodes((current) => [...current, correction]);
    setEdges((current) => [...current, connection]);
    setSelectedNodeId(correction.id);
    setContextMenu(null);
    if (isMobile) setInspectorOpen(true);
  };

  const refineBoard = async () => {
    setRefining(true);
    try {
      const { data, error } = await supabase.functions.invoke("refine-our-mind", {
        body: { eventType: "refresh", prompt: "Refresh Our Mind with the strongest additions Mentorable should make right now." },
      });
      if (error) throw error;
      startTransition(() => {
        setNodes(data?.nodes || []);
        setEdges(data?.edges || []);
      });
      setAssistantNote(data?.assistantNote || "Mentorable refreshed the board.");
      requestAnimationFrame(() => fitView({ padding: 0.18, duration: 400 }));
    } catch (error) {
      console.error("[OurMind] refine error:", error);
      setAssistantNote("Mentorable couldn't refresh the board just now.");
    } finally {
      setRefining(false);
    }
  };

  const onConnect = (params) => {
    setEdges((current) => addEdge({
      ...params,
      animated: true,
      style: { stroke: EDGE_COLOR, strokeWidth: 1.7 },
      markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 },
    }, current));
  };

  const inspector = (
    <InspectorContent
      node={selectedNode}
      onUpdate={(patch) => updateNode(selectedNode.id, patch)}
      onDelete={() => deleteNode(selectedNode.id)}
      onAddCorrection={() => addCorrectionForNode(selectedNode)}
      onClose={() => setInspectorOpen(false)}
    />
  );

  return (
    <div style={{ minHeight: "100%" }}>
      <div
        style={{
          position: "relative",
          minHeight: isMobile ? "calc(100vh - 92px)" : "calc(100vh - 52px)",
          borderRadius: isMobile ? 24 : 30,
          overflow: "hidden",
          background: SURFACE,
          border: "1px solid #dbe7f5",
          boxShadow: "0 24px 60px rgba(15,23,42,0.08)",
        }}
      >
        {loading && (
          <div style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            background: "rgba(255,255,255,0.84)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 10,
          }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", border: "3px solid #bfdbfe", borderTopColor: "#1d4ed8", animation: "ourmind-spin 0.9s linear infinite" }} />
            <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: TEXT }}>{loadingLabel}</div>
          </div>
        )}

        <div style={{ position: "absolute", inset: 16, zIndex: 1, pointerEvents: "none" }}>
          {OUR_MIND_ZONE_ORDER.map((zone) => {
            const meta = OUR_MIND_ZONE_META[zone];
            const layout = ZONE_LAYOUT[zone];
            return (
              <div
                key={zone}
                style={{
                  position: "absolute",
                  ...layout,
                  borderRadius: zone === "memory" ? 28 : 24,
                  border: `1px dashed ${meta.border}`,
                  background: meta.tint,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
                  overflow: "hidden",
                }}
              >
                <div style={{ position: "absolute", top: 14, left: 16 }}>
                  <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: meta.color, marginBottom: 4 }}>
                    {meta.shortLabel}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: TEXT }}>
                    {meta.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges.map((edge) => ({
            ...edge,
            animated: edge.animated ?? true,
            style: edge.style || { stroke: EDGE_COLOR, strokeWidth: 1.7 },
            markerEnd: edge.markerEnd || { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 },
          }))}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setContextMenu(null);
            setInspectorOpen(false);
          }}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setContextMenu(null);
            setInspectorOpen(true);
          }}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            setSelectedNodeId(node.id);
            setInspectorOpen(true);
            setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
          }}
          nodeTypes={NODE_TYPES}
          fitView
          minZoom={0.35}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={["Backspace", "Delete"]}
          style={{ background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)" }}
        >
          <Background color="rgba(148,163,184,0.18)" gap={24} size={1} />
          <MiniMap
            position="bottom-right"
            style={{ background: "#ffffff", border: "1px solid #dbe7f5", borderRadius: 14 }}
            nodeColor={(node) => OUR_MIND_NODE_META[node.type]?.color || "#94a3b8"}
            maskColor="rgba(241,245,249,0.8)"
          />
        </ReactFlow>

        <div
          style={{
            position: "absolute",
            top: isMobile ? 12 : 18,
            left: isMobile ? 12 : 18,
            right: isMobile ? 12 : "auto",
            zIndex: 12,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            pointerEvents: "none",
            maxWidth: isMobile ? "calc(100% - 24px)" : 560,
          }}
        >
          <div style={floatingPanelStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2563eb", marginBottom: 6 }}>
                  Brain online
                </div>
                <div style={{ fontFamily: FONT, fontSize: isMobile ? 28 : 34, fontWeight: 700, color: TEXT, lineHeight: 1 }}>
                  Our Mind
                </div>
                <div style={{ fontSize: 14, color: TEXT_MUTED, marginTop: 8, maxWidth: 520, lineHeight: 1.65 }}>
                  A living brain for your next steps, opportunities, identity, and the way Mentorable should show up for you.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", pointerEvents: "auto" }}>
                <div style={{ position: "relative" }} ref={addMenuRef}>
                  <button onClick={() => setAddMenuOpen((open) => !open)} style={headerButtonStyle}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add
                  </button>
                  <AnimatePresence>{addMenuOpen && <AddMenu onCreate={addNode} onClose={() => setAddMenuOpen(false)} />}</AnimatePresence>
                </div>

                <button onClick={refineBoard} style={headerButtonStyle}>
                  {refining ? "Growing..." : "Grow the brain"}
                </button>
                <button onClick={() => fitView({ padding: 0.18, duration: 400 })} style={headerButtonStyle}>Fit view</button>
                <button onClick={() => setEdges([])} style={headerButtonStyle}>Clear edges</button>
              </div>
            </div>
          </div>

          {assistantNote && (
            <div style={{ ...floatingPanelStyle, maxWidth: 420, color: "#1e3a8a", background: "rgba(239,246,255,0.92)", border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{assistantNote}</div>
            </div>
          )}
        </div>

        {!isMobile && (
          <div
            style={{
              position: "absolute",
              top: 18,
              right: inspectorOpen ? 350 : 18,
              zIndex: 12,
              width: 320,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              pointerEvents: "none",
              transition: "right 0.22s ease",
            }}
          >
            <div style={floatingPanelStyle}>
              <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 8 }}>
                Current read
              </div>
              <div style={{ fontFamily: FONT, fontSize: 19, fontWeight: 700, color: TEXT, lineHeight: 1.3, marginBottom: 8 }}>
                {summary.aiView[0] || "Board is taking shape"}
              </div>
              <div style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 1.7 }}>
                {summary.signals.length ? summary.signals.join(", ") : "Identity signals will sharpen as Mentorable gets to know you better."}
              </div>
            </div>

            <div style={floatingPanelStyle}>
              <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 8 }}>
                This week
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(weeklyMissions.length ? weeklyMissions : [{ id: "none", data: { label: "No weekly missions yet" } }]).map((mission) => (
                  <div key={mission.id} style={{ borderRadius: 14, background: "#faf5ff", border: "1px solid #ddd6fe", padding: "0.75rem 0.85rem", fontSize: 13, color: TEXT, lineHeight: 1.55 }}>
                    <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13 }}>{mission.data.label}</div>
                    {mission.data.dueDate && (
                      <div style={{ color: "#7c3aed", fontSize: 12, marginTop: 4 }}>{formatDueLabel(mission.data.dueDate)}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={floatingPanelStyle}>
              <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 8 }}>
                Brain growth
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(memoryFeed.length ? memoryFeed : [{ id: "none", data: { label: "New discoveries from chat and research will land here." } }]).map((memory) => (
                  <div key={memory.id} style={{ borderRadius: 14, background: "#fffaf0", border: "1px solid #fcd34d", padding: "0.75rem 0.85rem", fontSize: 13, color: TEXT, lineHeight: 1.55 }}>
                    {memory.data.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            position: "absolute",
            left: isMobile ? 12 : 18,
            right: isMobile ? 12 : "auto",
            bottom: isMobile ? 12 : 18,
            zIndex: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 12,
            pointerEvents: "none",
            maxWidth: isMobile ? "calc(100% - 24px)" : 780,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(128px, 1fr))", gap: 10, width: "100%" }}>
            <StatCard label="Missions" value={summary.openTaskCount} accent="#7c3aed" />
            <StatCard label="Deadlines" value={summary.urgentCount} accent="#059669" />
            <StatCard label="Memories" value={summary.counts.memory || 0} accent="#d97706" />
            <StatCard label="Agent Cues" value={summary.counts.behavior || 0} accent="#6d28d9" />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", pointerEvents: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.7rem 0.85rem", borderRadius: 14, background: "rgba(255,255,255,0.94)", border: "1px solid #dbe7f5", boxShadow: "0 10px 24px rgba(15,23,42,0.08)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: saving ? "#f59e0b" : "#10b981" }} />
              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: TEXT }}>
                {saving ? "Saving" : "Synced"}
              </span>
            </div>

            {!isMobile && opportunityRadar[0] && (
              <div style={{ ...floatingPanelStyle, padding: "0.78rem 0.9rem", maxWidth: 320 }}>
                <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#059669", marginBottom: 6 }}>
                  Hot opportunity
                </div>
                <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
                  {opportunityRadar[0].data.label}
                </div>
                <div style={{ fontSize: 12.5, color: TEXT_MUTED }}>
                  {formatDueLabel(opportunityRadar[0].data.dueDate) || "Worth tracking now"}
                </div>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {booting && !loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 24,
                background: "radial-gradient(circle at center, rgba(99,102,241,0.1) 0%, rgba(255,255,255,0.82) 38%, rgba(255,255,255,0.92) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <div style={{ width: "min(460px, 90%)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <motion.div
                  animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.95, 0.55] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                  style={{ width: 96, height: 96, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.22) 0%, rgba(59,130,246,0.06) 58%, transparent 70%)", border: "1px solid rgba(99,102,241,0.16)" }}
                />
                <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6366f1" }}>
                  Brain boot sequence
                </div>
                <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 700, color: TEXT, lineHeight: 1.08 }}>
                  {BOOT_STEPS[bootStep]}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  {BOOT_STEPS.map((step, index) => (
                    <div key={step} style={{ width: index === bootStep ? 28 : 8, height: 8, borderRadius: 99, background: index <= bootStep ? "#6366f1" : "#dbe7f5", transition: "all 0.2s ease" }} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {contextMenu && selectedNode && (
            <ContextMenu
              position={contextMenu}
              onDelete={() => deleteNode(contextMenu.nodeId)}
              onChangeType={(type) => {
                updateNode(contextMenu.nodeId, { __type: type });
                setContextMenu(null);
              }}
              onAddCorrection={() => addCorrectionForNode(selectedNode)}
              onClose={() => setContextMenu(null)}
            />
          )}
        </AnimatePresence>

        {!isMobile && (
          <AnimatePresence>
            {inspectorOpen && (
              <motion.div
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                transition={{ duration: 0.18 }}
                style={{
                  position: "absolute",
                  top: 18,
                  right: 18,
                  bottom: 18,
                  width: 320,
                  zIndex: 18,
                  borderRadius: 24,
                  background: "rgba(255,255,255,0.96)",
                  border: "1px solid #dbe7f5",
                  boxShadow: "0 24px 60px rgba(15,23,42,0.14)",
                  overflow: "hidden",
                }}
              >
                {inspector}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {isMobile && (
        <Drawer open={inspectorOpen} onClose={() => setInspectorOpen(false)} title="Inspector" width={360}>
          {inspector}
        </Drawer>
      )}
    </div>
  );
}

const floatingPanelStyle = {
  borderRadius: 22,
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(219,231,245,0.96)",
  boxShadow: "0 18px 44px rgba(15,23,42,0.08)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  padding: "1rem 1.05rem",
  pointerEvents: "auto",
};

const headerButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "0.78rem 0.95rem",
  borderRadius: 14,
  border: "1px solid #dbe7f5",
  background: "#ffffff",
  color: TEXT,
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
};

export default function CanvasPage() {
  const isMobile = useIsMobile();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
      else window.location.href = "/auth";
    });
  }, []);

  return (
    <div
      data-sidebar-offset
      style={{
        minHeight: "100vh",
        background: PAGE_BG,
        paddingLeft: isMobile ? 0 : SIDEBAR_WIDTH,
        paddingBottom: isMobile ? 84 : 24,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes ourmind-spin { to { transform: rotate(360deg); } }
        .react-flow__attribution { display: none; }
      `}</style>

      <div style={{ width: "100%", margin: "0 auto", padding: isMobile ? "0.8rem 0.65rem 0" : "1rem 1rem 0" }}>
        <ReactFlowProvider>
          <BoardShell userId={userId} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
