import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, ClassBadge, EmptyState, PriorityBadge, StatusBadge } from "../components/ui";

describe("UI badges and states", () => {
  it("renders a class badge label", () => {
    render(<ClassBadge name="pothole" />);
    expect(screen.getByText("Pothole")).toBeInTheDocument();
  });

  it("renders priority categories", () => {
    const { rerender } = render(<PriorityBadge category="high" />);
    expect(screen.getByText("High")).toBeInTheDocument();
    rerender(<PriorityBadge category="low" />);
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("renders unscored priority when no category exists", () => {
    render(<PriorityBadge category={null} />);
    expect(screen.getByText("Unscored")).toBeInTheDocument();
  });

  it("renders a readable maintenance status label", () => {
    render(<StatusBadge status="in_progress" label="In progress" />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("renders empty state copy", () => {
    render(<EmptyState title="No detections" description="Run the pipeline to populate results." />);
    expect(screen.getByText("No detections")).toBeInTheDocument();
    expect(screen.getByText("Run the pipeline to populate results.")).toBeInTheDocument();
  });

  it("renders badge children", () => {
    render(<Badge tone="success">Ready</Badge>);
    expect(screen.getByText("Ready")).toHaveClass("bg-emerald-50");
  });
});
