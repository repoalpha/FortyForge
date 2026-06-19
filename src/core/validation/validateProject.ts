import type { Project } from "../model/types";
import { parsePageAddress } from "../standards/pageAddress";
import type { ValidationIssue, ValidationLocation, ValidationScope } from "./types";

const EXPECTED_ROW_COUNT = 25;
const EXPECTED_COLUMN_COUNT = 40;

function issue(
  id: string,
  scope: ValidationScope,
  message: string,
  recommendation: string,
  location?: ValidationLocation
): ValidationIssue {
  return {
    id,
    scope,
    severity: "error",
    message,
    recommendation,
    location,
    affectedExportProfiles: []
  };
}

export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const service of project.services) {
    const seenPageAddresses = new Map<string, string>();

    for (const page of service.pages) {
      const pageLocation = { serviceId: service.id, pageId: page.id };
      const parsedAddress = parsePageAddress(page.pageNumber);

      if (!parsedAddress) {
        issues.push(
          issue(
            "invalid-page-address",
            "page",
            `Page ${page.pageNumber} is not a valid teletext page address.`,
            "Use a three-character address from 100 to 8FF.",
            pageLocation
          )
        );
      } else {
        const normalizedAddress = parsedAddress.pageNumber;
        const existingPageId = seenPageAddresses.get(normalizedAddress);

        if (existingPageId) {
          issues.push(
            issue(
              "duplicate-page-address",
              "page",
              `Page address ${normalizedAddress} is used more than once in service ${service.name}.`,
              "Give each page in a service a unique page address.",
              pageLocation
            )
          );
        } else {
          seenPageAddresses.set(normalizedAddress, page.id);
        }
      }

      for (const subpage of page.subpages) {
        const subpageLocation = {
          serviceId: service.id,
          pageId: page.id,
          subpageId: subpage.id
        };

        if (subpage.rows.length !== EXPECTED_ROW_COUNT) {
          issues.push(
            issue(
              "subpage-row-count",
              "subpage",
              `Subpage ${subpage.subcode} has ${subpage.rows.length} rows.`,
              `Keep exportable subpages at ${EXPECTED_ROW_COUNT} rows.`,
              subpageLocation
            )
          );
        }

        for (const row of subpage.rows) {
          const rowLocation = {
            ...subpageLocation,
            rowIndex: row.index
          };

          if (row.index < 0 || row.index >= EXPECTED_ROW_COUNT) {
            issues.push(
              issue(
                "row-index-range",
                "row",
                `Row index ${row.index} is outside the 0-24 teletext range.`,
                "Use row indexes from 0 to 24.",
                rowLocation
              )
            );
          }

          if (row.cells.length !== EXPECTED_COLUMN_COUNT) {
            issues.push(
              issue(
                "row-cell-count",
                "row",
                `Row ${row.index} has ${row.cells.length} cells.`,
                `Keep each row at exactly ${EXPECTED_COLUMN_COUNT} cells.`,
                rowLocation
              )
            );
          }
        }
      }
    }
  }

  for (const glyphSet of project.glyphSets) {
    for (const glyph of glyphSet.glyphs) {
      const expectedPixels = glyph.width * glyph.height;

      if (glyph.pixels.length !== expectedPixels) {
        issues.push(
          issue(
            "glyph-pixel-count",
            "project",
            `Glyph ${glyph.id} has ${glyph.pixels.length} pixels; expected ${expectedPixels}.`,
            "Match glyph pixel data length to width times height.",
            { serviceId: glyphSet.id }
          )
        );
      }
    }
  }

  for (const exportProfile of project.exportProfiles) {
    if (exportProfile.targetFormats.length === 0) {
      issues.push({
        ...issue(
          "export-profile-targets",
          "export",
          `Export profile ${exportProfile.name} has no target formats.`,
          "Add at least one target format to every export profile."
        ),
        affectedExportProfiles: [exportProfile.id]
      });
    }
  }

  return issues;
}
