export type PresentationLevel = "1" | "1.5" | "2.5" | "3.5";

export type CellKind = "empty" | "character" | "control" | "mosaic" | "drcs";

export type ControlCodeCategory =
  | "colour"
  | "graphics"
  | "background"
  | "size"
  | "flash"
  | "conceal"
  | "box"
  | "hold"
  | "release"
  | "charset";

export type GlyphMode = "12x10x1" | "12x10x2" | "12x10x4" | "6x5x4";

export interface SourceReference {
  kind: "user" | "import" | "ai" | "external";
  label: string;
  uri: string;
  capturedAt: string;
}

export interface ProjectMetadata {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  tags: string[];
  sourceReferences: SourceReference[];
}

export interface Project {
  schemaVersion: "1.0.0";
  appVersion: string;
  metadata: ProjectMetadata;
  services: Service[];
  templates: Template[];
  glyphSets: GlyphSet[];
  contentSources: ContentSource[];
  contentSnapshots: ContentSnapshot[];
  exportProfiles: ExportProfile[];
  transmissionProfiles: TransmissionProfile[];
}

export interface Service {
  id: string;
  name: string;
  defaultPresentationLevel: PresentationLevel;
  defaultLanguage: TeletextLanguage;
  pages: Page[];
  navigation: ServiceNavigation;
  settings: ServiceSettings;
}

export interface TeletextLanguage {
  id: string;
  label: string;
  primaryG0: string;
  secondaryG0?: string;
}

export interface ServiceNavigation {
  fastextLinks: PageLink[];
  topEnabled: boolean;
}

export interface ServiceSettings {
  defaultExportProfileId: string;
  rowCount: 25;
  columnCount: 40;
}

export interface Page {
  id: string;
  magazine: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  pageNumber: string;
  title: string;
  subpages: Subpage[];
  contentBindings: ContentBinding[];
  metadata: PageMetadata;
  links: PageLink[];
}

export interface PageMetadata {
  description: string;
  tags: string[];
  publicationState: "draft" | "ready" | "published";
  templateId?: string;
  targetPresentationLevel: PresentationLevel;
  header: PageHeaderSettings;
}

export interface PageHeaderSettings {
  clockMode: "original" | "local";
}

export interface PageLink {
  label: string;
  pageNumber: string;
  subcode?: string;
}

export interface Subpage {
  id: string;
  subcode: string;
  rows: TeletextRow[];
  enhancementPackets: EnhancementPacket[];
  glyphReferences: GlyphReference[];
  carousel: CarouselSettings;
}

export interface CarouselSettings {
  enabled: boolean;
  delaySeconds: number;
  priority: "normal" | "high";
}

export interface TeletextRow {
  index: number;
  cells: Cell[];
  locked: boolean;
  label: string;
}

export interface Cell {
  column: number;
  kind: CellKind;
  byte: number;
  character?: TeletextCharacter;
  controlCode?: ControlCode;
  mosaic?: MosaicCell;
  drcs?: DrcsCell;
  annotations: CellAnnotation[];
}

export interface TeletextCharacter {
  value: string;
  charset: "G0" | "G2" | "G3" | "DRCS";
}

export interface ControlCode {
  id: string;
  byte: number;
  mnemonic: string;
  category: ControlCodeCategory;
  label: string;
  supportedLevels: PresentationLevel[];
  description: string;
}

export interface MosaicCell {
  separated: boolean;
  sixelMask: number;
  foreground: TeletextColourRef;
  background: TeletextColourRef;
}

export interface TeletextColourRef {
  palette: "level1" | "clut";
  index: number;
}

export interface DrcsCell {
  glyphSetId: string;
  glyphId: string;
}

export interface CellAnnotation {
  id: string;
  label: string;
  message: string;
}

export interface EnhancementPacket {
  id: string;
  packetType: "X/26" | "X/27" | "X/28" | "M/29" | "DRCS";
  designationCode: number;
  presentationLevels: PresentationLevel[];
  triplets: EnhancementTriplet[];
  source: "authored" | "imported" | "generated";
}

export interface EnhancementTriplet {
  address: number;
  mode: number;
  data: number;
  label: string;
}

export interface GlyphReference {
  glyphSetId: string;
  glyphId: string;
}

export interface GlyphSet {
  id: string;
  name: string;
  scope: "page" | "service" | "global";
  glyphs: Glyph[];
  source: "authored" | "imported" | "ai-generated";
}

export interface Glyph {
  id: string;
  codePoint: number;
  mode: GlyphMode;
  width: 12 | 6;
  height: 10 | 5;
  bitsPerPixel: 1 | 2 | 4;
  pixels: number[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  targetPresentationLevel: PresentationLevel;
  rows: TeletextRow[];
  regions: TemplateRegion[];
}

export type TemplateCategory =
  | "blank"
  | "index"
  | "article"
  | "weather"
  | "status"
  | "ticker"
  | "art"
  | "carousel";

export interface TemplateRegion {
  id: string;
  label: string;
  bounds: RegionBounds;
  kind: "static" | "editable" | "generated" | "dynamic" | "ticker";
  acceptedContentKinds: ContentSourceKind[];
  lockedControlCodes: boolean;
  overflowPolicy: OverflowPolicy;
  fallbackText: string;
}

export interface RegionBounds {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export type ContentSourceKind =
  | "rss"
  | "atom"
  | "weather"
  | "json"
  | "csv"
  | "text"
  | "manual"
  | "web-extract";

export interface ContentSource {
  id: string;
  kind: ContentSourceKind;
  label: string;
  uri: string;
  enabled: boolean;
  refreshPolicy: RefreshPolicy;
  cachePolicy: CachePolicy;
  fieldHints: Record<string, string>;
}

export interface ContentBinding {
  id: string;
  sourceId: string;
  templateRegionId: string;
  targetPageId: string;
  targetSubpageId?: string;
  transform: ContentTransform;
  ticker?: TickerSettings;
}

export interface ContentTransform {
  maxItems: number;
  fields: ContentFieldMapping[];
  sort: "source" | "newest-first" | "oldest-first" | "priority";
  textCase: "preserve" | "upper" | "teletext-title";
  controlStyle: "plain" | "headline-colour" | "region-default";
  overflowPolicy: OverflowPolicy;
}

export interface ContentFieldMapping {
  sourceField: string;
  label?: string;
  maxChars: number;
  includeWhenEmpty: boolean;
}

export interface RefreshPolicy {
  mode: "manual" | "on-export" | "interval" | "runtime";
  intervalSeconds?: number;
  staleAfterSeconds?: number;
  retryCount: number;
}

export interface CachePolicy {
  keepSnapshots: number;
  allowStaleOnError: boolean;
}

export type OverflowPolicy =
  | "clip"
  | "wrap"
  | "ellipsis"
  | "add-subpage"
  | "reject-update";

export interface TickerSettings {
  row: number;
  startColumn: number;
  endColumn: number;
  mode: "snapshot" | "carousel-frames" | "runtime-scroll";
  speedCellsPerStep: number;
  separator: string;
}

export interface ContentSnapshot {
  id: string;
  sourceId: string;
  capturedAt: string;
  status: "ok" | "stale" | "error";
  records: NormalizedContentRecord[];
  errorMessage?: string;
}

export interface NormalizedContentRecord {
  id: string;
  title: string;
  summary?: string;
  body?: string;
  url?: string;
  publishedAt?: string;
  updatedAt?: string;
  priority?: number;
  fields: Record<string, string | number | boolean | null>;
}

export interface ExportProfile {
  id: string;
  name: string;
  targetFormats: ExportTargetFormat[];
  presentationLevel: PresentationLevel;
}

export type ExportTargetFormat = "pttx" | "tti" | "t42" | "raw" | "png" | "gif";

export interface TransmissionProfile {
  id: string;
  name: string;
  kind: "broadcast" | "packet-stream" | "low-bandwidth-delta";
  maxPayloadBytes: number;
  supportsDelta: boolean;
  supportsCompression: boolean;
  integrity: "crc32" | "sha256";
  scheduling: "manual" | "carousel" | "priority";
}
