import type { PacketPreview, ValidationIssue } from "../../core";

interface ValidationPanelProps {
  issues: ValidationIssue[];
  packetPreview: PacketPreview;
}

export function ValidationPanel({ issues, packetPreview }: ValidationPanelProps) {
  const errorCount = issues.filter((issue) => issue.severity === "error").length;

  return (
    <footer className="status-panel">
      <span>40 bytes per row</span>
      <span>{issues.length} validation issues</span>
      <span>{errorCount} export-blocking errors</span>
      <span>{packetPreview.packets.length} packet preview records</span>
    </footer>
  );
}
