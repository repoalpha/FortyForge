import type { Cell, Project, TeletextRow } from "./types";
import {
  createCitynewsCompactMastheadAlphabet,
  createCitynewsMastheadAlphabet
} from "../mosaicAlphabet/devPixelcastAlphabet";

const ROW_COUNT = 25;
const COLUMN_COUNT = 40;
const SPACE_BYTE = 0x20;

function createEmptyCell(column: number): Cell {
  return {
    column,
    kind: "empty",
    byte: SPACE_BYTE,
    annotations: []
  };
}

function createEmptyRow(index: number): TeletextRow {
  return {
    index,
    cells: Array.from({ length: COLUMN_COUNT }, (_, columnIndex) =>
      createEmptyCell(columnIndex)
    ),
    locked: false,
    label: index === 0 ? "Header" : `Row ${index}`
  };
}

export function createDefaultProject(now = new Date("2026-06-20T00:00:00.000Z")): Project {
  const timestamp = now.toISOString();

  return {
    schemaVersion: "1.0.0",
    appVersion: "0.1.0",
    metadata: {
      id: "project-default",
      title: "Untitled FortyForge Service",
      description: "A new pi-teletext service project.",
      createdAt: timestamp,
      updatedAt: timestamp,
      author: "",
      tags: [],
      sourceReferences: []
    },
    services: [
      {
        id: "service-default",
        name: "Default Service",
        defaultPresentationLevel: "1",
        defaultLanguage: {
          id: "en",
          label: "English",
          primaryG0: "Latin"
        },
        pages: [
          {
            id: "page-100",
            magazine: 1,
            pageNumber: "100",
            title: "Index",
            subpages: [
              {
                id: "page-100-subpage-0000",
                subcode: "0000",
                rows: Array.from({ length: ROW_COUNT }, (_, rowIndex) =>
                  createEmptyRow(rowIndex)
                ),
                enhancementPackets: [],
                glyphReferences: [],
                carousel: {
                  enabled: false,
                  delaySeconds: 8,
                  priority: "normal"
                }
              }
            ],
            contentBindings: [],
            metadata: {
              description: "Default index page.",
              tags: [],
              publicationState: "draft",
              targetPresentationLevel: "1",
              header: {
                clockMode: "local"
              }
            },
            links: []
          }
        ],
        navigation: {
          fastextLinks: [],
          topEnabled: false
        },
        settings: {
          defaultExportProfileId: "export-native",
          rowCount: ROW_COUNT,
          columnCount: COLUMN_COUNT
        }
      }
    ],
    templates: [],
    mosaicAlphabets: [
      createCitynewsMastheadAlphabet(),
      createCitynewsCompactMastheadAlphabet()
    ],
    artworkBlocks: [],
    glyphSets: [],
    contentSources: [],
    contentSnapshots: [],
    exportProfiles: [
      {
        id: "export-native",
        name: "Native FortyForge project",
        targetFormats: ["pttx"],
        presentationLevel: "1"
      }
    ],
    transmissionProfiles: [
      {
        id: "transmission-local",
        name: "Local packet preview",
        kind: "packet-stream",
        maxPayloadBytes: 42,
        supportsDelta: false,
        supportsCompression: false,
        integrity: "crc32",
        scheduling: "manual"
      }
    ]
  };
}
