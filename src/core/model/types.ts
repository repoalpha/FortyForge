export type PresentationLevel = "1" | "1.5" | "2.5" | "3.5";

export type TeletextFontProfileId =
  | "ets-1990s"
  | "saa5050-classic"
  | "bedstead-extended"
  | "tdatext-later";

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
  schemaVersion: "2.0.0";
  appVersion: string;
  metadata: ProjectMetadata;
  services: Service[];
  templates: Template[];
  mosaicAlphabets: MosaicAlphabet[];
  artworkBlocks: ArtworkBlock[];
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
  schedule: ServiceSchedule;
}

export interface ServiceSchedule {
  enabled: boolean;
  defaultDwellSeconds: number;
  entries: ServiceScheduleEntry[];
  emergencyPageId?: string;
}

export interface ServiceScheduleEntry {
  pageId: string;
  subpageId?: string;
  enabled: boolean;
  dwellSeconds: number;
  repeatWeight: number;
  priority: "normal" | "high" | "emergency";
  validFrom?: string;
  validUntil?: string;
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
  receiverFontProfileId: TeletextFontProfileId;
  header: PageHeaderSettings;
}

export interface PageHeaderSettings {
  clockMode: "original" | "local" | "none";
  showLocalDate: boolean;
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
  background?: TeletextColourRef;
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

export type MosaicGlyphSource = "captured" | "generated" | "edited";

export interface MosaicGlyphCell {
  sixelMask: number;
  separated: boolean;
  foreground: TeletextColourRef;
  background: TeletextColourRef;
}

export interface MosaicGlyph {
  character: string;
  width: number;
  height: number;
  cells: MosaicGlyphCell[];
  source: MosaicGlyphSource;
  note?: string;
}

export interface MosaicAlphabet {
  id: string;
  name: string;
  description: string;
  sourceReference?: SourceReference;
  cellWidth: number;
  cellHeight: number;
  spacingColumns: number;
  glyphs: Record<string, MosaicGlyph>;
  pixelGlyphs?: Record<string, string[]>;
  pixelSpacingColumns?: number;
}

export type ArtworkBlockCategory = "masthead" | "logo" | "divider" | "letter" | "panel" | "other";

export interface CellBlock {
  width: number;
  height: number;
  cells: Cell[][];
  source: {
    rowIndex: number;
    column: number;
  };
}

export interface ArtworkBlock {
  id: string;
  name: string;
  description?: string;
  category: ArtworkBlockCategory;
  assignedCharacter?: string;
  width: number;
  height: number;
  cells: Cell[][];
  source?: {
    pageNumber?: string;
    templateId?: string;
    rowIndex: number;
    column: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CellRectangle {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  targetPresentationLevel: PresentationLevel;
  rows: TeletextRow[];
  regions: TemplateRegion[];
  templateVersion: string;
  requiredPixelcastVersion: string;
  blocks: TemplateBlock[];
  fixtures: TemplateFixture[];
  styleKit?: StyleKit;
}

export type TemplateBlockKind =
  | "masthead"
  | "header"
  | "navigation-footer"
  | "text"
  | "headline-list"
  | "story"
  | "key-value-table"
  | "schedule"
  | "weather"
  | "ticker"
  | "attribution"
  | "artwork"
  | "spacer";

export interface TemplateBlock {
  id: string;
  kind: TemplateBlockKind;
  regionId: string;
  label: string;
  settings: Record<string, string | number | boolean>;
}

export interface TemplateFixture {
  id: string;
  label: string;
  kind: "sample" | "long" | "missing" | "stale";
  records: NormalizedContentRecord[];
}

export interface StyleKit {
  id: string;
  name: string;
  permittedLevel1Colours: number[];
  mastheadAlphabetId?: string;
  dividerByte?: number;
  footerTemplate?: string;
}

export type TemplateCategory =
  | "blank"
  | "index"
  | "article"
  | "weather"
  | "finance"
  | "schedule"
  | "advert"
  | "presentation"
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
  blockKind: TemplateBlockKind;
  characterPolicy: "level1-replace" | "level1-reject";
  attributionRequired: boolean;
  writableColumns?: number[];
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
  provider: string;
  policy: SourcePolicy;
  credentialEnvironmentVariable?: string;
}

export interface SourcePolicy {
  licenceMode: "open" | "operator-licensed" | "internal";
  termsUrl: string;
  permittedUse: "non-commercial" | "commercial" | "internal";
  attributionRequired: boolean;
  attributionText: string;
  reviewedAt: string;
  expiresAt?: string;
  operatorApproved: boolean;
}

export interface ContentBinding {
  id: string;
  sourceId: string;
  templateRegionId: string;
  targetPageId: string;
  targetSubpageId?: string;
  transform: ContentTransform;
  ticker?: TickerSettings;
  policy: BindingPolicy;
}

export interface BindingPolicy {
  approval: "automatic" | "manual";
  staleAfterSeconds?: number;
  allowStale: boolean;
  onFailure: "keep-last-valid" | "use-fallback" | "reject-publication";
}

export interface ContentTransform {
  maxItems: number;
  fields: ContentFieldMapping[];
  sort: "source" | "newest-first" | "oldest-first" | "priority";
  textCase: "preserve" | "upper" | "teletext-title";
  controlStyle: "plain" | "headline-colour" | "region-default";
  /** Level 1 alpha colour byte. White (7) uses the row default and costs no cell. */
  textColour: number;
  overflowPolicy: OverflowPolicy;
  attributionGapRows?: number;
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
  attributionText?: string;
  sourceUri?: string;
  generatedPageHashes?: Record<string, string>;
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

export interface TemplateCompileDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  pageId: string;
  regionId?: string;
  sourceId?: string;
}

export interface CompiledPageSnapshot {
  pageId: string;
  pageNumber: string;
  subpageId: string;
  subcode: string;
  rows: TeletextRow[];
  enhancementPackets: EnhancementPacket[];
  sourceTimestamps: Record<string, string>;
  attributions: string[];
  diagnostics: TemplateCompileDiagnostic[];
}

export interface TemplatePackageManifest {
  format: "pixelcast-template";
  formatVersion: "1";
  templateId: string;
  templateVersion: string;
  requiredPixelcastVersion: string;
  createdAt: string;
  contentHash: string;
}

export interface ExportProfile {
  id: string;
  name: string;
  targetFormats: ExportTargetFormat[];
  presentationLevel: PresentationLevel;
}

export type ExportTargetFormat = "pixelcast" | "pttx" | "tti" | "t42" | "raw" | "png" | "gif";

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
