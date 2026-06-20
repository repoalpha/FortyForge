import type { CSSProperties } from "react";

import type { ControlCode } from "../../core";
import { LEVEL_1_CONTROL_CODES } from "../../core";

interface ControlPaletteProps {
  disabled: boolean;
  onControlSelect: (byte: number) => void;
}

const PALETTE_CATEGORIES = ["colour", "graphics", "background", "size"] as const;
const LEVEL_1_COLOURS = [
  "#000000",
  "#e00000",
  "#00d000",
  "#d0d000",
  "#0000e0",
  "#d000d0",
  "#00d0d0",
  "#ffffff"
];

function contrastColour(background: string): string {
  return background === "#d0d000" || background === "#00d000" || background === "#00d0d0" || background === "#ffffff"
    ? "#101214"
    : "#ffffff";
}

function controlStyle(control: ControlCode): CSSProperties | undefined {
  if (control.category !== "colour" && control.category !== "graphics") {
    return undefined;
  }

  const colourIndex = control.category === "colour" ? control.byte : control.byte - 0x10;
  const background = LEVEL_1_COLOURS[colourIndex] ?? "#202830";

  return {
    backgroundColor: background,
    borderColor: background,
    color: contrastColour(background)
  };
}

export function ControlPalette({ disabled, onControlSelect }: ControlPaletteProps) {
  const controls = LEVEL_1_CONTROL_CODES.filter((control) =>
    PALETTE_CATEGORIES.includes(control.category as (typeof PALETTE_CATEGORIES)[number])
  );

  const groupedControls = controls.reduce<Record<string, ControlCode[]>>((groups, control) => {
    groups[control.category] = [...(groups[control.category] ?? []), control];
    return groups;
  }, {});

  return (
    <section>
      <h2>Control palette</h2>
      <p className="section-note">
        Insert visible ETSI control bytes into the selected cell.
      </p>
      <div className="control-groups">
        {PALETTE_CATEGORIES.map((category) => (
          <div className="control-group" key={category}>
            <h3>{category}</h3>
            <div className="control-list">
              {(groupedControls[category] ?? []).map((control) => (
                <button
                  disabled={disabled}
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
