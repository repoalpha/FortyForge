import type { Cell, NormalizedContentRecord, Template, TemplateCategory, TemplateFixture, TemplateRegion, TeletextRow } from "../model/types";

const ROW_COUNT = 25;
const COLUMN_COUNT = 40;
const SPACE_BYTE = 0x20;

function emptyCell(column: number): Cell {
  return {
    column,
    kind: "empty",
    byte: SPACE_BYTE,
    annotations: []
  };
}

function characterCell(column: number, value: string): Cell {
  return {
    column,
    kind: "character",
    byte: value.charCodeAt(0),
    character: {
      value,
      charset: "G0"
    },
    annotations: []
  };
}

function createRow(index: number, text = ""): TeletextRow {
  const cells = Array.from({ length: COLUMN_COUNT }, (_, column) => {
    const value = text[column];
    return value && value !== " " ? characterCell(column, value) : emptyCell(column);
  });

  return {
    index,
    cells,
    locked: false,
    label: index === 0 ? "Header" : `Row ${index}`
  };
}

function createRows(lines: string[]): TeletextRow[] {
  return Array.from({ length: ROW_COUNT }, (_, rowIndex) =>
    createRow(rowIndex, lines[rowIndex] ?? "")
  );
}

function region(
  id: string,
  label: string,
  startRow: number,
  endRow: number,
  kind: TemplateRegion["kind"],
  acceptedContentKinds: TemplateRegion["acceptedContentKinds"],
  fallbackText: string,
  blockKind: TemplateRegion["blockKind"] = "text",
  attributionRequired = false
): TemplateRegion {
  return {
    id,
    label,
    bounds: {
      startRow,
      endRow,
      startColumn: 0,
      endColumn: 39
    },
    kind,
    acceptedContentKinds,
    lockedControlCodes: false,
    overflowPolicy: "wrap",
    fallbackText,
    blockKind,
    characterPolicy: "level1-replace",
    attributionRequired
  };
}

function template(
  id: string,
  name: string,
  description: string,
  category: TemplateCategory,
  lines: string[],
  regions: TemplateRegion[] = []
): Template {
  const sampleRecord: NormalizedContentRecord = {
    id: "sample-record",
    title: category === "weather" ? "Brisbane forecast" : category === "finance" ? "AUD exchange" : "Sample Pixelcast item",
    summary: "A concise sample that demonstrates the normal production layout.",
    body: "This fixture lets an editor review wrapping, spacing, attribution and page density before a source is connected.",
    fields: {
      currency: "USD",
      rate: "0.6543",
      move: "+0.0012",
      temperature_2m: "24 C",
      wind_speed_10m: "12 km/h",
      weather_code: "Fine"
    }
  };
  const fixtures: TemplateFixture[] = regions.length === 0 ? [] : [
    { id: `${id}-sample`, label: "Sample content", kind: "sample", records: [sampleRecord] },
    {
      id: `${id}-long`,
      label: "Worst-case long content",
      kind: "long",
      records: [{
        ...sampleRecord,
        id: "long-record",
        title: "An intentionally long headline used to expose tight columns and unsafe control-code placement",
        body: Array.from({ length: 60 }, (_, index) => `long-form sentence ${index + 1}`).join(" ")
      }]
    },
    { id: `${id}-missing`, label: "Missing data", kind: "missing", records: [] },
    { id: `${id}-stale`, label: "Stale last-known-good data", kind: "stale", records: [sampleRecord] }
  ];
  return {
    id,
    name,
    description,
    category,
    targetPresentationLevel: "1",
    rows: createRows(lines),
    regions,
    templateVersion: "1.0.0",
    requiredPixelcastVersion: "0.2.0",
    blocks: regions.map((item) => ({
      id: `block-${item.id}`,
      kind: item.blockKind,
      regionId: item.id,
      label: item.label,
      settings: {}
    })),
    fixtures,
    styleKit: {
      id: "pixelcast-level1-default",
      name: "Pixelcast Level 1",
      permittedLevel1Colours: [0, 1, 2, 3, 4, 5, 6, 7],
      dividerByte: 0x5f,
      footerTemplate: "P{page}  {subpage}/{total}  MORE"
    }
  };
}

export const BUILT_IN_TEMPLATES: Template[] = [
  template("blank-page", "Blank page", "A clean 40 by 25 teletext page.", "blank", []),
  template(
    "header-page",
    "Header page",
    "A clean page with only the generated X/0 header.",
    "blank",
    []
  ),
  template(
    "index-page",
    "Index page",
    "A page 100-style menu with headline and link rows.",
    "index",
    [
      "PIXELCAST INDEX",
      "PIXELCAST  PAGE 100",
      "",
      "101 NEWS",
      "102 NEWS",
      "400 BRISBANE WEATHER",
      "500 AUD EXCHANGE",
      "199 ABOUT THIS SERVICE"
    ],
    [
      region("menu-links", "Menu links", 3, 12, "editable", ["manual"], "Add page links")
    ]
  ),
  template(
    "article-page",
    "Article page",
    "Headline and article body layout for news or community updates.",
    "article",
    ["NEWS", "", ""],
    [
      region(
        "main-content",
        "Main content",
        2,
        22,
        "dynamic",
        ["rss", "atom", "json", "text", "manual"],
        "No current stories",
        "story",
        true
      )
    ]
  ),
  template(
    "weather-page",
    "Weather page",
    "Weather summary panel with room for forecast rows.",
    "weather",
    ["WEATHER", "", "NOW", "FORECAST"],
    [
      region(
        "weather-summary",
        "Weather summary",
        2,
        12,
        "dynamic",
        ["weather", "json", "manual"],
        "Weather unavailable",
        "weather",
        true
      )
    ]
  ),
  template(
    "headline-list-page",
    "Headline list",
    "Numbered headlines with space for page links and attribution.",
    "article",
    ["NEWS HEADLINES", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "SOURCE"],
    [region("headline-list", "Headlines", 2, 21, "dynamic", ["rss", "atom", "json", "manual"], "No current headlines", "headline-list", true)]
  ),
  template(
    "finance-page",
    "Finance and FOREX",
    "Dense financial table with update time, attribution, and disclaimer.",
    "finance",
    ["MARKETS AND EXCHANGE", "", "CURRENCY       RATE       MOVE", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "INFORMATIONAL ONLY"],
    [region("finance-table", "Finance table", 3, 21, "dynamic", ["json", "csv", "rss", "manual"], "Market data unavailable", "key-value-table", true)]
  ),
  template(
    "schedule-page",
    "Schedule and flight board",
    "Now-next, transport, or flight status rows.",
    "schedule",
    ["SCHEDULE", "", "TIME  SERVICE              STATUS"],
    [region("schedule-table", "Schedule table", 3, 22, "dynamic", ["json", "csv", "manual"], "Schedule unavailable", "schedule", true)]
  ),
  template(
    "advert-panel-page",
    "Sponsor or advert panel",
    "A reusable attribution, sponsor, or advertisement frame.",
    "advert",
    ["ADVERTISEMENT", ""],
    [region("advert-copy", "Advert copy", 3, 20, "editable", ["manual", "json"], "", "text")]
  ),
  template(
    "in-vision-page",
    "Timed in-vision page",
    "A presentation frame intended for scheduled full-screen display.",
    "presentation",
    ["PIXELCAST", "", "PRESENTATION"],
    [region("presentation-body", "Presentation body", 4, 22, "dynamic", ["manual", "json", "rss"], "", "text", true)]
  ),
  template(
    "status-display",
    "Status display",
    "Compact operational status board.",
    "status",
    ["STATUS", "", "SYSTEM", "LINK", "UPDATED"],
    [region("status-lines", "Status lines", 2, 20, "editable", ["json", "manual"], "No status")]
  ),
  template(
    "subtitle-newsflash",
    "Subtitle newsflash",
    "Newsflash layout with a protected bottom ticker row.",
    "ticker",
    ["NEWSFLASH"],
    [
      region(
        "bottom-ticker",
        "Bottom ticker",
        24,
        24,
        "ticker",
        ["rss", "atom", "json", "text", "manual"],
        "No ticker items"
      )
    ]
  ),
  template(
    "pixel-art-canvas",
    "Pixel art canvas",
    "Mostly blank canvas for mosaic and DRCS artwork.",
    "art",
    ["PIXEL ART"],
    [region("artwork", "Artwork", 2, 23, "editable", ["manual"], "")]
  ),
  template(
    "carousel-page",
    "Carousel page",
    "Subpage carousel starter layout.",
    "carousel",
    ["CAROUSEL", "", "SUBPAGE 1"],
    [region("carousel-body", "Carousel body", 3, 22, "editable", ["manual"], "")]
  )
];

export function getBuiltInTemplate(templateId: string): Template | undefined {
  return BUILT_IN_TEMPLATES.find((templateItem) => templateItem.id === templateId);
}
