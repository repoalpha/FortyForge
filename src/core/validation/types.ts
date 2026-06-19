export type ValidationSeverity = "info" | "warning" | "error";

export type ValidationScope =
  | "project"
  | "service"
  | "page"
  | "subpage"
  | "row"
  | "cell"
  | "export";

export interface ValidationLocation {
  serviceId?: string;
  pageId?: string;
  subpageId?: string;
  rowIndex?: number;
  column?: number;
}

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  scope: ValidationScope;
  message: string;
  recommendation: string;
  location?: ValidationLocation;
  affectedExportProfiles: string[];
}
