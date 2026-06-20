import type { CSSProperties } from "react";

import type { ControlCode } from "../../core";
import { LEVEL_1_CONTROL_CODES } from "../../core";
import type { EditorTool } from "./TeletextCanvas";
import {
  LEVEL_1_CSS_COLOURS,
  contrastColourForLevel1
} from "../preview/teletextColours";

interface ControlPaletteProps {
  activeTool: EditorTool;
  disabled: boolean;
  onBackgroundSelect: (colourIndex: number) => void;
  onControlSelect: (byte: number) => void;
}

const PALETTE_CATEGORIES = ["colour", "graphics", "background", "size"] as const;
const LEVEL_1_COLOUR_NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white"
] as const;

function controlStyle(control: ControlCode): CSSProperties | undefined {
  if (control.category !== "colour" && control.category !== "graphics") {
    return undefined;
  }

  const colourIndex = control.category === "colour" ? control.byte : control.byte - 0x10;
  const background = LEVEL_1_CSS_COLOURS[colourIndex] ?? "#202830";

  return {
    backgroundColor: background,
    borderColor: background,
    color: contrastColourForLevel1(background)
  };
}

export function ControlPalette({
  activeTool,
  disabled,
  onBackgroundSelect,
  onControlSelect
}: ControlPaletteProps) {
  const controls = LEVEL_1_CONTROL_CODES.filter((control) =>
    PALETTE_CATEGORIES.includes(control.category as (typeof PALETTE_CATEGORIES)[number])
  );

  const groupedControls = controls.reduce<Record<string, ControlCode[]>>((groups, control) => {
    groups[control.category] = [...(groups[control.category] ?? []), control];
    return groups;
  }, {});

  return (
    <section>
      <h2>Control codes</h2>
      <p className="section-note">
        Insert visible ETSI control bytes into the selected cell.
      </p>
      <div className="control-groups">
        {PALETTE_CATEGORIES.map((category) => (
          <div className="control-group" key={category}>
            <h3>{category}</h3>
            <div className="control-list">
              {category === "background"
                ? LEVEL_1_COLOUR_NAMES.map((colourName, colourIndex) => {
                    const background = LEVEL_1_CSS_COLOURS[colourIndex] ?? "#202830";

                    return (
                      <button
                        disabled={disabled}
                        key={`background-${colourName}`}
                        onClick={() => onBackgroundSelect(colourIndex)}
                        style={{
                          backgroundColor: background,
                          borderColor: background,
                          color: contrastColourForLevel1(background)
                        }}
                        title={`Insert ${colourName} background control sequence`}
                        type="button"
                      >
                        Background {colourName}
                      </button>
                    );
                  })
                : null}
              {(groupedControls[category] ?? []).map((control) => (
                <button
                  disabled={disabled || (control.category === "graphics" && activeTool !== "mosaic")}
                  key={control.id}
                  onClick={() => onControlSelect(control.byte)}
                  style={controlStyle(control)}
                  title={`${control.mnemonic} byte ${control.byte}`}
                  type="button"
                >
                  {control.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
