import { createDefaultProject } from "../model/projectFactory";
import type { Cell, Project, TeletextRow } from "../model/types";
import { getControlCodeByByte } from "../standards/controlCodes";
import { g0CharacterForLevel1Byte } from "../standards/g0Charset";
import { parsePageAddress } from "../standards/pageAddress";
import { decodeX26TtiPayload } from "../exporters/x26";

function cellFromByte(column: number, byte: number): Cell {
  const controlCode = byte < 0x20 ? getControlCodeByByte(byte) : undefined;

  if (controlCode) {
    return {
      column,
      kind: "control",
      byte,
      controlCode,
      annotations: []
    };
  }

  if (byte === 0x20) {
    return {
      column,
      kind: "empty",
      byte: 0x20,
      annotations: []
    };
  }

  return {
    column,
    kind: "character",
    byte,
    character: {
      value: g0CharacterForLevel1Byte(byte),
      charset: "G0"
    },
    annotations: []
  };
}

const TTI_ESCAPE = 0x1b;

function decodeTtiRow(value: string): number[] {
  const bytes: number[] = [];

  for (let index = 0; index < value.length && bytes.length < 40; index += 1) {
    const byte = value.charCodeAt(index);

    if (byte === TTI_ESCAPE && index + 1 < value.length) {
      const escaped = value.charCodeAt(index + 1);

      if (escaped >= 0x40 && escaped <= 0x5f) {
        bytes.push(escaped & 0x1f);
        index += 1;
        continue;
      }
    }

    bytes.push(byte >= 0x80 && byte <= 0x9f ? byte & 0x1f : byte & 0x7f);
  }

  return bytes.concat(Array.from({ length: Math.max(0, 40 - bytes.length) }, () => 0x20));
}

function rowFromText(index: number, value: string): TeletextRow {
  const bytes = decodeTtiRow(value);

  return {
    index,
    cells: Array.from({ length: 40 }, (_, column) =>
      cellFromByte(column, bytes[column])
    ),
    locked: false,
    label: index === 0 ? "Header" : `Row ${index}`
  };
}

export function importTti(input: string): Project {
  const project = createDefaultProject();
  const page = project.services[0].pages[0];
  const subpage = page.subpages[0];
  const importedRows = new Map<number, TeletextRow>();

  page.metadata.header.clockMode = "original";

  for (const line of input.split(/\r?\n/)) {
    if (line.startsWith("DE,")) {
      page.title = line.slice(3);
      continue;
    }

    if (line.startsWith("PN,")) {
      const pageNumber = line.slice(3, 6).toUpperCase();
      const parsedAddress = parsePageAddress(pageNumber);

      if (parsedAddress) {
        page.pageNumber = parsedAddress.pageNumber;
        page.magazine = parsedAddress.magazine;
      }
      continue;
    }

    if (line.startsWith("SC,")) {
      subpage.subcode = line.slice(3) || "0000";
      continue;
    }

    if (line.startsWith("OL,")) {
      const firstComma = line.indexOf(",");
      const secondComma = line.indexOf(",", firstComma + 1);
      const rowIndex = Number(line.slice(firstComma + 1, secondComma));
      const payload = line.slice(secondComma + 1);

      if (rowIndex === 26) {
        subpage.enhancementPackets.push(
          decodeX26TtiPayload(payload, `imported-x26-${subpage.enhancementPackets.length}`)
        );
        continue;
      }

      if (Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < 25) {
        importedRows.set(rowIndex, rowFromText(rowIndex, payload));
      }
    }
  }

  subpage.rows = Array.from({ length: 25 }, (_, index) =>
    importedRows.get(index) ?? rowFromText(index, "")
  );

  return project;
}
