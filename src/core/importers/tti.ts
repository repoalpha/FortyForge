import { createDefaultProject } from "../model/projectFactory";
import type { Cell, Project, TeletextRow } from "../model/types";
import { getControlCodeByByte } from "../standards/controlCodes";
import { parsePageAddress } from "../standards/pageAddress";

function cellFromCharacter(column: number, value: string): Cell {
  const byte = value.charCodeAt(0);
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

  if (value === " ") {
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
      value,
      charset: "G0"
    },
    annotations: []
  };
}

function rowFromText(index: number, value: string): TeletextRow {
  const text = value.padEnd(40, " ").slice(0, 40);

  return {
    index,
    cells: Array.from({ length: 40 }, (_, column) =>
      cellFromCharacter(column, text[column])
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

      if (Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < 25) {
        importedRows.set(rowIndex, rowFromText(rowIndex, line.slice(secondComma + 1)));
      }
    }
  }

  subpage.rows = Array.from({ length: 25 }, (_, index) =>
    importedRows.get(index) ?? rowFromText(index, "")
  );

  return project;
}
