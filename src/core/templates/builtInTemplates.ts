import type { Cell, Template, TemplateCategory, TemplateRegion, TeletextRow } from "../model/types";

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
  fallbackText: string
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
    fallbackText
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
  return {
    id,
    name,
    description,
    category,
    targetPresentationLevel: "1",
    rows: createRows(lines),
    regions
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
      "FORTYFORGE INDEX",
      "FORTYFORGE  PAGE 100",
      "",
      "101 NEWS",
      "102 WEATHER",
      "103 CLUB INFO",
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
    ["ARTICLE", "HEADLINE", "", "BODY COPY STARTS HERE"],
    [
      region(
        "main-content",
        "Main content",
        3,
        21,
        "dynamic",
        ["rss", "atom", "json", "text", "manual"],
        "No current stories"
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
        "Weather unavailable"
      )
    ]
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
