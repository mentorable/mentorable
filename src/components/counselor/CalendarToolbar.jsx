import { Button, ChoiceChips } from "../ui/kit.jsx";
import { FOCUS_CLASS, SANS, TEXT, TEXT_MUTED } from "../ui/tokens.js";
import { Chevron, IconButton } from "./ScheduleParts.jsx";

// The bar over the calendar: Today, Previous and Next, what is showing (the
// title the grid below is labelled by) with how much is booked in it, and the
// switch between week and month. The page announces a new range as it
// changes; the title takes focus when the calendar moves under the reader.

const VIEWS = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

/**
 * view: "week" | "month". title: rangeTitle(). summary: rangeSummary().
 * titleId / titleRef: the heading, for aria-labelledby and for focus.
 */
export default function CalendarToolbar({ view, onView, title, summary, titleId, titleRef, onPrev, onNext, onToday, isMobile }) {
  const unit = view === "month" ? "month" : "week";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
      gap: "12px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 14px", minWidth: 0, flex: "1 1 300px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Button kind="secondary" onClick={onToday}>Today</Button>
          <IconButton label={`Previous ${unit}`} onClick={onPrev}><Chevron dir="left" /></IconButton>
          <IconButton label={`Next ${unit}`} onClick={onNext}><Chevron dir="right" /></IconButton>
        </div>
        <div style={{ minWidth: 0, flex: "1 1 200px" }}>
          <h3 id={titleId} ref={titleRef} tabIndex={-1} className={FOCUS_CLASS}
            style={{ margin: 0, fontFamily: SANS, fontSize: "1.25rem", fontWeight: 800, color: TEXT, lineHeight: 1.25,
              letterSpacing: "-0.01em", overflowWrap: "anywhere", borderRadius: 6 }}>
            {title}
          </h3>
          <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.4 }}>
            {summary}
          </p>
        </div>
      </div>
      <div style={isMobile ? { flex: "1 1 100%" } : undefined}>
        <ChoiceChips label="Calendar view" hideLabel options={VIEWS} value={view} onChange={onView} isMobile={isMobile} />
      </div>
    </div>
  );
}
